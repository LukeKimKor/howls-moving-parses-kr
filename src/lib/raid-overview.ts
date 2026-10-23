import type {
	CharacterSpecData,
	RaidDifficulty,
	RaidDifficultyData,
	RaidMetric,
	Snapshot,
} from "../types/snapshot.js";

export const RAID_METRIC_LABELS: Record<RaidMetric, string> = {
	dps: "전체 피해",
	bossdps: "우두머리 피해",
	hps: "치유량",
};
export const SPEC_LABELS: Record<string, string> = {
	Arcane: "비전",
	Arms: "무기",
	Havoc: "파멸",
	Devourer: "포식",
	Preservation: "보존",
	Unholy: "부정",
	Windwalker: "풍운",
	Demonology: "악마",
	Shadow: "암흑",
	Balance: "조화",
	Marksmanship: "사격",
	Assassination: "암살",
	Elemental: "정기",
	Holy: "신성",
};

export function raidEncounters(
	snapshot: Snapshot,
): Array<{ id: number; name: string; imageUrl?: string }> {
	if (snapshot.raid?.encounters.length) return snapshot.raid.encounters;
	// Older published snapshots retain only populated rows. Heroic usually has the complete order.
	const parses = snapshot.characters.flatMap((c) =>
		Object.values(c.specs).flatMap((s) => s.logs?.raidParses ?? []),
	);
	const names = [
		...new Set(
			[...parses.filter((p) => p.difficulty === "Heroic"), ...parses].map((p) => p.bossName),
		),
	];
	return names.map((name) => ({ id: 0, name }));
}

/** Existing real DPS/HPS rows remain usable, without fabricating newly requested statistics. */
export function raidSection(
	spec: CharacterSpecData,
	metric: RaidMetric,
	difficulty: RaidDifficulty,
	encounters: Array<{ id: number; name: string }>,
	previousAt: string,
): RaidDifficultyData {
	const current = spec.raidPerformance?.[metric]?.[difficulty];
	const cachedAt =
		spec.collection?.raid.retainedAt ?? spec.collection?.raid.lastSuccessAt ?? previousAt;
	const legacy =
		metric === "bossdps"
			? []
			: (spec.logs?.raidParses ?? []).filter((p) => p.difficulty === difficulty);
	if (
		current &&
		(current.rows.some((r) => r.state === "recorded") ||
			!legacy.length ||
			(current.collection.state !== "failed" &&
				current.collection.state !== "partial" &&
				!current.collection.deferred))
	)
		return current;
	return {
		metric,
		difficulty,
		partition: null,
		collection: current
			? { ...current.collection, retainedAt: current.collection.retainedAt ?? cachedAt }
			: {
					state: "skipped",
					attemptedRequests: 0,
					failedRequests: 0,
					issues: [
						legacy.length
							? "이전 실제 로그 캐시 · 요약·처치·최단시간·Med·All Stars 통계는 아직 미조회"
							: "이 지표·난이도의 새 통계는 아직 조회하지 않았습니다.",
					],
					retainedAt: legacy.length ? cachedAt : undefined,
				},
		summary: {
			bestPerformanceAverage: null,
			medianPerformanceAverage: null,
			killsLogged: null,
			allStars: [],
		},
		rows: encounters.map((encounter) => {
			const old = legacy.find((p) => p.bossName === encounter.name);
			return {
				encounterId: encounter.id,
				bossName: encounter.name,
				state: old ? "recorded" : "unavailable",
				specName: old ? spec.specName : null,
				bestPercent: old?.bestPercent ?? null,
				bestAmount: old?.bestAmount ?? null,
				kills: null,
				fastestKillMs: null,
				medianPercent: null,
				allStarPoints: null,
				allStarRank: null,
			};
		}),
	};
}

/** Bosses with a recorded kill for this spec/metric/difficulty (the same count the raid log cards show). */
export function killedBossCount(section: RaidDifficultyData): number {
	return section.rows.filter((r) => r.state === "recorded").length;
}

/** Boss list for a spec: the raid's encounter order plus any boss only present in collected rows. */
export function raidBossNames(
	encounters: Array<{ name: string }>,
	sections: RaidDifficultyData[],
): string[] {
	return [
		...new Set([
			...encounters.map((e) => e.name),
			...sections.flatMap((s) => s.rows.map((r) => r.bossName)),
		]),
	];
}

export interface KillProgress {
	difficulty: RaidDifficulty;
	killed: number;
	total: number;
	/** Collection state of the section (failed/partial means the count may be low). */
	state: RaidDifficultyData["collection"]["state"];
	/**
	 * True when the count is real: collection succeeded, or a boss row carries data ("recorded"/"no-kills").
	 * Retained cache keeps state "skipped" but is still real, so a 0 is shown as 0/10, not "미조회".
	 */
	known: boolean;
	/**
	 * True when a known count comes from data kept after a failed, partial or deferred refresh,
	 * so the overview can mark it instead of letting it read as a fresh success.
	 */
	retained: boolean;
	/** When the retained data was originally collected, if recorded. */
	retainedAt?: string;
}

/**
 * Heroic/Mythic kill progress for one spec row, built exactly like the raid log boss card
 * (raidSection per difficulty, recorded rows over the shared boss list).
 */
export function specKillProgress(
	spec: CharacterSpecData,
	metric: RaidMetric,
	encounters: Array<{ id: number; name: string }>,
	previousAt: string,
): Record<RaidDifficulty, KillProgress> {
	const heroic = raidSection(spec, metric, "Heroic", encounters, previousAt);
	const mythic = raidSection(spec, metric, "Mythic", encounters, previousAt);
	const total = raidBossNames(encounters, [heroic, mythic]).length;
	const progress = (section: RaidDifficultyData): KillProgress => {
		const { state, deferred, retainedAt } = section.collection;
		return {
			difficulty: section.difficulty,
			killed: killedBossCount(section),
			total,
			state,
			known:
				state === "ok" || state === "empty" || section.rows.some((r) => r.state !== "unavailable"),
			retained: state === "failed" || state === "partial" || Boolean(deferred),
			retainedAt,
		};
	};
	return { Heroic: progress(heroic), Mythic: progress(mythic) };
}
