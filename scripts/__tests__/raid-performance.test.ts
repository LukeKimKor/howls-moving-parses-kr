import { describe, expect, it, vi } from "vitest";
import {
	type RaidQuery,
	fetchRaidPerformance,
	mapRaidDifficulty,
	verifyRaidMetricSchema,
} from "../raid-performance.js";

// Synthetic API fixtures, never published or written to the live snapshot.
const encounters = [
	{ id: 1, name: "Fixture Boss" },
	{ id: 2, name: "Unkilled Boss" },
];
const raw = {
	bestPerformanceAverage: 81.3,
	medianPerformanceAverage: 64.2,
	partition: 9,
	allStars: [{ spec: "Arcane", points: 101.25, rank: "12" }],
	rankings: [
		{
			encounter: { id: 1, name: "Fixture Boss" },
			rankPercent: 87.4,
			medianPercent: 61.2,
			bestAmount: 123456.7,
			totalKills: 3,
			fastestKill: 125000,
			bestSpec: "Arcane",
			allStars: { points: 77.25, rank: "123" },
		},
		{
			encounter: { id: 2, name: "Unkilled Boss" },
			rankPercent: null,
			medianPercent: null,
			bestAmount: 0,
			totalKills: 0,
			fastestKill: 0,
		},
	],
};
const identity = { name: "Synthetic 캐릭터", realm: "azshara", region: "kr" };
const status = { state: "ok" as const, attemptedRequests: 1, failedRequests: 0, issues: [] };

describe("raid metrics and difficulty collection", () => {
	it("keeps percentiles, DPS, median, kills, duration and All Stars in distinct fields", () => {
		const result = mapRaidDifficulty(raw, "dps", "Heroic", encounters, status);
		expect(result.rows[0]).toMatchObject({
			bestPercent: 87.4,
			bestAmount: 123456.7,
			medianPercent: 61.2,
			kills: 3,
			fastestKillMs: 125000,
			allStarPoints: 77.25,
			allStarRank: 123,
		});
		expect(result.summary).toMatchObject({
			bestPerformanceAverage: 81.3,
			medianPerformanceAverage: 64.2,
			killsLogged: 3,
		});
		expect(result.rows[1]).toMatchObject({
			state: "no-kills",
			kills: 0,
			bestPercent: null,
			bestAmount: null,
			fastestKillMs: null,
		});
	});
	it("does not invent zero kills or medians for missing response fields", () => {
		const result = mapRaidDifficulty({ rankings: [] }, "bossdps", "Mythic", encounters, status);
		expect(result.rows[0]).toMatchObject({ state: "unavailable", kills: null, bestAmount: null });
		expect(result.summary.killsLogged).toBeNull();
		expect(result.summary.medianPerformanceAverage).toBeNull();
	});
	it("batches all four DPS selections into one KR/spec-scoped HTTP query", async () => {
		const query = vi.fn(async (_query: string, _variables?: Record<string, unknown>) => ({
			characterData: {
				character: {
					dps4: raw,
					dps5: raw,
					bossdps4: { ...raw, rankings: [{ ...raw.rankings[0], bestAmount: 45678 }] },
					bossdps5: raw,
				},
			},
		}));
		const result = await fetchRaidPerformance(
			query as RaidQuery,
			identity,
			53,
			"Arcane",
			false,
			encounters,
			["dps", "bossdps", "hps"],
		);
		expect(query).toHaveBeenCalledTimes(1);
		expect(query.mock.calls[0]?.[0]).toContain("metric: bossdps");
		expect(query.mock.calls[0]?.[1]).toMatchObject({
			region: "KR",
			realm: "azshara",
			specName: "Arcane",
		});
		expect(result.dps?.Heroic.rows[0]?.bestAmount).toBe(123456.7);
		expect(result.bossdps?.Heroic.rows[0]?.bestAmount).toBe(45678);
	});
	it("collects only Healing for healers", async () => {
		const query = vi.fn(async (_query: string, _variables?: Record<string, unknown>) => ({
			characterData: { character: { hps4: raw, hps5: raw } },
		}));
		const result = await fetchRaidPerformance(
			query as RaidQuery,
			identity,
			53,
			"Preservation",
			true,
			encounters,
			["dps", "bossdps", "hps"],
		);
		expect(Object.keys(result)).toEqual(["hps"]);
		expect(query.mock.calls[0]?.[0]).toContain("metric: hps");
		expect(query.mock.calls[0]?.[0]).not.toContain("metric: dps");
	});
	it("keeps unverified Boss Damage unqueried instead of copying Damage", async () => {
		const query = vi.fn(async (_query: string, _variables?: Record<string, unknown>) => ({
			characterData: { character: { dps4: raw, dps5: raw } },
		}));
		const result = await fetchRaidPerformance(
			query as RaidQuery,
			identity,
			53,
			"Arcane",
			false,
			encounters,
			["dps", "hps"],
		);
		expect(query.mock.calls[0]?.[0]).not.toContain("metric: bossdps");
		expect(result.bossdps?.Heroic.collection.state).toBe("skipped");
		expect(result.bossdps?.Heroic.rows[0]?.bestAmount).toBeNull();
	});
	it("preserves good cached values with failure and age when HTTP 429 exhausts retries", async () => {
		const good = (async () => ({
			characterData: { character: { dps4: raw, dps5: raw, bossdps4: raw, bossdps5: raw } },
		})) as RaidQuery;
		const previous = await fetchRaidPerformance(good, identity, 53, "Arcane", false, encounters, [
			"dps",
			"bossdps",
		]);
		const query = vi.fn().mockRejectedValue(new Error("WCL HTTP 429"));
		const result = await fetchRaidPerformance(
			query,
			identity,
			53,
			"Arcane",
			false,
			encounters,
			["dps", "bossdps"],
			previous,
			"2026-10-16T22:00:00Z",
		);
		expect(result.bossdps?.Mythic.collection.state).toBe("failed");
		expect(result.bossdps?.Mythic.collection.retainedAt).toBeTruthy();
		expect(result.bossdps?.Mythic.rows[0]?.bestAmount).toBe(123456.7);
	});
	it("marks only the affected alias when GraphQL returns partial data/errors", async () => {
		const query: RaidQuery = async (_query, _variables, onErrors) => {
			onErrors?.([{ message: "fixture error", path: ["characterData", "character", "bossdps5"] }]);
			return {
				characterData: { character: { dps4: raw, dps5: raw, bossdps4: raw, bossdps5: null } },
			} as never;
		};
		const result = await fetchRaidPerformance(query, identity, 53, "Arcane", false, encounters, [
			"dps",
			"bossdps",
		]);
		expect(result.dps?.Heroic.collection.state).toBe("ok");
		expect(result.bossdps?.Mythic.collection.state).toBe("failed");
	});
	it("checks the actual enum once and leaves unknown definitions unavailable on denial", async () => {
		const query = vi.fn().mockResolvedValue({
			__type: { enumValues: ["dps", "bossdps", "hps"].map((name) => ({ name })) },
		});
		expect((await verifyRaidMetricSchema(query)).supported).toEqual(["dps", "bossdps", "hps"]);
		expect(query).toHaveBeenCalledTimes(1);
		expect(
			(await verifyRaidMetricSchema(vi.fn().mockRejectedValue(new Error("WCL HTTP 403")))).state,
		).toBe("unavailable");
	});
});
