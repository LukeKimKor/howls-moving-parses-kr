import type {
	CharacterSpecData,
	RaidDifficulty,
	RaidDifficultyData,
	RaidMetric,
	Snapshot,
} from "../types/snapshot.js";

export const RAID_METRIC_LABELS: Record<RaidMetric, string> = {
	dps: "Damage",
	bossdps: "Damage to Bosses",
	hps: "Healing",
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
			(current.collection.state !== "failed" && current.collection.state !== "partial"))
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
