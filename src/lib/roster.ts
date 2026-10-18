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

export function isHealerSlug(slug: string): boolean {
	return ALL_SPECS.find((spec) => spec.specSlug === slug)?.role === "healer";
}

/** Healers always use HPS; other specs follow the selected damage metric. */
export function rosterMetric(slug: string, damageMetric: DamageMetric): RaidMetric {
	return isHealerSlug(slug) ? "hps" : damageMetric;
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

export function specRaidValues(
	character: CharacterData,
	difficulty: RaidDifficulty,
	damageMetric: DamageMetric,
): SpecRaidValue[] {
	return character.specOrder.flatMap((slug) => {
		const spec = character.specs[slug];
		if (!spec) return [];
		const metric = rosterMetric(slug, damageMetric);
		const section = spec.raidPerformance?.[metric]?.[difficulty];
		const summary = section?.summary;
		return [
			{
				slug,
				specName: spec.specName,
				metric,
				best: summary?.bestPerformanceAverage ?? null,
				median: summary?.medianPerformanceAverage ?? null,
				state: section?.collection.state ?? "unqueried",
			},
		];
	});
}

/** Highest best-percentile among a character's specs, for sorting only. */
export function maxBest(values: SpecRaidValue[]): number | null {
	const numbers = values.map((v) => v.best).filter((v): v is number => typeof v === "number");
	return numbers.length ? Math.max(...numbers) : null;
}

export type RosterSortKey = "config" | "ilvl" | "score" | "heroic" | "mythic";

export function sortRoster(
	characters: CharacterData[],
	key: RosterSortKey,
	damageMetric: DamageMetric,
): CharacterData[] {
	if (key === "config") return [...characters];
	const value = (character: CharacterData): number | null => {
		if (key === "ilvl") return characterIlvl(character);
		if (key === "score") return characterMythicPlus(character)?.score ?? null;
		return maxBest(specRaidValues(character, key === "heroic" ? "Heroic" : "Mythic", damageMetric));
	};
	// Stable sort: descending, unknown values last, config order breaks ties.
	return characters
		.map((character, index) => ({ character, index, v: value(character) }))
		.sort((a, b) => {
			if (a.v === null && b.v === null) return a.index - b.index;
			if (a.v === null) return 1;
			if (b.v === null) return -1;
			return b.v - a.v || a.index - b.index;
		})
		.map((entry) => entry.character);
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
