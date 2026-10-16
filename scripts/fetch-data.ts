import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pLimit from "p-limit";
import { ALL_SPECS, type SpecDefinition, metricForRole } from "../src/data/specs.js";
import { type Region, characterProfileUrl } from "../src/lib/regions.js";
import type {
	CharacterData,
	CharacterSpecData,
	DamageSource,
	DungeonLog,
	GearData,
	LogData,
	MetaItem,
	MythicPlusData,
	MythicPlusLeaderboardEntry,
	MythicPlusMeta,
	MythicPlusRun,
	RaidLeaderboardEntry,
	RaidMeta,
	RaidParse,
	Snapshot,
	SpecMetaData,
	TalentData,
	TitleCutoff,
} from "../src/types/snapshot.js";
import {
	collect,
	combineCollectionStatuses,
	countCollections,
	failed,
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

interface ZoneRankingsRaw {
	bestPerformanceAverage: number | null;
	medianPerformanceAverage: number | null;
	difficulty: number;
	metric: "dps" | "hps";
	partition: number;
	zone: number;
	size: number;
	allStars: AllStarsEntry[];
	rankings: Array<{
		encounter: { id: number; name: string };
		rankPercent: number | null;
		medianPercent: number | null;
		allStars: {
			points: number;
			rank: number | string;
			regionRank: number | string;
			serverRank: number | string;
			rankPercent: number | string;
			total: number;
			possiblePoints: number;
			partition: number;
			rankTooltip?: string;
		} | null;
		lockedIn: boolean;
		totalKills: number;
		fastestKill: number;
		bestAmount: number;
		spec: string | null;
		bestSpec?: string;
		bestRank?: null;
		rankTooltip?: string;
		/** Present when the character has an actual parse for this encounter. */
		report?: { code: string; fightID: number; startTime: number } | null;
	}>;
}

interface AllStarsEntry {
	partition: number;
	spec: string;
	points: number;
	possiblePoints: number;
	rank: number | string;
	regionRank: number | string;
	serverRank: number | string;
	rankPercent: number | string;
	total: number;
}

interface CharacterRankingsRaw {
	page: number;
	hasMorePages: boolean;
	count: number;
	rankings: Array<{
		name: string;
		class: string;
		spec: string;
		amount: number;
		hardModeLevel: number;
		duration: number;
		startTime: number;
		report: { code: string; fightID: number; startTime: number } | null;
		guild: { id: number; name: string; faction: number } | null;
		server: { id: number; name: string; region: "EU" | "US" | "KR" | "CN" | "TW" };
		bracketData: number;
		faction: number;
	}>;
}

interface DamageBreakdownTable {
	data: {
		entries: Array<{
			name: string;
			guid: number;
			type: number;
			total: number;
			abilityIcon: string;
			composite: boolean;
			uptime: number;
			uses: number;
			hitCount: number;
			tickCount: number;
		}>;
		totalTime: number;
		logVersion: number;
		gameVersion: number;
		exploitDetails: unknown[];
	};
}

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

// ── Raid parse date cache ───────────────────────────────────

const DATES_CACHE_PATH = "cache/parse-dates.json";

/**
 * Loads the persisted raid parse date cache.
 * Key: `"CharacterName@Realm-encounterId-difficultyId"` → ISO date string.
 * The cache is stored in `cache/` (gitignored) and persisted between CI runs
 * via `actions/cache`, eliminating redundant encounterRankings queries.
 */
function loadDatesCache(): Record<string, string> {
	try {
		return JSON.parse(readFileSync(DATES_CACHE_PATH, "utf-8")) as Record<string, string>;
	} catch {
		return {};
	}
}

function saveDatesCache(cache: Record<string, string>): void {
	try {
		mkdirSync("cache", { recursive: true });
		writeFileSync(DATES_CACHE_PATH, JSON.stringify(cache, null, 2));
	} catch {
		// non-fatal — next run will re-fetch missing dates
	}
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
			onErrors?.(json.errors);
			recordRequest(true, "WCL GraphQL 부분 응답 오류");
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
		if (!recorded) recordRequest(true, err instanceof Error ? err.message : "WCL 조회 실패");
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
	mythic_plus_recent_runs?: RioRun[];
	mythic_plus_best_runs?: RioRun[];
	gear?: {
		item_level_equipped: number;
		item_level_total: number;
		artifact_traits_total: number;
		items: Record<string, RioGearItem>;
	};
	talentLoadout?: {
		loadout_spec_id: number;
		loadout_text: string;
		loadout: Array<{
			rank: number;
			entryIndex: number;
			node: { entries: Array<{ spell?: { name: string } }> };
		}>;
	};
	talents?: Array<{
		talent: { name: string; id: number };
		spell_tooltip: {
			spell: { name: string; id: number };
			description: string;
			cast_time: string;
			power_cost: string | null;
			attack_power_coefficient: string | null;
			range: string;
			cooldown: string;
		};
		talent_tree: string;
	}>;
	covenant?: {
		id: number;
		name: string;
		description: string;
		renown_level: number;
		soulbind?: {
			id: number;
			name: string;
		};
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
	specName: string,
	tiers: RioScoreTier[],
	titleCutoff: TitleCutoff,
): Promise<{
	mplus: MythicPlusData | null;
	gear: GearData | null;
	talents: TalentData | null;
	thumbnailUrl?: string;
}> {
	const fields = [
		"mythic_plus_scores_by_season:current",
		"mythic_plus_ranks",
		"mythic_plus_recent_runs",
		"mythic_plus_best_runs",
		"gear",
		"talents",
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

		const recentRuns: MythicPlusRun[] = (profile.mythic_plus_recent_runs ?? []).map(mapRioRun);
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
			recentRuns,
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
		// Raider.IO returns ONLY the currently equipped talent loadout. Never copy it to another spec.
		const loadout = profile.talentLoadout;
		const talents: TalentData | null =
			profile.active_spec_name === specName && loadout
				? {
						talents: loadout.loadout
							.filter((node) => node.rank > 0)
							.flatMap((node) => {
								const name = node.node.entries[node.entryIndex]?.spell?.name;
								return name ? [name] : [];
							}),
						loadoutString: loadout.loadout_text,
						wowheadUrl: null,
					}
				: null;
		return { mplus, gear, talents, thumbnailUrl: profile.thumbnail_url };
	} catch (err) {
		console.warn(`  Could not load RIO profile for ${name} (${realm}): ${err}`);
		recordIssue("Raider.IO 캐릭터 조회 실패");
		return { mplus: null, gear: null, talents: null };
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

/**
 * Fetches the current-season M+ score, Raider.IO colour, and equipped trinket names
 * for a single player. A single profile request covers all three — no extra cost.
 *
 * @returns Score, hex colour, and trinket names, or null if the player cannot be found
 */
async function fetchRioPlayerData(
	name: string,
	realm: string,
	region: string,
): Promise<{ score: number; color: string; trinkets: string[] } | null> {
	try {
		const res = await retry(async () => {
			const url = `${RIO_BASE_URL}/characters/profile?region=${region}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=mythic_plus_scores_by_season:current,gear`;
			const r = await httpFetch(url);
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r;
		}, `RIO data ${name}`);

		const data = (await res.json()) as RioProfileResponse;
		const season = data.mythic_plus_scores_by_season?.[0];
		const score = season?.scores?.all ?? 0;
		const color = season?.segments?.all?.color ?? "";

		const trinkets: string[] = [];
		if (data.gear?.items) {
			const t1 = data.gear.items.trinket1;
			const t2 = data.gear.items.trinket2;
			if (t1?.name) trinkets.push(t1.name);
			if (t2?.name) trinkets.push(t2.name);
		}

		return { score, color, trinkets };
	} catch {
		recordIssue("Raider.IO 메타 점수·장신구 보강 조회 실패");
		return null;
	}
}

// ── WCL character data fetching ─────────────────────────────

/**
 * Fetches a character's raid parse data from WarcraftLogs for a specific difficulty.
 *
 * @param name - Character name
 * @param realmSlug - Realm slug (lowercase-hyphenated)
 * @param region - Region in uppercase (e.g. "EU")
 * @param zoneId - Current raid zone ID
 * @param difficulty - 3=Normal, 4=Heroic, 5=Mythic
 * @param metric - "dps" or "hps"
 * @param token - WarcraftLogs bearer token
 * @returns ZoneRankingsRaw or null on failure
 */
export async function fetchWclRaidRankings(
	name: string,
	realmSlug: string,
	region: string,
	zoneId: number,
	difficulty: number,
	metric: "dps" | "hps",
	token: string,
	specName?: string,
): Promise<ZoneRankingsRaw | null> {
	try {
		// zoneRankings uses CharacterPageRankingMetricType — inline the value to avoid type mismatch
		const data = await wclQuery<{
			characterData: { character: { zoneRankings: ZoneRankingsRaw } | null };
		}>(
			token,
			`query GetCharacterRaidParses($name: String!, $serverSlug: String!, $serverRegion: String!, $zoneID: Int!, $difficulty: Int!, $specName: String) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            zoneRankings(zoneID: $zoneID, difficulty: $difficulty, metric: ${metric}, specName: $specName)
          }
        }
      }`,
			{
				name,
				specName,
				serverSlug: realmSlug,
				serverRegion: region.toUpperCase(),
				zoneID: zoneId,
				difficulty,
			},
		);

		return data.characterData.character?.zoneRankings ?? null;
	} catch (err) {
		console.warn(`  WCL raid rankings failed for ${name} (difficulty ${difficulty}): ${err}`);
		recordIssue(`레이드 난이도 ${difficulty} 조회 실패`);
		return null;
	}
}

/**
 * Fetches a character's M+ log data from WarcraftLogs.
 *
 * @param name - Character name
 * @param realmSlug - Realm slug
 * @param region - Region in uppercase
 * @param mplusZoneId - Current M+ season zone ID
 * @param metric - "dps" or "hps"
 * @param token - WarcraftLogs bearer token
 * @returns ZoneRankingsRaw or null on failure
 */
export async function fetchWclMplusRankings(
	name: string,
	realmSlug: string,
	region: string,
	mplusZoneId: number,
	metric: "dps" | "hps",
	token: string,
	specName?: string,
): Promise<ZoneRankingsRaw | null> {
	try {
		const data = await wclQuery<{
			characterData: { character: { mythicPlusRankings: ZoneRankingsRaw } | null };
		}>(
			token,
			// zoneRankings uses CharacterPageRankingMetricType — inline the value
			`query GetCharacterMythicPlusLogs($name: String!, $serverSlug: String!, $serverRegion: String!, $mplusZoneId: Int!, $specName: String) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            mythicPlusRankings: zoneRankings(zoneID: $mplusZoneId, metric: ${metric}, specName: $specName)
          }
        }
      }`,
			{
				name,
				specName,
				serverSlug: realmSlug,
				serverRegion: region.toUpperCase(),
				mplusZoneId,
			},
		);

		return data.characterData.character?.mythicPlusRankings ?? null;
	} catch (err) {
		console.warn(`  WCL M+ rankings failed for ${name}: ${err}`);
		recordIssue("쐐기 로그 조회 실패");
		return null;
	}
}

/**
 * Fetches the damage breakdown for the character's best raid parse.
 *
 * Selects the raid entry with the highest bestAmount where rankPercent is non-null.
 * If no such entry exists, returns an empty array (no parses = no breakdown).
 *
 * @param name - Character name
 * @param mythicRankings - Mythic zoneRankings response (preferred)
 * @param heroicRankings - Heroic zoneRankings response (fallback)
 * @param token - WarcraftLogs bearer token
 * @returns Top-5 damage sources by percentage, or empty array
 */
async function fetchDamageBreakdownIfPossible(
	name: string,
	mythicRankings: ZoneRankingsRaw | null,
	heroicRankings: ZoneRankingsRaw | null,
	token: string,
): Promise<DamageSource[]> {
	// Find best entry with actual parses
	const rankings = mythicRankings ?? heroicRankings;
	if (!rankings) return [];

	const withParses = rankings.rankings.filter(
		(r) => r.rankPercent !== null && r.bestAmount > 0 && r.report !== undefined,
	);

	if (withParses.length === 0) return [];

	const best = withParses.reduce((a, b) => (b.bestAmount > a.bestAmount ? b : a));
	if (!best) return [];

	// The report is available on raid rankings via the encounter's best parse
	// WCL zoneRankings doesn't include report details; we need to get them from
	// the character's best report separately. Since the v2.3 PRD notes that
	// the rankings from zoneRankings don't include report.code directly (only
	// characterRankings does), we attempt a characterRankings query for the specific encounter.
	// If unavailable, return empty.
	return [];
}

/**
 * Maps WarcraftLogs zoneRankings data to our RaidParse[] format.
 *
 * @param rankings - ZoneRankingsRaw response
 * @param difficulty - Difficulty label string
 * @returns Array of RaidParse entries (only entries with actual parses)
 */
function mapRaidParses(
	rankings: ZoneRankingsRaw,
	difficulty: "Heroic" | "Mythic",
	parseDates: Map<string, string>,
): RaidParse[] {
	const difficultyId = difficulty === "Mythic" ? 5 : 4;
	return rankings.rankings
		.filter((r) => r.rankPercent !== null)
		.map((r) => ({
			bossName: r.encounter.name,
			difficulty,
			bestPercent: r.rankPercent ?? 0,
			ilvlAdjustedPercent: r.rankPercent ?? 0,
			rankLabel: rankLabel(r.rankPercent ?? 0),
			bestAmount: r.bestAmount,
			date: parseDates.get(`${r.encounter.id}-${difficultyId}`) ?? "",
		}));
}

/**
 * Maps WCL M+ zoneRankings to DungeonLog[] entries for a specific spec.
 *
 * WCL's `bestAmount` for M+ zoneRankings is the total damage/healing done, not the
 * average DPS/HPS rate. To get the rate, divide by the run time in seconds. The run
 * time comes from Raider.IO's `clearTimeMs` on the matching bestRun entry.
 *
 * Date is also sourced from Raider.IO since `fastestKill` is a timer delta, not a timestamp.
 */
function mapDungeonLogs(
	rankings: ZoneRankingsRaw,
	specName: string,
	rioRuns: MythicPlusRun[],
): DungeonLog[] {
	const dateByDungeon = new Map(rioRuns.map((r) => [r.dungeon, r.completedAt]));
	const clearMsByDungeon = new Map(rioRuns.map((r) => [r.dungeon, r.clearTimeMs]));

	return rankings.rankings
		.filter((r) => r.rankPercent !== null && (r.spec === specName || r.bestSpec === specName))
		.map((r) => {
			const clearMs = clearMsByDungeon.get(r.encounter.name);
			// Average DPS = total damage ÷ run duration in seconds
			const avgDps = clearMs && clearMs > 0 ? r.bestAmount / (clearMs / 1000) : r.bestAmount;
			return {
				dungeon: r.encounter.name,
				dps: Math.round(avgDps),
				rankPercent: r.rankPercent ?? 0,
				ilvlAdjustedPercent: r.rankPercent ?? 0,
				ilvl: 0,
				date: dateByDungeon.get(r.encounter.name) ?? "",
			};
		})
		.sort((a, b) => {
			if (!a.date && !b.date) return 0;
			if (!a.date) return 1;
			if (!b.date) return -1;
			return new Date(b.date).getTime() - new Date(a.date).getTime();
		});
}

function rankLabel(percent: number): string {
	if (percent >= 99) return "Legendary";
	if (percent >= 95) return "Epic";
	if (percent >= 75) return "Rare";
	if (percent >= 50) return "Uncommon";
	if (percent >= 25) return "Common";
	return "Poor";
}

// ── Raider.IO M+ spec leaderboard ──────────────────────────

interface RioSpecRankingsResponse {
	rankings: Array<{
		rank: number;
		score: number;
		character: {
			name: string;
			realm: { slug: string; name: string; altName: string | null };
			region: { short_name: string; slug: string; name: string };
			thumbnailUrl: string;
			class: { id: number; slug: string; name: string };
			spec: { id: number; slug: string; name: string };
		};
		guild: null | { name: string; realm: { slug: string } };
		season_score: number;
		color: string;
	}>;
}

/**
 * Builds an EU-only M+ leaderboard for a spec by aggregating characterRankings
 * across all M+ dungeon encounters in the current season zone (zone 47).
 *
 * Uses the same strategy as the raid leaderboard: fetch up to 100 rankings per
 * dungeon, filter to EU, deduplicate by name+server, take the best amount per
 * player across all dungeons, sort descending, return top 20.
 *
 * The Raider.IO public API v1 does not expose a spec rankings endpoint (returns HTML),
 * so WCL is the authoritative source for both M+ and raid leaderboards.
 *
 * @param spec - The spec definition
 * @param mplusEncounters - M+ dungeon encounter list from the current season zone
 * @param token - WarcraftLogs bearer token
 * @returns Leaderboard entries (sorted by M+ score) and aggregated trinket usage
 */
export async function fetchWclMplusLeaderboard(
	spec: SpecDefinition,
	mplusEncounters: Array<{ id: number; name: string }>,
	token: string,
	region: Region = "eu",
): Promise<{ leaderboard: MythicPlusLeaderboardEntry[]; trinkets: MetaItem[] }> {
	const allRankings = await Promise.allSettled(
		mplusEncounters.map((enc) => fetchEncounterRankings(enc.id, spec, 10, token, region)),
	);

	const playerBest = new Map<
		string,
		{ name: string; realm: string; realmSlug: string; bestAmount: number }
	>();

	for (const result of allRankings) {
		if (result.status !== "fulfilled" || !result.value) continue;
		for (const r of result.value.rankings) {
			if (r.name === "Anonymous" || !r.report) continue;
			if (r.server.region.toLowerCase() !== region) continue;
			const key = `${r.name}@${r.server.name}`;
			const existing = playerBest.get(key);
			if (!existing || r.amount > existing.bestAmount) {
				playerBest.set(key, {
					name: r.name,
					realm: r.server.name,
					realmSlug: toRealmSlug(r.server.name),
					bestAmount: r.amount,
				});
			}
		}
	}

	const top10 = [...playerBest.values()].sort((a, b) => b.bestAmount - a.bestAmount).slice(0, 10);

	// Single RIO request per player: score + gear (trinkets). Same cost as before.
	const rioData = await Promise.allSettled(
		top10.map((p) => fetchRioPlayerData(p.name, toRealmSlug(p.realm), region)),
	);

	// Enrich, re-sort by M+ score descending (DPS as tiebreaker).
	const enriched = top10.map((p, idx) => {
		const result = rioData[idx];
		const rio = result?.status === "fulfilled" ? result.value : null;
		return {
			name: p.name,
			realm: p.realm,
			realmSlug: p.realmSlug,
			bestAmount: p.bestAmount,
			score: rio?.score ?? 0,
			scoreColor: rio?.color ?? "",
			trinkets: rio?.trinkets ?? [],
		};
	});

	enriched.sort((a, b) => b.score - a.score || b.bestAmount - a.bestAmount);

	// Aggregate trinket usage across players who had data.
	const playersWithData = enriched.filter((p) => p.trinkets.length > 0).length;
	const counts = new Map<string, number>();
	for (const p of enriched) {
		for (const name of p.trinkets) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	const trinkets: MetaItem[] = [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([name, count]) => ({
			name,
			source: "—",
			usagePercent: Math.round((count / Math.max(playersWithData, 1)) * 100),
		}));

	const leaderboard = enriched.map((p, idx) => ({
		rank: idx + 1,
		name: p.name,
		realm: p.realm,
		region,
		score: p.score,
		scoreColor: p.scoreColor,
		bestPerformance: Math.round(p.bestAmount),
		trinkets: p.trinkets,
		profileUrl: characterProfileUrl("wcl", region, p.realmSlug, p.name),
		rioProfileUrl: characterProfileUrl("rio", region, p.realmSlug, p.name),
	}));

	return { leaderboard, trinkets };
}

/**
 * Fetches the date of the character's best log for each raid encounter, using a
 * persistent cache to skip encounters already recorded.
 *
 * Cache key: `"Name@Realm-encounterId-difficultyId"` (written to `cache/parse-dates.json`).
 * If all encounters are cached, no WCL query is made — saves ~1 WCL point/character/build.
 * Only the missing encounters are fetched; results are merged back into the cache.
 *
 * @param parseDatesCache - Mutable shared cache object (read + updated in place)
 * @returns Map of `"encounterId-difficultyId"` → ISO date string
 */
async function fetchRaidParseDates(
	name: string,
	realmSlug: string,
	region: string,
	metric: "dps" | "hps",
	encounters: Array<{ id: number; name: string }>,
	token: string,
	parseDatesCache: Record<string, string>,
	specName: string,
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const missing: Array<{ enc: { id: number; name: string }; diffId: 4 | 5; prefix: string }> = [];

	// Populate from cache first
	for (const enc of encounters) {
		for (const [prefix, diffId] of [
			["h", 4],
			["m", 5],
		] as const) {
			const cacheKey = `${region}/${name}@${realmSlug}/${specName}-${enc.id}-${diffId}`;
			const cached = parseDatesCache[cacheKey];
			if (cached) {
				result.set(`${enc.id}-${diffId}`, cached);
			} else {
				missing.push({ enc, diffId, prefix });
			}
		}
	}

	if (missing.length === 0) return result;

	// Fetch only the missing encounters in one batched query
	const aliases = missing
		.map(
			({ enc, diffId, prefix }) =>
				`${prefix}${enc.id}: encounterRankings(encounterID: ${enc.id}, difficulty: ${diffId}, metric: ${metric}, specName: $specName)`,
		)
		.join("\n");

	try {
		const data = await wclQuery<Record<string, unknown>>(
			token,
			`query GetRaidParseDates($name: String!, $serverSlug: String!, $serverRegion: String!, $specName: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            ${aliases}
          }
        }
      }`,
			{ name, serverSlug: realmSlug, serverRegion: region.toUpperCase(), specName },
		);

		const char = (data as unknown as { characterData: { character: Record<string, unknown> } })
			.characterData.character;
		if (!char) return result;

		for (const { enc, diffId, prefix } of missing) {
			const raw = char[`${prefix}${enc.id}`] as
				| { ranks?: Array<{ report?: { startTime?: number } }> }
				| undefined;
			const ts = raw?.ranks?.[0]?.report?.startTime;
			if (ts) {
				const iso = new Date(ts).toISOString();
				result.set(`${enc.id}-${diffId}`, iso);
				// Update the shared cache
				parseDatesCache[`${region}/${name}@${realmSlug}/${specName}-${enc.id}-${diffId}`] = iso;
			}
		}
	} catch (err) {
		console.warn(`  Could not fetch raid parse dates for ${name}:`, err);
		recordIssue("레이드 기록 날짜 조회 실패");
	}

	return result;
}

// ── WCL spec meta (raid leaderboard) ───────────────────────

/**
 * Fetches up to 100 character rankings for a specific encounter and spec from WCL.
 *
 * @param encounterId - WCL encounter ID
 * @param spec - Spec definition
 * @param difficulty - 4=Heroic, 5=Mythic
 * @param token - Bearer token
 * @returns CharacterRankingsRaw or null on failure
 */
export async function fetchEncounterRankings(
	encounterId: number,
	spec: SpecDefinition,
	difficulty: number,
	token: string,
	region: Region = "eu",
): Promise<CharacterRankingsRaw | null> {
	try {
		const data = await wclQuery<{
			worldData: { encounter: { characterRankings: CharacterRankingsRaw } };
		}>(
			token,
			// Inline metric to avoid enum type ambiguity (CharacterRankingMetricType vs CharacterPageRankingMetricType)
			`query GetEncounterRankings($encounterId: Int!, $className: String!, $specName: String!, $difficulty: Int!, $region: String!) {
        worldData {
          encounter(id: $encounterId) {
            characterRankings(
              className: $className
              specName: $specName
              difficulty: $difficulty
              serverRegion: $region
              metric: ${metricForRole(spec.role)}
              page: 1
            )
          }
        }
      }`,
			{
				encounterId,
				className: spec.className,
				specName: spec.specName,
				difficulty,
				region: region.toUpperCase(),
			},
		);

		return data.worldData.encounter.characterRankings;
	} catch (err) {
		console.warn(`  WCL encounter ${encounterId} rankings failed for ${spec.specSlug}: ${err}`);
		recordIssue(`WCL 전투 ${encounterId} 조회 실패`);
		return null;
	}
}

/**
 * Builds an EU-only raid leaderboard for a spec by aggregating across all raid encounters.
 *
 * Strategy: for each player, take their best rankPercent across all encounters,
 * deduplicate by name+server, sort descending, take top 20.
 *
 * @param spec - Spec definition
 * @param encounters - All encounters in the current raid tier
 * @param token - WarcraftLogs bearer token
 * @returns Array of up to 20 EU leaderboard entries
 */
async function fetchRaidLeaderboard(
	spec: SpecDefinition,
	encounters: Array<{ id: number; name: string }>,
	token: string,
	region: Region = "eu",
): Promise<RaidLeaderboardEntry[]> {
	const allRankings = await Promise.allSettled(
		encounters.map((enc) => fetchEncounterRankings(enc.id, spec, 5, token, region)),
	);

	// Aggregate: player key → best rankPercent
	const playerBest = new Map<
		string,
		{
			name: string;
			realm: string;
			region: string;
			bestPercent: number;
			bracketData: number;
		}
	>();

	for (const result of allRankings) {
		if (result.status !== "fulfilled" || !result.value) continue;
		const { rankings } = result.value;

		for (const r of rankings) {
			if (r.name === "Anonymous" || !r.report) continue;
			if (r.server.region.toLowerCase() !== region) continue;

			const key = `${r.name}@${r.server.name}`;
			const existing = playerBest.get(key);
			if (!existing || r.amount > existing.bestPercent) {
				playerBest.set(key, {
					name: r.name,
					realm: r.server.name,
					region: r.server.region,
					bestPercent: r.amount,
					bracketData: r.bracketData,
				});
			}
		}
	}

	const sorted = [...playerBest.values()].sort((a, b) => b.bestPercent - a.bestPercent);
	return sorted.slice(0, 10).map((p, idx) => ({
		rank: idx + 1,
		name: p.name,
		realm: p.realm,
		region: p.region,
		bestPercent: p.bestPercent,
		ilvlAdjustedPercent: p.bestPercent,
		rankLabel: rankLabel(p.bestPercent),
		wclProfileUrl: characterProfileUrl("wcl", region, p.realm, p.name),
	}));
}

/**
 * Fetches the top 10 EU raid players for a spec and returns aggregated trinket usage.
 * Uses the same WCL encounter rankings as the (now-hidden) raid leaderboard, but only
 * to identify the players — the gear is then fetched from Raider.IO.
 *
 * @param spec - Spec definition
 * @param raidEncounters - Current raid tier encounter list
 * @param token - WarcraftLogs bearer token
 * @returns Aggregated trinket usage across the top 10 EU raid players
 */
async function fetchRaidTopTrinkets(
	spec: SpecDefinition,
	raidEncounters: Array<{ id: number; name: string }>,
	token: string,
	region: Region = "eu",
): Promise<MetaItem[]> {
	const allRankings = await Promise.allSettled(
		raidEncounters.map((enc) => fetchEncounterRankings(enc.id, spec, 5, token, region)),
	);

	const playerBest = new Map<string, { name: string; realm: string; bestAmount: number }>();
	for (const result of allRankings) {
		if (result.status !== "fulfilled" || !result.value) continue;
		for (const r of result.value.rankings) {
			if (r.name === "Anonymous" || !r.report) continue;
			if (r.server.region.toLowerCase() !== region) continue;
			const key = `${r.name}@${r.server.name}`;
			const existing = playerBest.get(key);
			if (!existing || r.amount > existing.bestAmount) {
				playerBest.set(key, { name: r.name, realm: r.server.name, bestAmount: r.amount });
			}
		}
	}

	const top10 = [...playerBest.values()].sort((a, b) => b.bestAmount - a.bestAmount).slice(0, 10);
	if (top10.length === 0) return [];

	const rioData = await Promise.allSettled(
		top10.map((p) => fetchRioPlayerData(p.name, toRealmSlug(p.realm), region)),
	);

	const playersWithData = rioData.filter(
		(r) => r.status === "fulfilled" && r.value?.trinkets.length,
	).length;
	const counts = new Map<string, number>();
	for (const result of rioData) {
		if (result.status !== "fulfilled" || !result.value) continue;
		for (const name of result.value.trinkets) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([name, count]) => ({
			name,
			source: "—",
			usagePercent: Math.round((count / Math.max(playersWithData, 1)) * 100),
		}));
}

// ── Meta stubs (deferred to v2) ────────────────────────────

/**
 * Aggregates talent builds from top-N player reports.
 *
 * @remarks Deferred to v2. See "Meta gear and meta talents (DEFERRED)" in the PRD.
 * In v2, this will fetch playerDetails from each top player's report to extract
 * talent loadout strings, group by exact match, and return the top 3 builds.
 */
// biome-ignore lint/suspicious/noExplicitAny: stub returns empty array
function aggregateTalents(_rankings: any): [] {
	return [];
}

/**
 * Aggregates meta gear (trinkets, enchants) from top-N player reports.
 *
 * @remarks Deferred to v2. See "Meta gear and meta talents (DEFERRED)" in the PRD.
 * In v2, this will fetch playerDetails from each top player's report to extract
 * equipped trinkets and enchants, group by item, and return usage percentages.
 */
// biome-ignore lint/suspicious/noExplicitAny: stub returns empty object
function aggregateGear(_rankings: any): { trinkets: []; weaponEnchants: []; ringEnchants: [] } {
	return { trinkets: [], weaponEnchants: [], ringEnchants: [] };
}

/**
 * Returns an empty SpecMetaData shell for specs not tracked in characters.config.json.
 * These specs still appear in the snapshot so the right-panel dropdown works, but
 * their leaderboard and trinket panels render the "no data" empty state.
 */
function emptySpecMeta(spec: SpecDefinition): SpecMetaData {
	return {
		specSlug: spec.specSlug,
		specName: spec.specName,
		className: spec.className,
		mythicPlus: emptyMplusMeta(),
		raid: emptyRaidMeta(),
	};
}

function emptyMplusMeta(): MythicPlusMeta {
	return {
		leaderboard: [],
		metaBuilds: [],
		metaGear: { trinkets: [], weaponEnchants: [], ringEnchants: [] },
	};
}

function emptyRaidMeta(): RaidMeta {
	return {
		leaderboard: [],
		metaBuilds: [],
		metaGear: { trinkets: [], weaponEnchants: [], ringEnchants: [] },
	};
}

// ── Build hash ──────────────────────────────────────────────

/**
 * Returns a short build identifier.
 * Uses git short SHA if available, falls back to base-36 timestamp.
 */
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
	mplusZoneId: number,
	rioTiers: RioScoreTier[],
	titleCutoff: TitleCutoff,
	raidEncounters: Array<{ id: number; name: string }>,
	parseDatesCache: Record<string, string>,
	previous?: CharacterData,
	previousAt?: string,
	supportedRaidMetrics: Array<"dps" | "bossdps" | "hps"> = ["dps", "hps"],
	reuseRaid = false,
	reuseWclDetails = false,
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
			const old = previous?.specs[specDef.specSlug];
			const dates = await collect(
				() =>
					fetchRaidParseDates(
						char.name,
						realmSlug,
						char.region,
						metric,
						raidEncounters,
						token,
						parseDatesCache,
						specEntry.spec,
					),
				(data) => data.size > 0,
				new Map<string, string>(),
				!!token && !reuseWclDetails,
			);

			const [rio, raidPerformance, mplus] = await Promise.all([
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
					{ mplus: null, gear: null, talents: null },
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
				collect(
					() =>
						fetchWclMplusRankings(
							char.name,
							realmSlug,
							char.region,
							mplusZoneId,
							metric,
							token,
							specEntry.spec,
						),
					(data) => (data?.rankings ?? []).some((r) => r.rankPercent !== null && r.bestAmount > 0),
					null,
					!!token && !reuseWclDetails,
				),
			]);
			const rioData = retain(
				rio.data,
				rio.status,
				old
					? { mplus: old.mythicPlus, gear: old.gear ?? null, talents: old.talents ?? null }
					: undefined,
				old?.collection?.raiderio,
				previousAt,
				(d) => d.mplus !== null,
			);
			if (reuseWclDetails && old) {
				mplus.status.deferred = !freshStatus(old.collection?.mythicPlus, WCL_POLICY.detailTtlMs);
				mplus.status.cacheHits = 1;
				mplus.status.issues = [
					mplus.status.deferred
						? "상세 로그 갱신 보류 · 캐시 보존"
						: "12시간 상세 로그 캐시 재사용",
				];
				mplus.status.retainedAt =
					old.collection?.mythicPlus.retainedAt ??
					old.collection?.mythicPlus.lastSuccessAt ??
					previousAt;
				dates.status.deferred = !freshStatus(old.collection?.raidDates, WCL_POLICY.detailTtlMs);
				dates.status.cacheHits = 1;
				dates.status.issues = [
					dates.status.deferred
						? "로그 날짜 갱신 보류 · 캐시 보존"
						: "12시간 로그 날짜 캐시 재사용",
				];
				if (wclRuntime.active) wclRuntime.telemetry.cacheHits += 2;
				dates.status.retainedAt =
					old.collection?.raidDates.retainedAt ??
					old.collection?.raidDates.lastSuccessAt ??
					previousAt;
			}
			const primaryRaid = raidPerformance[metric];
			const raids = {
				status: combineCollectionStatuses(
					primaryRaid ? Object.values(primaryRaid).map((d) => d.collection) : [],
				),
			};
			const mplusRankings = mplus.data;
			const parseDates = dates.data;

			const damageBreakdown: DamageSource[] = []; // Upstream damage breakdown remains deferred.
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
								date: parseDates.get(`${r.encounterId}-${d.difficulty === "Mythic" ? 5 : 4}`) ?? "",
							})),
					)
				: [];

			const freshDungeonLogs: DungeonLog[] = mplusRankings
				? mapDungeonLogs(mplusRankings, specEntry.spec, rioData.mplus?.bestRuns ?? [])
				: [];
			const raidParses = retain(
				freshRaidParses,
				raids.status,
				old?.logs?.raidParses,
				old?.collection?.raid,
				previousAt,
				(d) => d.length > 0,
			);
			const dungeonLogs = retain(
				freshDungeonLogs,
				mplus.status,
				old?.logs?.recentDungeonLogs,
				old?.collection?.mythicPlus,
				previousAt,
				(d) => d.length > 0,
			);
			if (failed(dates.status) || dates.status.deferred || dates.status.cacheHits) {
				for (const parse of raidParses) {
					const oldParse = old?.logs?.raidParses.find(
						(p) =>
							p.bossName === parse.bossName &&
							p.difficulty === parse.difficulty &&
							p.bestAmount === parse.bestAmount,
					);
					if (!parse.date && oldParse?.date) {
						parse.date = oldParse.date;
						dates.status.retainedAt =
							old?.collection?.raidDates.retainedAt ??
							old?.collection?.raidDates.lastSuccessAt ??
							previousAt;
					}
				}
			}

			const logs: LogData = {
				raidParses,
				recentDungeonLogs: dungeonLogs,
				latestLogDamageBreakdown: damageBreakdown,
			};

			const specData: CharacterSpecData = {
				raidPerformance,
				collection: {
					raiderio: rio.status,
					raid: raids.status,
					mythicPlus: mplus.status,
					raidDates: dates.status,
				},
				specSlug: specDef.specSlug,
				specName: specDef.specName,
				role: specEntry.role as "main" | "offspec" | "tracked",
				mythicPlus: rioData.mplus,
				gear: rioData.gear,
				talents: rioData.talents,
				logs: raidParses.length > 0 || dungeonLogs.length > 0 ? logs : null,
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
			const old = previous?.specs[specDef.specSlug];
			specsMap[specDef.specSlug] = {
				...old,
				raidPerformance: failedRaidPerformance(
					specDef.role === "healer",
					raidEncounters,
					old?.raidPerformance,
					previousAt,
				),
				collection: Object.fromEntries(
					(["raiderio", "raid", "mythicPlus", "raidDates"] as const).map((key) => [
						key,
						{
							state: "failed",
							attemptedRequests: 0,
							failedRequests: 0,
							issues: ["캐릭터 전문화 조회 실패"],
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

// ── Spec meta fetching ──────────────────────────────────────

/**
 * Fetches all meta data for a single spec:
 * - M+ leaderboard + trinket usage (top 10 EU, WCL + Raider.IO)
 * - Raid trinket usage (top 10 EU raid, WCL + Raider.IO — no leaderboard table shown)
 *
 * @param spec - Spec definition
 * @param token - WarcraftLogs bearer token
 * @param mplusEncounters - Current M+ season encounter list
 * @param raidEncounters - Current raid tier encounter list
 * @returns SpecMetaData for the snapshot
 */
export async function fetchSpecMeta(
	spec: SpecDefinition,
	token: string,
	mplusEncounters: Array<{ id: number; name: string }>,
	raidEncounters: Array<{ id: number; name: string }>,
	region: Region = "eu",
	previous?: SpecMetaData,
	previousAt?: string,
): Promise<SpecMetaData> {
	const [mplusResult, raidTrinkets] = await Promise.all([
		collect(
			() => fetchWclMplusLeaderboard(spec, mplusEncounters, token, region),
			(d) => d.leaderboard.length > 0,
			{ leaderboard: [], trinkets: [] },
		),
		collect(
			() => fetchRaidTopTrinkets(spec, raidEncounters, token, region),
			(d) => d.length > 0,
			[],
		),
	]);

	const mplusData = retain(
		mplusResult.data,
		mplusResult.status,
		previous
			? {
					leaderboard: previous.mythicPlus.leaderboard,
					trinkets: previous.mythicPlus.metaGear.trinkets,
				}
			: undefined,
		previous?.mythicPlus.collection,
		previousAt,
		(d) => d.leaderboard.length > 0,
	);
	const raidData = retain(
		raidTrinkets.data,
		raidTrinkets.status,
		previous?.raid.metaGear.trinkets,
		previous?.raid.collection,
		previousAt,
		(d) => d.length > 0,
	);

	const mplus: MythicPlusMeta = {
		collection: mplusResult.status,
		leaderboard: mplusData.leaderboard,
		metaBuilds: aggregateTalents(null),
		metaGear: { trinkets: mplusData.trinkets, weaponEnchants: [], ringEnchants: [] },
	};

	const raid: RaidMeta = {
		collection: raidTrinkets.status,
		leaderboard: [],
		metaBuilds: aggregateTalents(null),
		metaGear: {
			trinkets: raidData,
			weaponEnchants: [],
			ringEnchants: [],
		},
	};

	return {
		region,
		sourceNote:
			"WCL regional logged-player sample; M+ sample sorted by character overall Raider.IO score. Not the complete regional score ranking.",
		specSlug: spec.specSlug,
		specName: spec.specName,
		className: spec.className,
		mythicPlus: mplus,
		raid,
	};
}

// ── Entry point ─────────────────────────────────────────────

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
function detailsFresh(char: CharacterData) {
	return Object.values(char.specs).every(
		(s) =>
			freshStatus(s.collection?.mythicPlus, WCL_POLICY.detailTtlMs) &&
			freshStatus(s.collection?.raidDates, WCL_POLICY.detailTtlMs),
	);
}
function metaFresh(spec: SpecMetaData | undefined) {
	return (
		!!spec &&
		freshStatus(spec.mythicPlus.collection, WCL_POLICY.metaTtlMs) &&
		freshStatus(spec.raid.collection, WCL_POLICY.metaTtlMs)
	);
}

export function deferCharacterRaid(
	char: CharacterData,
	encounters: Array<{ id: number; name: string }>,
	at: string | undefined,
	reason: string,
): CharacterData {
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
							mythicPlus: spec.collection?.mythicPlus ?? skipped,
							raidDates: spec.collection?.raidDates ?? skipped,
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
		const old = char.specs[slug];
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
					date:
						old.logs?.raidParses.find(
							(p) =>
								p.bossName === r.bossName &&
								p.difficulty === d.difficulty &&
								p.bestAmount === r.bestAmount,
						)?.date ?? "",
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
		const dungeonLogs = old.logs?.recentDungeonLogs ?? [];
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
				mythicPlus: old.collection?.mythicPlus ?? skipped,
				raidDates: old.collection?.raidDates ?? skipped,
				raid,
			},
			logs:
				raidParses.length || dungeonLogs.length
					? {
							raidParses,
							recentDungeonLogs: dungeonLogs,
							latestLogDamageBreakdown: old.logs?.latestLogDamageBreakdown ?? [],
						}
					: null,
		};
	}
	return result;
}

export async function main(): Promise<void> {
	const rioOnly = process.argv.includes("--raiderio-only");
	const cacheOnly = process.argv.includes("--cache-only");
	const metaOnly = process.argv.includes("--meta-only");
	const force = process.argv.includes("--force-refresh");
	const refreshMeta =
		!rioOnly && !cacheOnly && (metaOnly || !process.argv.includes("--characters-only"));
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
			cooldownReason: typeof stored.cooldownReason === "string" ? stored.cooldownReason : undefined,
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
		state.cooldownReason = "이전 실행의 서버 Retry-After · 다음 실행으로 이월";
	}
	const saveRuntime = () => {
		mkdirSync("cache", { recursive: true });
		writeFileSync("cache/wcl-runtime.json", JSON.stringify(wclRuntime.state));
	};
	wclRuntime.activate(state, saveRuntime);
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
	const region = config.characters[0]?.region ?? "kr";
	const tracked = new Set(
		config.characters
			.flatMap((c) =>
				c.specs
					.filter((s) => s.role !== "inactive")
					.map(
						(s) =>
							ALL_SPECS.find((d) => d.className === c.class && d.specName === s.spec)?.specSlug ??
							"",
					),
			)
			.filter(Boolean),
	);
	const compatible = previous?.region === region ? previous : undefined;
	let raid = compatible?.raid;
	let mythicPlusZone = compatible?.mythicPlusZone;
	let raidMetricSchema = compatible?.raidMetricSchema;
	let metadataAt = compatible?.wclMetadataAt;
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
	const needsCore = !metaOnly && (force || initial.some((c) => !coreFresh(c)));
	const needsDetails = !metaOnly && (force || initial.some((c) => !detailsFresh(c)));
	const needsMeta =
		refreshMeta && [...tracked].some((slug) => force || !metaFresh(compatible?.specs[slug]));
	let token = "";
	if (!rioOnly && !cacheOnly && (needsCore || needsDetails || needsMeta)) {
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
				!metadataAt ||
				force ||
				Date.now() - Date.parse(metadataAt) >= WCL_POLICY.metadataTtlMs
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
				metadataAt = new Date().toISOString();
			}
			// Meta-only/cache-hit character runs obtain the budget alongside a normal zone identity read, never by re-fetching character tables.
			if (!wclRuntime.currentBudget() && raidZoneId)
				await wclQuery(
					token,
					`query RefreshZoneBudget { worldData { zone(id: ${raidZoneId}) { id } } }`,
				);
		} catch (error) {
			const reason = error instanceof Error ? error.message : "WCL 초기화 조회 실패";
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
		dataMode: rioOnly ? "raiderio-only" : (compatible?.dataMode ?? "full"),
		region,
		raid,
		mythicPlusZone,
		wclMetadataAt: metadataAt,
		raidMetricSchema,
		wclZones:
			raidZoneId && mplusZoneId
				? { raid: raidZoneId, mythicPlus: mplusZoneId }
				: compatible?.wclZones,
		characters: initial,
		specs: Object.fromEntries(
			[...tracked].map((slug) => {
				const definition = ALL_SPECS.find((s) => s.specSlug === slug);
				if (!definition) throw new Error("Unknown tracked spec");
				return [
					slug,
					zonesMatch || cacheOnly
						? (compatible?.specs[slug] ?? emptySpecMeta(definition))
						: emptySpecMeta(definition),
				];
			}),
		),
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
		const meta = countCollections(
			Object.values(snapshot.specs).map((s) => [s.mythicPlus.collection, s.raid.collection]),
		);
		snapshot.collectionSummary = {
			characters: charactersCount,
			raidTables,
			metaSpecs: {
				...meta,
				withData: Object.values(snapshot.specs).filter(
					(s) => s.mythicPlus.leaderboard.length || s.raid.metaGear.trinkets.length,
				).length,
			},
		};
		snapshot.refreshRuntime = wclRuntime.summary;
		snapshot.refreshSchedule = readRefreshSchedule();
		snapshot.warnings = rioOnly
			? ["실제 Raider.IO 공개 데이터입니다. WCL은 미조회 상태입니다."]
			: [];
		if (charactersCount.partial || charactersCount.failed || meta.partial || meta.failed)
			snapshot.warnings.push(
				`일부 항목 수집 실패: 캐릭터 ${charactersCount.partial + charactersCount.failed}/${charactersCount.tracked}, 메타 ${meta.partial + meta.failed}/${meta.tracked}. 이전 데이터 시각과 각 조회 상태를 확인하세요.`,
			);
		if (wclRuntime.summary.deferredReason)
			snapshot.warnings.push(
				`갱신 보류: ${wclRuntime.summary.deferredReason}${wclRuntime.state.cooldownUntil ? ` · 재시도 가능 시각 ${new Date(wclRuntime.state.cooldownUntil).toISOString()}` : ""}. 완료된 성적과 캐시는 보존했습니다.`,
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
	if (!cacheOnly && !rioOnly && !metaOnly) {
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
							wclRuntime.summary.deferredReason ?? "WCL 미조회 · 캐시 보존",
						),
			);
		checkpoint();
	}
	if (!cacheOnly && !metaOnly) {
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
		const dates = loadDatesCache();
		for (let i = 0; i < snapshot.characters.length; i++) {
			const old = snapshot.characters[i];
			const c = config.characters[i];
			if (!old || !c) continue;
			let reuseDetails = !force && detailsFresh(old);
			try {
				if (!token) reuseDetails = true;
				else if (!reuseDetails) wclRuntime.beforeQuery();
			} catch {
				reuseDetails = true;
			}
			snapshot.characters[i] = await fetchCharacter(
				c,
				token,
				raidZoneId,
				mplusZoneId,
				tiers,
				cutoff,
				encounters,
				dates,
				old,
				compatible?.generatedAt,
				raidMetricSchema?.supported ?? ["dps", "hps"],
				true,
				reuseDetails,
			);
			checkpoint();
		}
		saveDatesCache(dates);
	}
	if (!cacheOnly && refreshMeta) {
		wclRuntime.setStage("meta");
		const definitions = ALL_SPECS.filter((s) => tracked.has(s.specSlug)).sort(
			(a, b) =>
				Number(metaFresh(snapshot.specs[a.specSlug])) -
				Number(metaFresh(snapshot.specs[b.specSlug])),
		);
		for (const spec of definitions) {
			const old = snapshot.specs[spec.specSlug] ?? emptySpecMeta(spec);
			let reason: string | undefined =
				!force && metaFresh(old) ? "24시간 전문화 메타 캐시 재사용" : undefined;
			try {
				if (!reason) {
					if (!token || !mythicPlusZone || !raid)
						throw new WclDeferredError("메타 조회 보류 · 인증/영역/예산 확인 대기");
					wclRuntime.beforeQuery();
				}
			} catch (error) {
				reason = error instanceof Error ? error.message : "메타 조회 보류";
			}
			if (reason) {
				const skipped = (
					previousStatus: import("../src/types/snapshot.js").CollectionStatus | undefined,
				) => ({
					state: "skipped" as const,
					deferred: !metaFresh(old),
					attemptedRequests: 0,
					failedRequests: 0,
					retainedAt:
						previousStatus?.retainedAt ?? previousStatus?.lastSuccessAt ?? compatible?.generatedAt,
					issues: [
						reason ?? "메타 캐시 재사용",
						...(previousStatus?.issues ?? []).filter(
							(s) => s.includes("HTTP") || s.includes("GraphQL"),
						),
					],
				});
				snapshot.specs[spec.specSlug] = {
					...old,
					mythicPlus: { ...old.mythicPlus, collection: skipped(old.mythicPlus.collection) },
					raid: { ...old.raid, collection: skipped(old.raid.collection) },
				};
			} else
				snapshot.specs[spec.specSlug] = await fetchSpecMeta(
					spec,
					token,
					mythicPlusZone?.encounters ?? [],
					encounters,
					region,
					old,
					compatible?.generatedAt,
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
