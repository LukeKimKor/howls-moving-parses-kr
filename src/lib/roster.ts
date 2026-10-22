import { ALL_SPECS } from "../data/specs.js";
import type {
	CharacterData,
	MythicPlusData,
	MythicPlusRun,
	RaidDifficulty,
	RaidMetric,
	Snapshot,
} from "../types/snapshot.js";

/**
 * Character-wide helpers for the all-character dashboard tabs.
 * Raider.IO score and equipped gear are character-wide, so the first spec carrying them is used.
 * Raid percentiles are per spec and are always listed per spec (no averaging across specs).
 */

export type DamageMetric = "dps" | "bossdps";

/** Healers always use HPS; other specs follow the selected damage metric. */
export function rosterMetric(slug: string, damageMetric: DamageMetric): RaidMetric {
	return ALL_SPECS.find((spec) => spec.specSlug === slug)?.role === "healer" ? "hps" : damageMetric;
}

export function characterMythicPlus(character: CharacterData): MythicPlusData | null {
	for (const slug of character.specOrder) {
		const data = character.specs[slug]?.mythicPlus;
		if (data) return data;
	}
	return null;
}

export function characterIlvl(character: CharacterData): number | null {
	for (const slug of character.specOrder) {
		const ilvl = character.specs[slug]?.gear?.equippedIlvl;
		if (typeof ilvl === "number" && Number.isFinite(ilvl) && ilvl > 0) return ilvl;
	}
	return null;
}

export interface SpecRaidValue {
	slug: string;
	specName: string;
	metric: RaidMetric;
	best: number | null;
	median: number | null;
	/** Collection state of this metric/difficulty, so "no logs" stays distinct from "not fetched". */
	state: "ok" | "empty" | "partial" | "failed" | "skipped" | "unqueried";
}

/** Character-level order for the Mythic+ tab: by Raider.IO score (unknown last) or config order. */
export function sortRoster(characters: CharacterData[], key: "config" | "score"): CharacterData[] {
	if (key === "config") return [...characters];
	return characters
		.map((character, index) => ({
			character,
			index,
			v: characterMythicPlus(character)?.score ?? null,
		}))
		.sort((a, b) => {
			if (a.v === null && b.v === null) return a.index - b.index;
			if (a.v === null) return 1;
			if (b.v === null) return -1;
			return b.v - a.v || a.index - b.index;
		})
		.map((entry) => entry.character);
}

// ── Spec rows: one row per character × tracked spec, grouped by role ──

export type SpecRole = "dps" | "healer" | "tank";

export const ROLE_LABELS: Record<SpecRole, string> = {
	dps: "딜러",
	healer: "힐러",
	tank: "탱커",
};
export const ROLE_ORDER: SpecRole[] = ["dps", "healer", "tank"];

export interface SpecRow {
	key: string;
	character: CharacterData;
	/** Index in snapshot.characters (stable config order; used for All Stars lookups and anchors). */
	characterIndex: number;
	slug: string;
	specName: string;
	role: SpecRole;
	metric: (damageMetric: DamageMetric) => RaidMetric;
}

export function specRole(slug: string): SpecRole {
	return ALL_SPECS.find((spec) => spec.specSlug === slug)?.role ?? "dps";
}

export function specRows(characters: CharacterData[]): SpecRow[] {
	return characters.flatMap((character, characterIndex) =>
		character.specOrder.flatMap((slug) => {
			const spec = character.specs[slug];
			if (!spec) return [];
			return [
				{
					key: `${character.name}/${slug}`,
					character,
					characterIndex,
					slug,
					specName: spec.specName,
					role: specRole(slug),
					metric: (damageMetric: DamageMetric) => rosterMetric(slug, damageMetric),
				},
			];
		}),
	);
}

export interface RaidPair {
	best: number | null;
	median: number | null;
	state: SpecRaidValue["state"];
}

export function rowRaid(
	row: SpecRow,
	difficulty: RaidDifficulty,
	damageMetric: DamageMetric,
): RaidPair {
	const section =
		row.character.specs[row.slug]?.raidPerformance?.[row.metric(damageMetric)]?.[difficulty];
	let state: RaidPair["state"] = section?.collection.state ?? "unqueried";
	// A TTL skip that kept real rows is retained data, not "not fetched": an all-"no-kills" section is "기록 없음".
	if (state === "skipped" && section?.rows.some((r) => r.state !== "unavailable"))
		state = section.rows.some((r) => r.state === "recorded") ? "ok" : "empty";
	return {
		best: section?.summary.bestPerformanceAverage ?? null,
		median: section?.summary.medianPerformanceAverage ?? null,
		state,
	};
}

export type RowSortKey =
	| "config"
	| "ilvl"
	| "score"
	| "heroic"
	| "heroicMedian"
	| "heroicPoints"
	| "heroicKills"
	| "mythic"
	| "mythicMedian"
	| "mythicPoints"
	| "mythicKills";

/**
 * Stable descending sort; unknown values last; config order breaks ties.
 * All Stars points depend on the selected patch and kill counts on the raid's boss list,
 * so the caller supplies those lookups.
 */
export function sortRows(
	rows: SpecRow[],
	key: RowSortKey,
	damageMetric: DamageMetric,
	starPoints?: (row: SpecRow, difficulty: RaidDifficulty) => number | null,
	kills?: (row: SpecRow, difficulty: RaidDifficulty) => number | null,
): SpecRow[] {
	if (key === "config") return [...rows];
	const value = (row: SpecRow): number | null => {
		if (key === "ilvl") return characterIlvl(row.character);
		if (key === "score") return characterMythicPlus(row.character)?.score ?? null;
		const difficulty: RaidDifficulty = key.startsWith("heroic") ? "Heroic" : "Mythic";
		if (key.endsWith("Points")) return starPoints?.(row, difficulty) ?? null;
		if (key.endsWith("Kills")) return kills?.(row, difficulty) ?? null;
		const pair = rowRaid(row, difficulty, damageMetric);
		return key.endsWith("Median") ? pair.median : pair.best;
	};
	return rows
		.map((row, index) => ({ row, index, v: value(row) }))
		.sort((a, b) => {
			if (a.v === null && b.v === null) return a.index - b.index;
			if (a.v === null) return 1;
			if (b.v === null) return -1;
			return b.v - a.v || a.index - b.index;
		})
		.map((entry) => entry.row);
}

export interface DungeonColumn {
	key: string;
	name: string;
	shortName: string;
}

/** Dungeons seen in any character's best runs, ordered by the M+ zone list when available. */
export function dungeonColumns(snapshot: Snapshot): DungeonColumn[] {
	const seen = new Map<string, DungeonColumn>();
	for (const character of snapshot.characters) {
		for (const run of characterMythicPlus(character)?.bestRuns ?? []) {
			if (!seen.has(run.dungeon))
				seen.set(run.dungeon, { key: run.dungeon, name: run.dungeon, shortName: run.shortName });
		}
	}
	const order = snapshot.mythicPlusZone?.encounters.map((e) => e.name) ?? [];
	const rank = (name: string) => {
		const index = order.indexOf(name);
		return index === -1 ? Number.MAX_SAFE_INTEGER : index;
	};
	return [...seen.values()].sort(
		(a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
	);
}

/** Best run per dungeon: highest key level, timed beats untimed, then higher score. */
export function bestRunByDungeon(character: CharacterData): Map<string, MythicPlusRun> {
	const result = new Map<string, MythicPlusRun>();
	for (const run of characterMythicPlus(character)?.bestRuns ?? []) {
		const current = result.get(run.dungeon);
		const better =
			!current ||
			run.keystoneLevel > current.keystoneLevel ||
			(run.keystoneLevel === current.keystoneLevel &&
				(Number(run.inTime) > Number(current.inTime) ||
					(run.inTime === current.inTime && run.score > current.score)));
		if (better) result.set(run.dungeon, run);
	}
	return result;
}

export function average(values: Array<number | null>): number | null {
	const numbers = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
	return numbers.length ? numbers.reduce((sum, v) => sum + v, 0) / numbers.length : null;
}

export function missingRaidLabel(state: SpecRaidValue["state"]): string {
	if (state === "failed" || state === "partial") return "조회 실패";
	if (state === "skipped" || state === "unqueried") return "미조회";
	return "기록 없음";
}

/**
 * Raider.IO tier colours (e.g. #a335ee, #0070dd) are tuned for light backgrounds.
 * For text on the dark dashboard, mix in white so it meets WCAG AA contrast; bars keep the raw colour.
 */
export function readableOnDark(hex: string | undefined, mix = 0.35): string | undefined {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
	if (!match?.[1]) return hex;
	const value = Number.parseInt(match[1], 16);
	const channel = (shift: number) => {
		const c = (value >> shift) & 0xff;
		return Math.round(c + (255 - c) * mix);
	};
	return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

// ── Item level bands (Midnight Season 2, Mistcrest upgrade tracks) ──
// 331 and 321 are the owner's graduation targets for Myth and Hero Mistcrests; 308 is Champion 6/6.
// Update these per season (see docs/admin-guidelines.md).
export const ILVL_TIERS: Array<{ min: number; label: string; band: string }> = [
	{ min: 331, label: "신화 문장 졸업", band: "orange" },
	{ min: 321, label: "영웅 문장 졸업", band: "purple" },
	{ min: 308, label: "챔피언 문장 졸업", band: "blue" },
	{ min: 292, label: "챔피언 트랙", band: "green" },
];

export function ilvlTier(ilvl: number): { label: string; band: string } {
	return ILVL_TIERS.find((tier) => ilvl >= tier.min) ?? { label: "챔피언 트랙 미만", band: "grey" };
}
