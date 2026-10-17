import type { RaidDifficulty, RaidMetric, Snapshot } from "../types/snapshot.js";
import { primaryRaidMetric, scopedAllStars } from "./all-stars.js";

export function summaryMetric(slug: string, damageMetric: "dps" | "bossdps"): RaidMetric {
	return primaryRaidMetric(slug) === "hps" ? "hps" : damageMetric;
}

/** Order actual official version names, never infer chronology from partition IDs. */
export function summaryPatchOptions(snapshot: Snapshot) {
	const metadata = snapshot.raidPatchMetadata;
	if (
		metadata &&
		metadata.zoneId === snapshot.raid?.id &&
		metadata.source === "WCL API worldData.zone.partitions"
	) {
		const version = (name: string) =>
			name
				.match(/^(?:Patch\s+)?(\d+)\.(\d+)(?:\.(\d+))?$/i)
				?.slice(1)
				.map((n) => Number(n ?? 0));
		return metadata.partitions
			.filter((patch) => patch.id > 0)
			.map((patch) => ({ ...patch }))
			.sort((a, b) => {
				const av = version(a.name);
				const bv = version(b.name);
				if (av && bv)
					for (let i = 0; i < 3; i++) {
						const difference = (bv[i] ?? 0) - (av[i] ?? 0);
						if (difference) return difference;
					}
				return Number(Boolean(bv)) - Number(Boolean(av));
			});
	}
	const ids = [
		...new Set(
			snapshot.characters.flatMap((c) =>
				Object.values(c.specs).flatMap((s) =>
					Object.values(s.raidPerformance ?? {}).flatMap((metrics) =>
						Object.values(metrics).flatMap((section) =>
							section.summary.allStars.map((star) => star.partition),
						),
					),
				),
			),
		),
	];
	return ids
		.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
		.map((id, index) => ({ id, name: `패치명 미확인 · 기록 ${index + 1}` }));
}

export function selectedSummaryStar(
	snapshot: Snapshot,
	characterIndex: number,
	slug: string,
	metric: RaidMetric,
	difficulty: RaidDifficulty,
	patchId: number | null,
) {
	const spec = snapshot.characters[characterIndex]?.specs[slug];
	if (!spec || patchId === null) return undefined;
	const entries = scopedAllStars(
		spec.raidPerformance?.[metric]?.[difficulty],
		spec.specName,
	).filter((star) => star.partition === patchId);
	return entries.length === 1 ? entries[0] : undefined;
}
