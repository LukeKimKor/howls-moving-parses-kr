import { describe, expect, it } from "vitest";
import {
	selectedSummaryStar,
	summaryMetric,
	summaryPatchOptions,
	summaryStarMissingNote,
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

	it("names a failed, partial or deferred lookup before the records kept for other patches", () => {
		// Only 12.1 (id 99) is kept; the selected patch is 12.1.5 (id 1).
		const withState = (
			collection: Record<string, unknown>,
			rows: Array<{ state: string }> = [],
		) => {
			const data = fixture();
			const heroic = data.characters[0]?.specs["arcane-mage"]?.raidPerformance?.dps?.Heroic;
			if (!heroic) throw new Error("fixture");
			heroic.summary.allStars = heroic.summary.allStars.filter((s) => s.partition === 99);
			Object.assign(heroic, {
				collection: { attemptedRequests: 1, failedRequests: 0, issues: [], ...collection },
				rows,
			});
			return summaryStarMissingNote(data, 0, "arcane-mage", "dps", "Heroic", 1);
		};
		expect(withState({ state: "failed", failedRequests: 1 })).toBe(
			"All Stars 조회 실패 · 12.1에 이전 기록 있음",
		);
		expect(withState({ state: "partial", failedRequests: 1 })).toBe(
			"All Stars 조회 실패 · 12.1에 이전 기록 있음",
		);
		expect(withState({ state: "skipped", deferred: true })).toBe(
			"All Stars 갱신 보류 · 12.1에 이전 기록 있음",
		);
		expect(withState({ state: "skipped" }, [{ state: "unavailable" }])).toBe(
			"All Stars 미조회 · 12.1에 이전 기록 있음",
		);
		// Only a successful lookup (or a TTL reuse of one) settles "no record in this patch".
		expect(withState({ state: "ok" })).toBe("이 패치 기록 없음 · 12.1에 있음");
		expect(withState({ state: "skipped", cacheHits: 1 }, [{ state: "no-kills" }])).toBe(
			"이 패치 기록 없음 · 12.1에 있음",
		);
	});
	it("explains a selected patch with duplicate entries or a missing points/rank value", () => {
		const data = fixture();
		const heroic = data.characters[0]?.specs["arcane-mage"]?.raidPerformance?.dps?.Heroic;
		if (!heroic) throw new Error("fixture");
		const note = () => summaryStarMissingNote(data, 0, "arcane-mage", "dps", "Heroic", 1);
		// Zero is a real value, not a missing one.
		expect(note()).toBeUndefined();
		heroic.summary.allStars = [{ spec: "Arcane", partition: 1, points: null, rank: 4 }];
		expect(note()).toBe("WCL 응답에 값 없음");
		heroic.summary.allStars = [{ spec: "Arcane", partition: 1, points: 12, rank: null }];
		expect(note()).toBe("WCL 응답에 값 없음");
		heroic.summary.allStars = [
			{ spec: "Arcane", partition: 1, points: 12, rank: 4 },
			{ spec: "Arcane", partition: 1, points: 13, rank: 3 },
		];
		expect(selectedSummaryStar(data, 0, "arcane-mage", "dps", "Heroic", 1)).toBeUndefined();
		expect(note()).toBe("이 패치 기록이 여러 개라 표시하지 않음");
	});
});
