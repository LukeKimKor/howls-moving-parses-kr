import { ALL_SPECS } from "../data/specs.js";
import type { RaidDifficultyData, RaidMetric, RaidPatchMetadata } from "../types/snapshot.js";

export type AllStarEntry = RaidDifficultyData["summary"]["allStars"][number];

export function raidPatchLabel(
	zoneId: number | undefined,
	partition: number | null | undefined,
	metadata?: RaidPatchMetadata,
) {
	if (
		zoneId != null &&
		partition != null &&
		metadata?.zoneId === zoneId &&
		metadata.source === "WCL API worldData.zone.partitions" &&
		Array.isArray(metadata.partitions)
	) {
		const name = metadata.partitions.find((patch) => patch.id === partition)?.name;
		if (typeof name === "string" && name.trim()) return name;
	}
	return "패치명 미확인";
}

export function primaryRaidMetric(specSlug: string): RaidMetric {
	return ALL_SPECS.find((spec) => spec.specSlug === specSlug)?.role === "healer" ? "hps" : "dps";
}

/** Keep each source pair intact; never add, maximize, or join entries from different scopes. */
export function scopedAllStars(
	data: RaidDifficultyData | undefined,
	specName: string,
): AllStarEntry[] {
	return data?.summary.allStars.filter((entry) => entry.spec === specName) ?? [];
}

export function starPoints(value: number | null | undefined) {
	return value != null && Number.isFinite(value)
		? value.toLocaleString("en-GB", { maximumFractionDigits: 2 })
		: "—";
}

export function starRank(value: number | null | undefined) {
	return value != null && Number.isFinite(value) ? `${value.toLocaleString("en-GB")}위` : "—";
}
