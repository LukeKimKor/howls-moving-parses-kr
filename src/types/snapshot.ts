import type { Region } from "../lib/regions.js";

/** The root snapshot produced by the build script and imported by App.tsx. */
export interface Snapshot {
	wclZones?: { raid: number; mythicPlus: number };
	collectionSummary?: {
		characters: CollectionCounts;
		metaSpecs: CollectionCounts & { withData: number };
	};
	dataMode?: "full" | "raiderio-only";
	region?: Region;
	warnings?: string[];
	generatedAt: string; // ISO 8601 UTC
	buildHash: string; // must match dist/build-hash.json
	characters: CharacterData[];
	specs: Record<string, SpecMetaData>; // key: "elemental-shaman", "frost-death-knight", etc.
}

export interface CollectionStatus {
	state: "ok" | "empty" | "partial" | "failed" | "skipped";
	/** Logical queries after retries, not individual HTTP attempts. */
	attemptedRequests: number;
	failedRequests: number;
	issues: string[];
	lastSuccessAt?: string;
	retainedAt?: string;
}

export interface CollectionCounts {
	tracked: number;
	complete: number;
	partial: number;
	failed: number;
	skipped: number;
}

// ── Character ─────────────────────────────────────────────

/**
 * A character entry in the snapshot. Identity fields live at the top.
 * Per-spec data (M+ score, logs, gear, talents) is nested under `specs`,
 * keyed by spec slug. Only `main` and `offspec` entries from the config
 * appear here — `inactive` specs are filtered out by validateConfig.
 */
export interface CharacterData {
	name: string;
	realm: string;
	region: Region;
	realmSlug?: string;
	mainSpecPending?: boolean;
	class: string; // e.g. "Shaman"
	thumbnailUrl: string | null;
	isDefault: boolean;
	/** Spec slug of the main spec (the one with role: "main" in config). */
	mainSpecSlug: string;
	/** Ordered list of spec slugs that have data: main first, then offspecs. */
	specOrder: string[];
	/**
	 * Per-spec data. Keys are spec slugs (e.g. "elemental-shaman").
	 * Always contains exactly the slugs in `specOrder` — no more, no less.
	 */
	specs: Record<string, CharacterSpecData>;
}

/**
 * Per-spec data for a single character. All fields may be null if the
 * corresponding API call failed; the UI must handle this gracefully.
 */
export interface CharacterSpecData {
	collection?: {
		raiderio: CollectionStatus;
		raid: CollectionStatus;
		mythicPlus: CollectionStatus;
		raidDates: CollectionStatus;
	};
	specSlug: string; // e.g. "elemental-shaman" — matches key in top-level specs map
	specName: string; // e.g. "Elemental"
	role: "main" | "offspec" | "tracked";
	gear?: GearData | null;
	talents?: TalentData | null;
	mythicPlus: MythicPlusData | null;
	logs: LogData | null;
}

/** Mythic+ performance data for a single character spec. */
export interface MythicPlusData {
	scoreScope?: "character-overall";
	season?: string;
	score: number;
	scoreColor: string; // hex from Raider.IO, e.g. "#ff8000"
	scoreTierLabel: string; // e.g. "Hero", "Legend"
	realmRank: number;
	regionRank: number;
	worldRank: number;
	titleCutoff: TitleCutoff;
	recentRuns: MythicPlusRun[];
	bestRuns: MythicPlusRun[];
}

/** EU Keystone Hero title cutoff data from Raider.IO. */
export interface TitleCutoff {
	score: number;
	percentile: 1; // top 1%
	region: Region;
	updatedAt: string; // ISO 8601
}

/** A single Mythic+ run result. */
export interface MythicPlusRun {
	url?: string;
	affixes?: Array<{ name: string; description: string; iconUrl: string }>;
	dungeon: string;
	shortName: string;
	keystoneLevel: number;
	completedAt: string;
	clearTimeMs: number;
	keystoneTimeMs: number;
	inTime: boolean;
	score: number;
}

/** Log performance data from WarcraftLogs for a character spec. */
export interface LogData {
	raidParses: RaidParse[];
	recentDungeonLogs: DungeonLog[];
	latestLogDamageBreakdown: DamageSource[];
}

/** A single boss parse from WarcraftLogs. */
export interface RaidParse {
	bossName: string;
	difficulty: "Normal" | "Heroic" | "Mythic";
	bestPercent: number;
	ilvlAdjustedPercent: number;
	rankLabel: string;
	/** Best DPS or HPS for this encounter (matches the metric used for the spec). */
	bestAmount: number;
	/** Date of the best log for this encounter (ISO 8601), empty string if unavailable. */
	date: string;
}

/** A single Mythic+ dungeon log entry. */
export interface DungeonLog {
	dungeon: string;
	dps: number;
	rankPercent: number;
	ilvlAdjustedPercent: number;
	ilvl: number;
	date: string;
}

/** A single damage source entry from the most recent log. */
export interface DamageSource {
	name: string;
	total: number;
	percentOfTotal: number;
}

// ── Spec Meta ─────────────────────────────────────────────

/** Global meta data for a single spec (leaderboard + builds + gear). */
export interface SpecMetaData {
	region?: Region;
	sourceNote?: string;
	specSlug: string;
	specName: string;
	className: string;
	mythicPlus: MythicPlusMeta;
	raid: RaidMeta;
}

/** Mythic+ meta for a spec: leaderboard and (deferred) builds/gear. */
export interface MythicPlusMeta {
	collection?: CollectionStatus;
	leaderboard: MythicPlusLeaderboardEntry[];
	metaBuilds: MetaBuild[];
	metaGear: MetaGearData;
}

/** A single entry in the M+ EU leaderboard for a spec. */
export interface MythicPlusLeaderboardEntry {
	rank: number;
	name: string;
	realm: string;
	region: Region;
	/** Raider.IO M+ score for the current season. */
	score: number;
	/** Hex colour from Raider.IO corresponding to the score tier. */
	scoreColor: string;
	/** Best DPS or HPS across all M+ dungeons this season (from WarcraftLogs). */
	bestPerformance: number;
	/** Equipped trinket names from Raider.IO (up to 2). Empty if lookup failed. */
	trinkets: string[];
	/** WarcraftLogs character profile URL. */
	profileUrl: string;
	/** Raider.IO character profile URL. */
	rioProfileUrl: string;
}

/** Raid meta for a spec: leaderboard and (deferred) builds/gear. */
export interface RaidMeta {
	collection?: CollectionStatus;
	leaderboard: RaidLeaderboardEntry[];
	metaBuilds: MetaBuild[];
	metaGear: MetaGearData;
}

/** A single entry in the EU Mythic raid leaderboard for a spec. */
export interface RaidLeaderboardEntry {
	rank: number;
	name: string;
	realm: string;
	region: string;
	bestPercent: number;
	ilvlAdjustedPercent: number;
	rankLabel: string;
	wclProfileUrl: string;
}

/**
 * A meta talent build entry.
 * @remarks In v1 builds, MetaBuild[] is always empty. Retained for v2 forward compatibility.
 */
export interface MetaBuild {
	label: string; // "Build 1", "Build 2", "Build 3"
	usagePercent: number; // 0–100, 1 decimal place
	loadoutString: string | null;
	wowheadUrl: string | null;
	talents: string[];
}

/**
 * Aggregated meta gear data.
 * @remarks In v1 builds, all three arrays are always empty.
 */
export interface MetaGearData {
	trinkets: MetaItem[];
	weaponEnchants: MetaItem[];
	ringEnchants: MetaItem[];
}

/** A single meta gear/enchant item entry. */
export interface MetaItem {
	name: string;
	source: string; // e.g. "Mythic Liberation of Undermine" or "—" if unknown
	usagePercent: number;
}

/** Current equipped gear; the API does not provide a historical set per spec. */
export interface GearData {
	equippedIlvl: number;
	activeSpecName?: string;
	items: Array<{ slot: string; name: string; ilvl: number; quality?: string }>;
}

export interface TalentData {
	talents: string[];
	loadoutString?: string | null;
	wowheadUrl: string | null;
}
