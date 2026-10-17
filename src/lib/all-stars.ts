import { ALL_SPECS } from "../data/specs.js";
import type { RaidDifficultyData, RaidMetric } from "../types/snapshot.js";

export type AllStarEntry = RaidDifficultyData["summary"]["allStars"][number];

// Only add names verified against WCL's zone-specific metadata. IDs are not patch versions.
const verifiedPatchNames: Readonly<Record<number, Readonly<Record<number, string>>>> = {};

export function raidPatchLabel(zoneId: number | undefined, partition: number | null | undefined) {
	return (
		(zoneId == null || partition == null ? undefined : verifiedPatchNames[zoneId]?.[partition]) ??
		"패치명 미확인"
	);
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
