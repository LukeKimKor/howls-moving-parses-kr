import { describe, expect, it } from "vitest";
import {
	selectedSummaryStar,
	summaryMetric,
	summaryPatchOptions,
} from "../../../lib/raid-summary.js";
import type { Snapshot } from "../../../types/snapshot.js";

// Synthetic ordering/scope probes. These do not modify the real public cache.
const fixture = () =>
	({
		raid: { id: 53 },
		characters: [
			{
				specs: {
					"arcane-mage": {
						specName: "Arcane",
						raidPerformance: {
							dps: {
								Heroic: {
									summary: {
										allStars: [
											{ spec: "Arcane", partition: 99, points: 999, rank: 1 },
											{ spec: "Arcane", partition: 1, points: 0, rank: 0 },
										],
									},
								},
							},
							bossdps: {
								Heroic: {
									summary: { allStars: [{ spec: "Arcane", partition: 1, points: 50, rank: 6 }] },
								},
							},
						},
					},
				},
			},
		],
		raidPatchMetadata: {
			zoneId: 53,
			source: "WCL API worldData.zone.partitions",
			partitions: [
				{ id: 99, name: "12.1" },
				{ id: 1, name: "12.1.5" },
			],
		},
	}) as unknown as Snapshot;

describe("compact raid summary scope", () => {
	it("orders verified version names instead of partition IDs or score magnitude", () => {
		expect(summaryPatchOptions(fixture()).map((p) => p.id)).toEqual([1, 99]);
		const data = fixture();
		data.raidPatchMetadata?.partitions.push({ id: 2, name: "12.1.10" });
		expect(summaryPatchOptions(data)[0]?.id).toBe(2);
	});
	it("keeps the selected patch and metric exact, including zero, without an older fallback", () => {
		const data = fixture();
		expect(selectedSummaryStar(data, 0, "arcane-mage", "dps", "Heroic", 1)).toMatchObject({
			points: 0,
			rank: 0,
		});
		expect(selectedSummaryStar(data, 0, "arcane-mage", "bossdps", "Heroic", 1)).toMatchObject({
			points: 50,
			rank: 6,
		});
		expect(selectedSummaryStar(data, 0, "arcane-mage", "dps", "Heroic", 2)).toBeUndefined();
		expect(selectedSummaryStar(data, 0, "arcane-mage", "dps", "Mythic", 1)).toBeUndefined();
	});
	it("preserves Healing when the damage metric is switched", () => {
		expect(summaryMetric("holy-paladin", "bossdps")).toBe("hps");
		expect(summaryMetric("arcane-mage", "bossdps")).toBe("bossdps");
	});
	it("does not invent latest version names if official metadata is absent or for another zone", () => {
		const data = fixture();
		data.raidPatchMetadata = undefined;
		expect(summaryPatchOptions(data).map((p) => p.name)).toEqual([
			"패치명 미확인 · 기록 1",
			"패치명 미확인 · 기록 2",
		]);
		const other = fixture();
		if (other.raidPatchMetadata) other.raidPatchMetadata.zoneId = 99;
		expect(summaryPatchOptions(other)[0]?.name).toContain("미확인");
	});
});
