import type { RaidDifficulty, RaidMetric, Snapshot } from "../types/snapshot.js";
import { primaryRaidMetric, raidPatchLabel, scopedAllStars } from "./all-stars.js";

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

/**
 * Why the selected patch shows no All Stars value: the spec has entries only in other patches,
 * none at all, or the section was not (successfully) collected. Undefined when a value is shown.
 */
export function summaryStarMissingNote(
	snapshot: Snapshot,
	characterIndex: number,
	slug: string,
	metric: RaidMetric,
	difficulty: RaidDifficulty,
	patchId: number | null,
): string | undefined {
	const spec = snapshot.characters[characterIndex]?.specs[slug];
	if (!spec || patchId === null) return undefined;
	const section = spec.raidPerformance?.[metric]?.[difficulty];
	const entries = scopedAllStars(section, spec.specName);
	const selected = entries.filter((star) => star.partition === patchId);
	if (selected.length) return undefined;
	const others = [
		...new Set(
			entries.map((star) =>
				raidPatchLabel(snapshot.raid?.id, star.partition, snapshot.raidPatchMetadata),
			),
		),
	];
	if (others.length) return `이 패치 기록 없음 · ${others.join(", ")}에 있음`;
	const state = section?.collection.state;
	if (state === "failed" || state === "partial") return "All Stars 조회 실패";
	// A TTL skip that kept real rows is retained data, not "not fetched" (same rule as rowRaid).
	if (!section || (state === "skipped" && section.rows.every((r) => r.state === "unavailable")))
		return "All Stars 미조회";
	return "이 패치 기록 없음";
}
