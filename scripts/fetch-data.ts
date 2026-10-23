import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pLimit from "p-limit";
import { ALL_SPECS, metricForRole } from "../src/data/specs.js";
import {
	collectionMessages,
	deferredCollectionWarning,
	retainedCooldownReason,
} from "../src/lib/collection-messages.js";
import type { Region } from "../src/lib/regions.js";
import type {
	CharacterData,
	CharacterSpecData,
	GearData,
	LogData,
	MythicPlusData,
	MythicPlusRun,
	RaidParse,
	Snapshot,
	TitleCutoff,
} from "../src/types/snapshot.js";
import {
	collect,
	combineCollectionStatuses,
	countCollections,
	recordCached,
	recordDeferral,
	recordIssue,
	recordRequest,
	retain,
} from "./collection-status.js";
import {
	type CharacterConfig,
	type CharactersConfig,
	validateConfig,
} from "./config-validation.js";
import { dashboardCharacter, dashboardSnapshot } from "./dashboard-snapshot.js";
import { fetchRaidPatchMetadata, mergeRaidPatchMetadata } from "./raid-patch-metadata.js";
import {
	type GraphqlError,
	deferredRaidPerformance,
	failedRaidPerformance,
	fetchRaidPerformance,
	verifyRaidMetricSchema,
} from "./raid-performance.js";
import { toRealmSlug } from "./realm-slug.js";
import { readRefreshSchedule } from "./refresh-policy.js";
import { freshStatus, runCharacterBatches } from "./refresh-scheduler.js";
import { wclQueryCache } from "./wcl-query-cache.js";
import {
	WCL_POLICY,
	WclDeferredError,
	type WclRuntimeState,
	snapshotCooldown,
	wclRuntime,
	withPointBudget,
} from "./wcl-runtime.js";
import { wclTransport } from "./wcl-transport.js";

const WCL_TOKEN_URL = "https://www.warcraftlogs.com/oauth/token";
const WCL_API_URL = "https://www.warcraftlogs.com/api/v2/client";
const RIO_BASE_URL = "https://raider.io/api/v1";
const zoneNames = new Map<number, string>();
const requestLimit = pLimit(6);
function httpFetch(url: string, init?: RequestInit): Promise<Response> {
	return requestLimit(() => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }));
}

// ── WCL raw response shapes ────────────────────────────────

interface WclZone {
	id: number;
	name: string;
	frozen: boolean;
	encounters?: Array<{ id: number; name: string }>;
}

// ── Config reading ─────────────────────────────────────────

function loadConfig(): CharactersConfig {
	// Use process.cwd() so this works both when run directly and in test environments
	const configPath = new URL("../characters.config.json", import.meta.url);
	return JSON.parse(readFileSync(configPath, "utf-8")) as CharactersConfig;
}
// ── HTTP helpers ────────────────────────────────────────────

/**
 * Wraps a fetch call in retry-with-exponential-backoff.
 * Retries on HTTP 429, 500, 502, 503, 504, and network errors.
 * Does NOT retry on 400, 401, 403, 404.
 *
 * @param fn - Async function that performs the fetch
 * @param label - Label for log messages
 * @returns The resolved value of fn
 * @throws After 3 failed attempts
 */
async function retry<T>(fn: () => Promise<T>, label: string): Promise<T> {
	const retryableStatuses = new Set([429, 500, 502, 503, 504]);
	const delays = [1000, 3000, 9000];

	let lastError: Error = new Error("Unknown error");
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			const statusMatch = lastError.message.match(/HTTP (\d+)/);
			if (statusMatch) {
				const status = Number(statusMatch[1]);
				if (!retryableStatuses.has(status)) {
					throw lastError;
				}
			}
			const delay = delays[attempt];
			if (attempt < 2 && delay !== undefined) {
				console.warn(`  ↻ ${label} failed (attempt ${attempt + 1}/3), retrying in ${delay}ms…`);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}
	throw lastError;
}

// ── WCL API ─────────────────────────────────────────────────

/**
 * Fetches a WarcraftLogs OAuth2 bearer token using the client_credentials flow.
 *
 * @returns Bearer token string
 * @throws If credentials are missing or the token exchange fails
 */
export async function getWclToken(): Promise<string> {
	const clientId = process.env.WCL_CLIENT_ID;
	const clientSecret = process.env.WCL_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error("WCL_CLIENT_ID and WCL_CLIENT_SECRET environment variables are required");
	}

	const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
	const response = await wclTransport.request(WCL_TOKEN_URL, {
		method: "POST",
		headers: {
			Authorization: `Basic ${credentials}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
	});

	const data = (await response.json()) as { access_token: string };
	return data.access_token;
}

/**
 * Executes a WarcraftLogs GraphQL query.
 * Handles partial data+errors responses: logs errors but returns data if present.
 *
 * @param token - Bearer token
 * @param query - GraphQL query string
 * @param variables - Query variables
 * @returns The `data` object from the GraphQL response
 * @throws On HTTP failure or when GraphQL returns errors with no data
 */
async function wclQuery<T = Record<string, unknown>>(
	token: string,
	query: string,
	variables?: Record<string, unknown>,
	onErrors?: (errors: GraphqlError[]) => void,
): Promise<T> {
	if (wclRuntime.active) {
		const cached = wclQueryCache.get(query, variables, wclRuntime.stage);
		if (cached) {
			wclRuntime.telemetry.cacheHits++;
			recordCached(cached.at);
			return cached.data as T;
		}
	}
	let recorded = false;
	try {
		const weight = Math.max(
			1,
			(query.match(/(?:zoneRankings|encounterRankings)\s*\(/g) ?? []).length,
		);
		const stage = wclRuntime.stage;
		const res = await wclTransport.request(
			WCL_API_URL,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: wclRuntime.active ? withPointBudget(query) : query,
					variables,
				}),
			},
			wclRuntime.active
				? {
						beforeSend: () => {
							wclRuntime.setStage(stage);
							wclRuntime.beforeQuery(weight);
						},
						afterResponse: async (response) => {
							try {
								const body = (await response.json()) as { data?: { collectorBudget?: unknown } };
								wclRuntime.observeBudget(body.data?.collectorBudget);
							} catch {
								wclRuntime.observeBudget(undefined);
							}
						},
					}
				: undefined,
		);

		const json = (await res.json()) as {
			data?: T;
			errors?: GraphqlError[];
		};
		// Telemetry-only field errors do not invalidate otherwise valid character data.
		if (json.errors?.some((error) => error.path?.[0] === "collectorBudget")) {
			json.errors = json.errors.filter((error) => error.path?.[0] !== "collectorBudget");
			console.warn("::warning::WCL point telemetry unavailable; no numeric budget assumed");
		}

		if (json.errors && json.errors.length > 0) {
			console.warn("WCL partial response errors", json.errors);
			onErrors?.(json.errors);
			recordRequest(true, collectionMessages.partialResponse);
			recorded = true;
			if (!json.data) {
				throw new Error("WCL GraphQL returned errors with no data");
			}
		}
		if (!json.data) throw new Error("WCL GraphQL returned no data");
		if (wclRuntime.active && !json.errors?.length)
			wclQueryCache.put(query, variables, stage, json.data as Record<string, unknown>);
		if (!recorded) recordRequest();
		return json.data as T;
	} catch (err) {
		if (err instanceof WclDeferredError) {
			if (err.attempted && !recorded) recordRequest(true, err.message);
			recordDeferral(err.message, err.retryAt);
			throw err;
		}
		console.warn("WCL query failed", err);
		if (!recorded) recordRequest(true, collectionMessages.wclFailed);
		throw err;
	}
}

/**
 * Returns the ID of the current raid tier zone.
 *
 * Strategy:
 * 1. Query all zones.
 * 2. Filter to non-frozen zones (frozen === false).
 * 3. If WCL_CURRENT_RAID_HINT is set, prefer the zone whose name contains the hint.
 * 4. Otherwise return the highest ID among non-frozen zones.
 * 5. Logs the chosen zone name and ID.
 *
 * @param token - WarcraftLogs bearer token
 * @returns Numeric zone ID of the current raid tier
 * @throws If no active raid zone is found
 */
export async function getCurrentRaidZoneId(token: string): Promise<number> {
	const pinnedId = process.env.WCL_CURRENT_RAID_ZONE_ID
		? Number(process.env.WCL_CURRENT_RAID_ZONE_ID)
		: null;

	const data = await wclQuery<{ worldData: { zones: WclZone[] } }>(
		token,
		"{ worldData { zones { id name frozen } } }",
	);

	const zones = data.worldData.zones;

	if (pinnedId !== null) {
		const pinned = zones.find((z) => z.id === pinnedId);
		if (!pinned) throw new Error(`WCL_CURRENT_RAID_ZONE_ID ${pinnedId} not found in zone list`);
		console.log(`✓ Raid zone (pinned): "${pinned.name}" (ID ${pinned.id})`);
		return pinned.id;
	}

	const hint = process.env.WCL_CURRENT_RAID_HINT;

	// Filter to non-frozen, non-M+, non-PTR zones
	const candidates = zones.filter(
		(z) => z.frozen === false && !z.name.includes("Mythic+") && !z.name.includes("(PTR)"),
	);

	if (candidates.length === 0) {
		throw new Error("No non-frozen raid zones found on WarcraftLogs");
	}

	let chosen: WclZone;
	if (hint) {
		const hinted = candidates.find((z) => z.name.toLowerCase().includes(hint.toLowerCase()));
		if (!hinted) {
			console.warn(
				`  WCL_CURRENT_RAID_HINT "${hint}" matched no zone — falling back to highest ID`,
			);
		}
		chosen = hinted ?? candidates.reduce((a, b) => (b.id > a.id ? b : a));
	} else {
		chosen = candidates.reduce((a, b) => (b.id > a.id ? b : a));
	}

	console.log(`✓ Raid zone: "${chosen.name}" (ID ${chosen.id})`);
	return chosen.id;
}

/**
 * Returns the ID of the current Mythic+ season zone.
 *
 * Strategy mirrors getCurrentRaidZoneId:
 * 1. Query worldData.zones.
 * 2. Filter to non-frozen zones whose name contains "Mythic+".
 * 3. If WCL_CURRENT_MPLUS_HINT is set, prefer matching zone.
 * 4. Otherwise pick the highest-ID match.
 * 5. Logs the chosen zone name and ID.
 *
 * @param token - WarcraftLogs bearer token
 * @returns Numeric zone ID of the current M+ season
 * @throws If no active M+ season zone is found
 */
export async function getCurrentMplusZoneId(token: string): Promise<number> {
	const data = await wclQuery<{ worldData: { zones: WclZone[] } }>(
		token,
		"{ worldData { zones { id name frozen } } }",
	);

	const zones = data.worldData.zones;
	const hint = process.env.WCL_CURRENT_MPLUS_HINT;

	const candidates = zones.filter((z) => z.frozen === false && z.name.includes("Mythic+"));

	if (candidates.length === 0) {
		throw new Error("No non-frozen Mythic+ season zone found on WarcraftLogs");
	}

	let chosen: WclZone;
	if (hint) {
		const hinted = candidates.find((z) => z.name.toLowerCase().includes(hint.toLowerCase()));
		chosen = hinted ?? candidates.reduce((a, b) => (b.id > a.id ? b : a));
	} else {
		chosen = candidates.reduce((a, b) => (b.id > a.id ? b : a));
	}

	console.log(`✓ M+ zone: "${chosen.name}" (ID ${chosen.id})`);
	return chosen.id;
}

/**
 * Fetches the list of encounters for the current raid zone.
 *
 * @param token - WarcraftLogs bearer token
 * @param zoneId - Numeric zone ID from getCurrentRaidZoneId
 * @returns Array of encounter objects with id and name
 * @throws If the zone has no encounters
 */
async function getRaidEncounters(
	token: string,
	zoneId: number,
): Promise<Array<{ id: number; name: string }>> {
	const data = await wclQuery<{
		worldData: { zone: { name: string; encounters: Array<{ id: number; name: string }> } };
	}>(
		token,
		`query GetZoneEncounters($zoneId: Int!) {
      worldData {
        zone(id: $zoneId) {
          name
          encounters { id name }
        }
      }
    }`,
		{ zoneId },
	);

	const encounters = data.worldData.zone.encounters;
	zoneNames.set(zoneId, data.worldData.zone.name);
	if (!encounters || encounters.length === 0) {
		throw new Error(`No encounters found for zone ${zoneId}`);
	}

	console.log(
		`✓ Found ${encounters.length} encounters in zone ${zoneId}: ${encounters.map((e) => e.name).join(", ")}`,
	);
	return encounters;
}

// ── Raider.IO API ───────────────────────────────────────────

interface RioProfileResponse {
	name: string;
	race: string;
	class: string;
	active_spec_name: string;
	active_spec_role: string;
	gender: string;
	faction: string;
	achievement_points: number;
	honorable_kills: number;
	thumbnail_url: string;
	region: string;
	realm: string;
	last_crawled_at: string;
	profile_url: string;
	mythic_plus_scores_by_season?: Array<{
		season: string;
		scores: {
			all: number;
			dps: number;
			healer: number;
			tank: number;
			spec_0: number;
			spec_1: number;
			spec_2: number;
			spec_3: number;
		};
		segments: {
			all: { score: number; color: string };
			dps: { score: number; color: string };
			healer: { score: number; color: string };
			tank: { score: number; color: string };
			spec_0: { score: number; color: string };
			spec_1: { score: number; color: string };
			spec_2: { score: number; color: string };
			spec_3: { score: number; color: string };
		};
	}>;
	mythic_plus_ranks?: {
		overall: { realm: number; region: number; world: number };
		class: { realm: number; region: number; world: number };
		spec_0?: { realm: number; region: number; world: number };
		spec_1?: { realm: number; region: number; world: number };
		spec_2?: { realm: number; region: number; world: number };
		spec_3?: { realm: number; region: number; world: number };
	};
	mythic_plus_best_runs?: RioRun[];
	gear?: {
		item_level_equipped: number;
		item_level_total: number;
		artifact_traits_total: number;
		items: Record<string, RioGearItem>;
	};
}

interface RioRun {
	dungeon: string;
	short_name: string;
	mythic_level: number;
	completed_at: string;
	clear_time_ms: number;
	par_time_ms: number;
	num_keystone_upgrades: number;
	map_challenge_mode_id: number;
	zone_id: number;
	score: number;
	affixes: Array<{
		id: number;
		name: string;
		description: string;
		icon: string;
		wowhead_url: string;
	}>;
	url: string;
}

interface RioGearItem {
	item_id: number;
	item_level: number;
	icon: string;
	name: string;
	item_quality: number;
	is_legendary: boolean;
	is_azerite_armor: boolean;
	azerite_powers: unknown[];
	corruption: unknown;
	domination_shards: unknown[];
	enchants: unknown[];
	gems: unknown[];
	bonusLists: number[];
}

interface RioScoreTier {
	score: number;
	rgbHex: string;
}

interface RioTitleCutoff {
	all: {
		score: number;
		updatedAt: string;
		region: string;
	};
}

/**
 * Fetches the M+ score tier colour thresholds from Raider.IO.
 * Used to determine the colour label (e.g. "Hero", "Legend") for a score.
 *
 * @returns Array of score tier breakpoints in descending score order
 */
async function fetchRioScoreTiers(): Promise<RioScoreTier[]> {
	return retry(async () => {
		const res = await httpFetch(`${RIO_BASE_URL}/mythic-plus/score-tiers`);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status} fetching Raider.IO score tiers`);
		}
		return res.json() as Promise<RioScoreTier[]>;
	}, "RIO score tiers");
}

/**
 * Returns the tier label string for a given M+ score.
 * Tiers are checked from highest to lowest; the first match wins.
 */
function getTierLabel(score: number, tiers: RioScoreTier[]): string {
	const labels: Array<[number, string]> = [
		[4000, "Myth"],
		[3200, "Legend"],
		[2800, "Celestial"],
		[2400, "Ethereal"],
		[2000, "Immortal"],
		[1600, "Awakened"],
		[1200, "Keystone Master"],
		[750, "Keystone Hero"],
		[500, "Keystone Conqueror"],
		[250, "Keystone Challenger"],
		[0, "Keystone Initiate"],
	];

	for (const [threshold, label] of labels) {
		if (score >= threshold) return label;
	}
	return "Unranked";
}

/**
 * Discovers the current Raider.IO season slug by fetching a character profile.
 * The `season=current` cutoff endpoint is broken (returns 500), so we derive
 * the slug from the character's own `mythic_plus_scores_by_season` array.
 *
 * @returns Season slug (e.g. "season-mn-1") or null if the lookup fails
 */
async function fetchCurrentRioSeasonSlug(
	name: string,
	realm: string,
	region: string,
): Promise<string | null> {
	try {
		const res = await httpFetch(
			`${RIO_BASE_URL}/characters/profile?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=mythic_plus_scores_by_season:current`,
		);
		if (!res.ok) return null;
		const data = (await res.json()) as {
			mythic_plus_scores_by_season?: Array<{ season: string }>;
		};
		return data.mythic_plus_scores_by_season?.[0]?.season ?? null;
	} catch {
		return null;
	}
}

/**
 * Fetches the EU Keystone Hero title cutoff score from Raider.IO.
 *
 * Uses `p999` (top 0.1%) — the percentile that awards the seasonal Keystone Hero title.
 * The `season=current` endpoint returns 500; the slug is discovered from the character profile.
 *
 * @param seasonSlug - RIO season slug (e.g. "season-mn-1"), or null to skip
 * @returns TitleCutoff object or a fallback with score 0 if unavailable
 */
export async function fetchRioTitleCutoff(
	seasonSlug: string | null,
	region: Region = "eu",
): Promise<TitleCutoff> {
	if (!seasonSlug) {
		console.warn("  No season slug available — skipping title cutoff fetch");
		return { score: 0, percentile: 1, region, updatedAt: new Date().toISOString() };
	}
	try {
		const res = await retry(async () => {
			const r = await httpFetch(
				`${RIO_BASE_URL}/mythic-plus/season-cutoffs?season=${encodeURIComponent(seasonSlug)}&region=${region}`,
			);
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r;
		}, "RIO title cutoff");

		const data = (await res.json()) as {
			cutoffs: {
				updatedAt: string;
				p990: { all: { quantileMinValue: number } }; // top 1% = seasonal title
				p999: { all: { quantileMinValue: number } }; // top 0.1%
			};
		};
		// p990 = top 1% = Umbral Champion title this season
		const score = data.cutoffs?.p990?.all?.quantileMinValue;
		if (score) {
			return {
				score,
				percentile: 1,
				region,
				updatedAt: new Date(data.cutoffs.updatedAt).toISOString(),
			};
		}
	} catch (err) {
		console.warn("  Could not fetch title cutoff:", err);
	}

	return { score: 0, percentile: 1, region, updatedAt: new Date().toISOString() };
}

/**
 * Fetches a character's full Raider.IO profile for a specific spec.
 *
 * @param name - Character name
 * @param realm - Realm display name (will be URL-encoded)
 * @param region - Region code (e.g. "eu")
 * @param specName - Spec name (e.g. "Elemental")
 * @param tiers - Score tier thresholds from fetchRioScoreTiers
 * @param titleCutoff - EU title cutoff from fetchRioTitleCutoff
 * @returns MythicPlusData or null if the character was not found
 */
export async function fetchRioProfile(
	name: string,
	realm: string,
	region: string,
	_specName: string,
	tiers: RioScoreTier[],
	titleCutoff: TitleCutoff,
): Promise<{
	mplus: MythicPlusData | null;
	gear: GearData | null;
	thumbnailUrl?: string;
}> {
	const fields = [
		"mythic_plus_scores_by_season:current",
		"mythic_plus_ranks",
		"mythic_plus_best_runs",
		"gear",
	].join(",");

	try {
		const profile = await retry(async () => {
			const url = `${RIO_BASE_URL}/characters/profile?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=${fields}`;
			const res = await httpFetch(url);
			if (res.status === 404) throw new Error("HTTP 404 character not found");
			if (!res.ok) throw new Error(`HTTP ${res.status} fetching RIO profile`);
			return res.json() as Promise<RioProfileResponse>;
		}, `RIO profile ${name}`);
		if (
			profile.name.normalize("NFC").toLowerCase() !== name.normalize("NFC").toLowerCase() ||
			profile.region.toLowerCase() !== region ||
			toRealmSlug(profile.realm) !== toRealmSlug(realm)
		) {
			throw new Error(
				"Raider.IO response identity/region/realm does not match the requested character",
			);
		}

		const season = profile.mythic_plus_scores_by_season?.[0];
		const scores = season?.scores;
		const segments = season?.segments;
		const ranks = profile.mythic_plus_ranks;

		// Determine which spec index to use for score (spec_0 through spec_3)
		// Raider.IO doesn't give us a direct spec-to-index mapping in the profile,
		// so we use the overall score as the canonical score for each spec.
		const score = scores?.all ?? 0;
		const scoreColor = segments?.all?.color ?? "#ffffff";
		const scoreTierLabel = getTierLabel(score, tiers);

		const bestRuns: MythicPlusRun[] = (profile.mythic_plus_best_runs ?? []).map(mapRioRun);

		const mplus: MythicPlusData = {
			scoreScope: "character-overall",
			season: season?.season,
			score,
			scoreColor,
			scoreTierLabel,
			realmRank: ranks?.overall?.realm ?? 0,
			regionRank: ranks?.overall?.region ?? 0,
			worldRank: ranks?.overall?.world ?? 0,
			titleCutoff,
			bestRuns,
		};

		const gear: GearData | null = profile.gear
			? {
					equippedIlvl: profile.gear.item_level_equipped,
					activeSpecName: profile.active_spec_name,
					items: Object.entries(profile.gear.items ?? {}).map(([slot, item]) => ({
						slot,
						name: item.name,
						ilvl: item.item_level,
						quality: qualityLabel(item.item_quality),
					})),
				}
			: null;
		return { mplus, gear, thumbnailUrl: profile.thumbnail_url };
	} catch (err) {
		console.warn(`  Could not load RIO profile for ${name} (${realm}): ${err}`);
		recordIssue(collectionMessages.rioCharacterFailed);
		return { mplus: null, gear: null };
	}
}

function mapRioRun(run: RioRun): MythicPlusRun {
	return {
		dungeon: run.dungeon,
		shortName: run.short_name,
		keystoneLevel: run.mythic_level,
		completedAt: run.completed_at,
		clearTimeMs: run.clear_time_ms,
		keystoneTimeMs: run.par_time_ms,
		inTime: run.num_keystone_upgrades > 0,
		score: run.score,
		url: run.url,
		affixes: run.affixes?.map((a) => ({
			name: a.name,
			description: a.description,
			iconUrl: a.icon,
		})),
	};
}

function qualityLabel(quality: number): string {
	const labels: Record<number, string> = {
		0: "Poor",
		1: "Common",
		2: "Uncommon",
		3: "Rare",
		4: "Epic",
		5: "Legendary",
		6: "Artifact",
		7: "Heirloom",
	};
	return labels[quality] ?? "Unknown";
}

function rankLabel(percent: number): string {
	if (percent >= 99) return "Legendary";
	if (percent >= 95) return "Epic";
	if (percent >= 75) return "Rare";
	if (percent >= 50) return "Uncommon";
	if (percent >= 25) return "Common";
	return "Poor";
}

// ── Build identifier ──────────────────────────

/** Return a fresh build identifier. */
export function getBuildHash(): string {
	return createHash("sha256")
		.update(new Date().toISOString())
		.update(process.hrtime.bigint().toString())
		.digest("hex")
		.slice(0, 16);
}

// ── Character fetching ──────────────────────────────────────

/**
 * Fetches all data for a single character across all their active specs.
 * Inactive specs are skipped entirely.
 *
 * @param char - Character config entry
 * @param token - WarcraftLogs bearer token
 * @param raidZoneId - Current raid zone ID
 * @param mplusZoneId - Current M+ season zone ID
 * @param rioTiers - Score tier thresholds
 * @param titleCutoff - EU title cutoff
 * @returns CharacterData for the snapshot
 */
export async function fetchCharacter(
	char: CharacterConfig,
	token: string,
	raidZoneId: number,
	_mplusZoneId: number,
	rioTiers: RioScoreTier[],
	titleCutoff: TitleCutoff,
	raidEncounters: Array<{ id: number; name: string }>,
	previous?: CharacterData,
	previousAt?: string,
	supportedRaidMetrics: Array<"dps" | "bossdps" | "hps"> = ["dps", "hps"],
	reuseRaid = false,
): Promise<CharacterData> {
	const activeSpecs = char.specs.filter((s) => s.role !== "inactive");
	const mainSpec =
		activeSpecs.find((s) => s.role === "main") ??
		(char.mainSpecPending ? activeSpecs[0] : undefined);
	if (!mainSpec) throw new Error(`No main spec found for character ${char.name}`);
	const realmSlug = char.realmSlug ?? toRealmSlug(char.realm);

	const specResults = await Promise.allSettled(
		activeSpecs.map(async (specEntry) => {
			const specDef = ALL_SPECS.find(
				(s) => s.specName === specEntry.spec && s.className === char.class,
			);
			if (!specDef) throw new Error(`Unknown spec ${specEntry.spec} for class ${char.class}`);
			const metric = metricForRole(specDef.role);
			const old = previous ? dashboardCharacter(previous).specs[specDef.specSlug] : undefined;
			const [rio, raidPerformance] = await Promise.all([
				collect(
					() =>
						fetchRioProfile(
							char.name,
							realmSlug,
							char.region,
							specEntry.spec,
							rioTiers,
							titleCutoff,
						),
					(data) => data.mplus !== null,
					{ mplus: null, gear: null },
				),
				reuseRaid && old?.raidPerformance
					? Promise.resolve(old.raidPerformance)
					: fetchRaidPerformance(
							(query, variables, onErrors) => wclQuery(token, query, variables, onErrors),
							{ name: char.name, realm: realmSlug, region: char.region },
							raidZoneId,
							specEntry.spec,
							specDef.role === "healer",
							raidEncounters,
							supportedRaidMetrics,
							old?.raidPerformance,
							previousAt,
							!!token,
						),
			]);
			const rioData = retain(
				rio.data,
				rio.status,
				old ? { mplus: old.mythicPlus, gear: old.gear ?? null } : undefined,
				old?.collection?.raiderio,
				previousAt,
				(d) => d.mplus !== null,
			);
			const primaryRaid = raidPerformance[metric];
			const raids = {
				status: combineCollectionStatuses(
					primaryRaid ? Object.values(primaryRaid).map((d) => d.collection) : [],
				),
			};
			const freshRaidParses: RaidParse[] = primaryRaid
				? Object.values(primaryRaid).flatMap((d) =>
						d.rows
							.filter((r) => r.bestPercent !== null)
							.map((r) => ({
								bossName: r.bossName,
								difficulty: d.difficulty,
								bestPercent: r.bestPercent ?? 0,
								ilvlAdjustedPercent: r.bestPercent ?? 0,
								rankLabel: rankLabel(r.bestPercent ?? 0),
								bestAmount: r.bestAmount ?? 0,
							})),
					)
				: [];

			const raidParses = retain(
				freshRaidParses,
				raids.status,
				old?.logs?.raidParses,
				old?.collection?.raid,
				previousAt,
				(d) => d.length > 0,
			);
			const logs: LogData = { raidParses };

			const specData: CharacterSpecData = {
				raidPerformance,
				collection: {
					raiderio: rio.status,
					raid: raids.status,
				},
				specSlug: specDef.specSlug,
				specName: specDef.specName,
				role: specEntry.role as "main" | "offspec" | "tracked",
				mythicPlus: rioData.mplus,
				gear: rioData.gear,
				logs: raidParses.length > 0 ? logs : null,
			};

			return specData;
		}),
	);

	const specsMap: Record<string, CharacterSpecData> = {};
	const specOrder: string[] = [];

	// Main spec first
	const mainSpecDef = ALL_SPECS.find(
		(s) => s.specName === mainSpec.spec && s.className === char.class,
	);
	if (!mainSpecDef) throw new Error(`Could not find specDef for main spec ${mainSpec.spec}`);
	specOrder.push(mainSpecDef.specSlug);

	// Then offspecs in config order
	for (const specEntry of activeSpecs) {
		if (specEntry !== mainSpec) {
			const specDef = ALL_SPECS.find(
				(s) => s.specName === specEntry.spec && s.className === char.class,
			);
			if (specDef) specOrder.push(specDef.specSlug);
		}
	}

	for (let i = 0; i < activeSpecs.length; i++) {
		const specEntry = activeSpecs[i];
		if (!specEntry) continue;
		const specDef = ALL_SPECS.find(
			(s) => s.specName === specEntry.spec && s.className === char.class,
		);
		const result = specResults[i];

		if (!specDef) continue;
		if (result?.status === "fulfilled") {
			specsMap[specDef.specSlug] = result.value;
		} else {
			if (result?.status === "rejected") {
				console.error(`  Failed to fetch spec ${specEntry.spec} for ${char.name}:`, result.reason);
			}
			const old = previous ? dashboardCharacter(previous).specs[specDef.specSlug] : undefined;
			specsMap[specDef.specSlug] = {
				...old,
				raidPerformance: failedRaidPerformance(
					specDef.role === "healer",
					raidEncounters,
					old?.raidPerformance,
					previousAt,
				),
				collection: Object.fromEntries(
					(["raiderio", "raid"] as const).map((key) => [
						key,
						{
							state: "failed",
							attemptedRequests: 0,
							failedRequests: 0,
							issues: [collectionMessages.specFailed],
							retainedAt: old
								? (old.collection?.[key]?.retainedAt ??
									old.collection?.[key]?.lastSuccessAt ??
									previousAt)
								: undefined,
						},
					]),
				) as NonNullable<CharacterSpecData["collection"]>,
				specSlug: specDef.specSlug,
				specName: specDef.specName,
				role: specEntry.role as "main" | "offspec" | "tracked",
				mythicPlus: old?.mythicPlus ?? null,
				logs: old?.logs ?? null,
			};
		}
	}

	// Get thumbnail from main spec RIO profile
	let thumbnailUrl: string | null = null;
	try {
		const thumbRes = await httpFetch(
			`${RIO_BASE_URL}/characters/profile?region=${char.region}&realm=${encodeURIComponent(realmSlug)}&name=${encodeURIComponent(char.name)}&fields=thumbnail_url`,
		);
		if (thumbRes.ok) {
			const thumbData = (await thumbRes.json()) as { thumbnail_url?: string };
			thumbnailUrl = thumbData.thumbnail_url ?? null;
		}
	} catch {
		// non-fatal
	}

	return {
		name: char.name,
		realm: char.realm,
		region: char.region,
		realmSlug,
		mainSpecPending: char.mainSpecPending,
		class: char.class,
		thumbnailUrl,
		isDefault: char.default,
		mainSpecSlug: mainSpecDef.specSlug,
		specOrder,
		specs: specsMap,
	};
}

export function characterShell(char: CharacterConfig, old?: CharacterData): CharacterData {
	const active = char.specs.filter((s) => s.role !== "inactive");
	const main = active.find((s) => s.role === "main") ?? active[0];
	const definitions = active.map((s) => ({
		...s,
		definition: ALL_SPECS.find((d) => d.specName === s.spec && d.className === char.class),
	}));
	const mainSlug = definitions.find((s) => s.spec === main?.spec)?.definition?.specSlug ?? "";
	const specOrder = definitions
		.map((s) => s.definition?.specSlug ?? "")
		.filter(Boolean)
		.sort((a, b) => Number(b === mainSlug) - Number(a === mainSlug));
	return {
		name: char.name,
		realm: char.realm,
		region: char.region,
		realmSlug: char.realmSlug ?? toRealmSlug(char.realm),
		class: char.class,
		mainSpecPending: char.mainSpecPending,
		mainSpecSlug: mainSlug,
		specOrder,
		isDefault: char.default,
		thumbnailUrl: old?.thumbnailUrl ?? null,
		specs: Object.fromEntries(
			definitions
				.filter((s) => s.definition)
				.map((s) => {
					const slug = s.definition?.specSlug ?? "";
					return [
						slug,
						{
							...old?.specs[slug],
							specSlug: slug,
							specName: s.spec,
							role: s.role as "main" | "offspec" | "tracked",
							mythicPlus: old?.specs[slug]?.mythicPlus ?? null,
							logs: old?.specs[slug]?.logs ?? null,
						},
					];
				}),
		),
	};
}

function characterKey(char: CharacterData) {
	return `${char.region}/${char.realmSlug ?? toRealmSlug(char.realm)}/${char.name}`;
}
function allRaidStatuses(char: CharacterData) {
	return Object.values(char.specs).flatMap((s) =>
		Object.values(s.raidPerformance ?? {}).flatMap((m) =>
			Object.values(m).map((d) => d.collection),
		),
	);
}
function coreFresh(char: CharacterData) {
	const expected = Object.values(char.specs).reduce(
		(n, s) => n + (ALL_SPECS.find((d) => d.specSlug === s.specSlug)?.role === "healer" ? 2 : 4),
		0,
	);
	const statuses = allRaidStatuses(char);
	return (
		statuses.length === expected && statuses.every((s) => freshStatus(s, WCL_POLICY.coreTtlMs))
	);
}
export function deferCharacterRaid(
	input: CharacterData,
	encounters: Array<{ id: number; name: string }>,
	at: string | undefined,
	reason: string,
): CharacterData {
	const char = dashboardCharacter(input);
	return {
		...char,
		specs: Object.fromEntries(
			Object.entries(char.specs).map(([slug, spec]) => {
				const healer = ALL_SPECS.find((d) => d.specSlug === slug)?.role === "healer";
				const raidPerformance = deferredRaidPerformance(
					healer,
					encounters,
					spec.raidPerformance,
					at,
					reason,
				);
				const raid = combineCollectionStatuses(
					Object.values(raidPerformance[healer ? "hps" : "dps"] ?? {}).map((d) => d.collection),
				);
				if (!raid.retainedAt && spec.logs?.raidParses.length)
					raid.retainedAt =
						spec.collection?.raid.retainedAt ?? spec.collection?.raid.lastSuccessAt ?? at;
				const skipped = {
					state: "skipped" as const,
					attemptedRequests: 0,
					failedRequests: 0,
					issues: [],
				};
				return [
					slug,
					{
						...spec,
						raidPerformance,
						collection: {
							raiderio: spec.collection?.raiderio ?? skipped,

							raid,
						},
					},
				];
			}),
		),
	};
}

export async function fetchCharacterRaid(
	char: CharacterData,
	token: string,
	zoneId: number,
	encounters: Array<{ id: number; name: string }>,
	supported: Array<"dps" | "bossdps" | "hps">,
	previousAt?: string,
	force = false,
): Promise<CharacterData> {
	const result = { ...char, specs: { ...char.specs } };
	for (const slug of char.specOrder) {
		const old = dashboardCharacter(char).specs[slug];
		if (!old) continue;
		const healer = ALL_SPECS.find((s) => s.specSlug === slug)?.role === "healer";
		let raidPerformance: NonNullable<CharacterSpecData["raidPerformance"]>;
		try {
			raidPerformance = await fetchRaidPerformance(
				(query, variables, onErrors) => wclQuery(token, query, variables, onErrors),
				{ name: char.name, realm: char.realmSlug ?? toRealmSlug(char.realm), region: char.region },
				zoneId,
				old.specName,
				healer,
				encounters,
				supported,
				old.raidPerformance,
				previousAt,
				true,
				force ? 0 : WCL_POLICY.coreTtlMs,
			);
		} catch {
			raidPerformance = failedRaidPerformance(healer, encounters, old.raidPerformance, previousAt);
		}
		const primary = raidPerformance[healer ? "hps" : "dps"];
		const raid = combineCollectionStatuses(Object.values(primary ?? {}).map((d) => d.collection));
		const fresh: RaidParse[] = Object.values(primary ?? {}).flatMap((d) =>
			d.rows
				.filter((r) => r.bestPercent !== null)
				.map((r) => ({
					bossName: r.bossName,
					difficulty: d.difficulty,
					bestPercent: r.bestPercent ?? 0,
					ilvlAdjustedPercent: r.bestPercent ?? 0,
					bestAmount: r.bestAmount ?? 0,
					rankLabel: rankLabel(r.bestPercent ?? 0),
				})),
		);
		const raidParses = retain(
			fresh,
			raid,
			old.logs?.raidParses,
			old.collection?.raid,
			previousAt,
			(d) => d.length > 0,
		);
		const skipped = {
			state: "skipped" as const,
			attemptedRequests: 0,
			failedRequests: 0,
			issues: [],
		};
		result.specs[slug] = {
			...old,
			raidPerformance,
			collection: {
				raiderio: old.collection?.raiderio ?? skipped,

				raid,
			},
			logs: raidParses.length ? { raidParses } : null,
		};
	}
	return result;
}

export async function main(): Promise<void> {
	const rioOnly = process.argv.includes("--raiderio-only");
	const cacheOnly = process.argv.includes("--cache-only");
	const patchesOnly = process.argv.includes("--patch-metadata-only");
	if (patchesOnly && (rioOnly || cacheOnly))
		throw new Error("Patch metadata scope cannot be combined with other collection modes");
	const force = process.argv.includes("--force-refresh");
	const config = loadConfig();
	validateConfig(config);
	let previous: Snapshot | undefined;
	try {
		previous = JSON.parse(readFileSync("cache/last-snapshot.json", "utf8")) as Snapshot;
	} catch {
		/* First run. */
	}
	if (cacheOnly && !previous)
		throw new Error("Cache-only build requires a previous snapshot; no live API requested");
	let state: WclRuntimeState = {};
	try {
		const stored = JSON.parse(readFileSync("cache/wcl-runtime.json", "utf8")) as WclRuntimeState;
		state = {
			cooldownUntil: Number.isFinite(stored.cooldownUntil) ? stored.cooldownUntil : undefined,
			// Older runtime files may contain raw provider errors or UTC text.
			cooldownReason:
				typeof stored.cooldownReason === "string"
					? retainedCooldownReason(stored.cooldownReason, stored.cooldownUntil)
					: undefined,
			nextCharacterKey:
				typeof stored.nextCharacterKey === "string" ? stored.nextCharacterKey : undefined,
			maxQueryCost: stored.maxQueryCost,
			maxCostPerSelection: Number.isFinite(stored.maxCostPerSelection)
				? stored.maxCostPerSelection
				: undefined,
		};
	} catch {
		/* No runtime checkpoint yet. */
	}
	const inheritedCooldown = snapshotCooldown(previous);
	if (inheritedCooldown && inheritedCooldown > (state.cooldownUntil ?? 0)) {
		state.cooldownUntil = inheritedCooldown;
		state.cooldownReason = collectionMessages.previousCooldown;
	}
	const saveRuntime = () => {
		mkdirSync("cache", { recursive: true });
		writeFileSync("cache/wcl-runtime.json", JSON.stringify(wclRuntime.state));
	};
	wclRuntime.activate(state, saveRuntime);
	wclRuntime.setStage("bootstrap");
	const saveQueryCache = () => {
		mkdirSync("cache", { recursive: true });
		writeFileSync("cache/wcl-query-cache.json", JSON.stringify(wclQueryCache.entries));
	};
	try {
		wclQueryCache.activate(
			JSON.parse(readFileSync("cache/wcl-query-cache.json", "utf8")),
			saveQueryCache,
		);
	} catch {
		wclQueryCache.activate({}, saveQueryCache);
	}
	wclQueryCache.bypass = force;
	const requirePatchBudget = () => {
		if (!wclRuntime.currentBudget())
			throw new WclDeferredError("Patch metadata deferred: valid WCL point budget unavailable");
		wclRuntime.beforeQuery();
	};
	if (patchesOnly) {
		try {
			if (!previous?.raid?.id)
				throw new Error(
					"Patch metadata requires the existing real raid snapshot; no character bootstrap requested",
				);
			wclRuntime.assertCooldown();
			const patchToken = await getWclToken();
			const metadata = await fetchRaidPatchMetadata(
				(query, vars, onErrors) => wclQuery(patchToken, query, vars, onErrors),
				previous.raid.id,
				requirePatchBudget,
			);
			const next = dashboardSnapshot(mergeRaidPatchMetadata(previous, metadata, getBuildHash()));
			mkdirSync("cache", { recursive: true });
			mkdirSync("public", { recursive: true });
			mkdirSync("src/data", { recursive: true });
			writeFileSync("cache/last-snapshot.json", JSON.stringify(next));
			writeFileSync("src/data/snapshot.json", JSON.stringify(next, null, 2));
			writeFileSync("public/snapshot.json", JSON.stringify(next));
			writeFileSync("public/build-hash.json", JSON.stringify({ hash: next.buildHash }));
			const report = {
				metadata,
				runtime: wclRuntime.summary,
				characterQueries: 0,
				specMetaQueries: 0,
				originalLogGeneratedAt: previous.generatedAt,
			};
			console.log(`✓ Raid patch metadata only (no credentials): ${JSON.stringify(report)}`);
			if (process.env.GITHUB_STEP_SUMMARY)
				writeFileSync(
					process.env.GITHUB_STEP_SUMMARY,
					`## Official raid patch metadata\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\nCharacter records and their collection timestamps were not refreshed. Schema argument descriptions are retained verbatim; special IDs are not inferred.\n`,
				);
		} finally {
			saveRuntime();
			wclRuntime.active = false;
		}
		return;
	}
	const region = config.characters[0]?.region ?? "kr";
	const compatible = previous?.region === region ? dashboardSnapshot(previous) : undefined;
	let raid = compatible?.raid;
	let mythicPlusZone = compatible?.mythicPlusZone;
	let raidMetricSchema = compatible?.raidMetricSchema;
	let raidPatchMetadata = compatible?.raidPatchMetadata;
	let raidZoneId = compatible?.wclZones?.raid ?? raid?.id ?? 0;
	let mplusZoneId = compatible?.wclZones?.mythicPlus ?? mythicPlusZone?.id ?? 0;
	let initial = config.characters.map((c) =>
		characterShell(
			c,
			compatible?.characters.find(
				(old) =>
					old.name === c.name &&
					old.region === c.region &&
					(old.realmSlug ?? toRealmSlug(old.realm)) === (c.realmSlug ?? toRealmSlug(c.realm)),
			),
		),
	);
	const needsCore = force || initial.some((c) => !coreFresh(c));
	let token = "";
	if (!rioOnly && !cacheOnly && needsCore) {
		try {
			wclRuntime.assertCooldown();
			token = await getWclToken();
			if (
				!raidMetricSchema ||
				force ||
				Date.now() - Date.parse(raidMetricSchema.checkedAt) >= WCL_POLICY.metadataTtlMs
			)
				raidMetricSchema = await verifyRaidMetricSchema((query, vars, onErrors) =>
					wclQuery(token, query, vars, onErrors),
				);
			if (
				!raid ||
				!mythicPlusZone ||
				!raidPatchMetadata ||
				force ||
				Date.now() - Date.parse(raidPatchMetadata?.checkedAt ?? "") >= WCL_POLICY.metadataTtlMs
			) {
				const nextRaid = await getCurrentRaidZoneId(token);
				const nextMplus = await getCurrentMplusZoneId(token);
				const raidEncounters = await getRaidEncounters(token, nextRaid);
				const dungeonEncounters = await getRaidEncounters(token, nextMplus);
				raidZoneId = nextRaid;
				mplusZoneId = nextMplus;
				raid = {
					id: raidZoneId,
					name: zoneNames.get(raidZoneId) ?? `Raid ${raidZoneId}`,
					encounters: raidEncounters,
				};
				mythicPlusZone = {
					id: mplusZoneId,
					name: zoneNames.get(mplusZoneId) ?? `Mythic+ ${mplusZoneId}`,
					encounters: dungeonEncounters,
				};
			}
			// Cache-hit character runs obtain the budget alongside a normal zone identity read, never by re-fetching character tables.
			if (!wclRuntime.currentBudget() && raidZoneId)
				await wclQuery(
					token,
					`query RefreshZoneBudget { worldData { zone(id: ${raidZoneId}) { id } } }`,
				);
			if (
				raidZoneId &&
				(!raidPatchMetadata ||
					raidPatchMetadata.zoneId !== raidZoneId ||
					force ||
					Date.now() - Date.parse(raidPatchMetadata.checkedAt) >= WCL_POLICY.metadataTtlMs)
			) {
				try {
					raidPatchMetadata = await fetchRaidPatchMetadata(
						(query, vars, onErrors) => wclQuery(token, query, vars, onErrors),
						raidZoneId,
						requirePatchBudget,
					);
					console.log(
						`✓ Official raid patches: ${JSON.stringify({ zoneId: raidPatchMetadata.zoneId, partitions: raidPatchMetadata.partitions, schema: raidPatchMetadata.schema })}`,
					);
				} catch (error) {
					console.warn(
						`::warning::Raid patch names unavailable; existing mapping retained: ${error instanceof Error ? error.message : "metadata failed"}`,
					);
				}
			}
		} catch (error) {
			console.warn("WCL initialization failed", error);
			const reason =
				error instanceof WclDeferredError ? error.message : collectionMessages.bootstrapFailed;
			wclRuntime.defer(reason, error instanceof WclDeferredError ? error.retryAt : undefined);
			token = "";
		}
	}
	const zonesMatch =
		compatible?.dataMode === "full" &&
		((!compatible.wclZones &&
			Date.now() - Date.parse(compatible.generatedAt) < 7 * 24 * 60 * 60_000) ||
			(compatible.wclZones?.raid === raidZoneId &&
				compatible.wclZones?.mythicPlus === mplusZoneId));
	if (!zonesMatch && !cacheOnly && !rioOnly)
		initial = initial.map((c) => ({
			...c,
			specs: Object.fromEntries(
				Object.entries(c.specs).map(([slug, s]) => [
					slug,
					{ ...s, logs: null, raidPerformance: undefined, collection: undefined },
				]),
			),
		}));
	if (rioOnly)
		initial = initial.map((c) => ({
			...c,
			specs: Object.fromEntries(
				Object.entries(c.specs).map(([slug, s]) => [
					slug,
					{ ...s, logs: null, raidPerformance: undefined, collection: undefined },
				]),
			),
		}));
	const encounters = raid?.encounters ?? [];
	const snapshot: Snapshot = {
		generatedAt: cacheOnly
			? (previous?.generatedAt ?? new Date().toISOString())
			: new Date().toISOString(),
		buildHash: getBuildHash(),
		// Keep the previous mode for cache/failed bootstrap; a verified WCL bootstrap
		// upgrades public-only data even when its inherited mode was raiderio-only.
		dataMode: rioOnly ? "raiderio-only" : token ? "full" : (compatible?.dataMode ?? "full"),
		region,
		raid,
		mythicPlusZone,
		raidMetricSchema,
		raidPatchMetadata,
		wclZones:
			raidZoneId && mplusZoneId
				? { raid: raidZoneId, mythicPlus: mplusZoneId }
				: compatible?.wclZones,
		characters: initial,
	};
	const useful = () =>
		!!previous ||
		snapshot.characters.some((c) =>
			Object.values(c.specs).some(
				(s) =>
					s.mythicPlus ||
					s.logs ||
					Object.values(s.raidPerformance ?? {}).some((m) =>
						Object.values(m).some((d) => d.rows.some((r) => r.state === "recorded")),
					),
			),
		);
	const checkpoint = (characters?: CharacterData[]) => {
		if (characters) snapshot.characters = characters;
		snapshot.characters = snapshot.characters.map(dashboardCharacter);
		const charactersCount = countCollections(
			snapshot.characters.map((c) =>
				Object.values(c.specs).flatMap((s) => [
					...Object.values(s.collection ?? {}),
					...Object.values(s.raidPerformance ?? {}).flatMap((m) =>
						Object.values(m).map((d) => d.collection),
					),
				]),
			),
		);
		const raidTables = countCollections(
			snapshot.characters.flatMap((c) => allRaidStatuses(c).map((s) => [s])),
		);
		snapshot.collectionSummary = { characters: charactersCount, raidTables };
		snapshot.refreshRuntime = wclRuntime.summary;
		snapshot.refreshSchedule = readRefreshSchedule();
		snapshot.warnings =
			snapshot.dataMode === "raiderio-only" ? [collectionMessages.publicOnly] : [];
		if (charactersCount.partial || charactersCount.failed)
			snapshot.warnings.push(
				collectionMessages.partialWarning(
					charactersCount.partial + charactersCount.failed,
					charactersCount.tracked,
					0,
					0,
				),
			);
		if (wclRuntime.summary.deferredReason)
			snapshot.warnings.push(
				deferredCollectionWarning(
					wclRuntime.summary.deferredReason,
					wclRuntime.state.cooldownUntil,
				),
			);
		saveRuntime();
		if (!useful()) return;
		mkdirSync("cache", { recursive: true });
		mkdirSync("public", { recursive: true });
		mkdirSync("src/data", { recursive: true });
		writeFileSync("cache/last-snapshot.json", JSON.stringify(snapshot));
		writeFileSync("src/data/snapshot.json", JSON.stringify(snapshot, null, 2));
		writeFileSync("public/snapshot.json", JSON.stringify(snapshot));
		writeFileSync("public/build-hash.json", JSON.stringify({ hash: snapshot.buildHash }));
	};
	checkpoint();
	if (!cacheOnly && !rioOnly) {
		wclRuntime.setStage("raid");
		if (token && raidZoneId && encounters.length)
			snapshot.characters = await runCharacterBatches({
				items: snapshot.characters,
				key: characterKey,
				fresh: (c) => !force && coreFresh(c),
				refresh: (c) =>
					fetchCharacterRaid(
						c,
						token,
						raidZoneId,
						encounters,
						raidMetricSchema?.state === "verified" ? raidMetricSchema.supported : ["dps", "hps"],
						compatible?.generatedAt,
						force,
					),
				defer: (c, reason) => deferCharacterRaid(c, encounters, compatible?.generatedAt, reason),
				checkpoint,
				runtime: wclRuntime,
			});
		else
			snapshot.characters = snapshot.characters.map((c) =>
				!force && coreFresh(c)
					? c
					: deferCharacterRaid(
							c,
							encounters,
							compatible?.generatedAt,
							wclRuntime.summary.deferredReason ?? collectionMessages.wclRetained,
						),
			);
		checkpoint();
	}
	if (!cacheOnly) {
		wclRuntime.setStage("detail");
		const first = config.characters.find((c) => c.default) ?? config.characters[0];
		const season = first
			? await fetchCurrentRioSeasonSlug(
					first.name,
					first.realmSlug ?? toRealmSlug(first.realm),
					first.region,
				)
			: null;
		const [tiers, cutoff] = await Promise.all([
			fetchRioScoreTiers(),
			fetchRioTitleCutoff(season, region),
		]);
		for (let i = 0; i < snapshot.characters.length; i++) {
			const old = snapshot.characters[i];
			const c = config.characters[i];
			if (!old || !c) continue;
			snapshot.characters[i] = await fetchCharacter(
				c,
				token,
				raidZoneId,
				mplusZoneId,
				tiers,
				cutoff,
				encounters,
				old,
				compatible?.generatedAt,
				raidMetricSchema?.supported ?? ["dps", "hps"],
				true,
			);
			checkpoint();
		}
	}
	checkpoint();
	if (!useful()) throw new Error("No verified data available; no synthetic snapshot published");
	console.log(`✓ Collection summary: ${JSON.stringify(snapshot.collectionSummary)}`);
	console.log(
		`✓ Runtime budget/HTTP telemetry (no credentials): ${JSON.stringify(wclRuntime.summary)}`,
	);
	if (process.env.GITHUB_STEP_SUMMARY)
		writeFileSync(
			process.env.GITHUB_STEP_SUMMARY,
			`## Collection results\n\n\`\`\`json\n${JSON.stringify({ collection: snapshot.collectionSummary, runtime: wclRuntime.summary }, null, 2)}\n\`\`\`\n\nPoint allowance is taken only from valid API responses. The 20% reserve and cache TTLs are application policies.\n`,
		);
	wclRuntime.active = false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(err);
		process.exitCode = 1;
	});
}
