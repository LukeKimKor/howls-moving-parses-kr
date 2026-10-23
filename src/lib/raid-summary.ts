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
 * Why the selected patch shows no All Stars value (or a "—" in one of its cells). A failed,
 * partial, deferred or unfetched lookup is named first, because then the selected patch may
 * still have a record; entries kept for other patches are only added after it. "No record in
 * this patch" is stated only when the section was collected successfully. Undefined when the
 * selected entry has both points and rank.
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
	const known = (value: number | null | undefined) => value != null && Number.isFinite(value);
	if (selected.length > 1) return "이 패치 기록이 여러 개라 표시하지 않음";
	const [only] = selected;
	if (only) return known(only.points) && known(only.rank) ? undefined : "WCL 응답에 값 없음";
	const others = [
		...new Set(
			entries.map((star) =>
				raidPatchLabel(snapshot.raid?.id, star.partition, snapshot.raidPatchMetadata),
			),
		),
	].join(", ");
	const state = section?.collection.state;
	const lookup =
		state === "failed" || state === "partial"
			? "All Stars 조회 실패"
			: section?.collection.deferred
				? "All Stars 갱신 보류"
				: // A TTL skip that kept real rows is retained data, not "not fetched" (same rule as rowRaid).
					!section || (state === "skipped" && section.rows.every((r) => r.state === "unavailable"))
					? "All Stars 미조회"
					: undefined;
	if (lookup) return others ? `${lookup} · ${others}에 이전 기록 있음` : lookup;
	return others ? `이 패치 기록 없음 · ${others}에 있음` : "이 패치 기록 없음";
}
