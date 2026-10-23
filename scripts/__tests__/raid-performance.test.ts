import { describe, expect, it, vi } from "vitest";
import { specKillProgress } from "../../src/lib/raid-overview.js";
import { rowRaid, specRows } from "../../src/lib/roster.js";
import { characterShell } from "../fetch-data.js";
import {
	type RaidQuery,
	failedRaidPerformance,
	fetchRaidPerformance,
	mapRaidDifficulty,
	verifyRaidMetricSchema,
} from "../raid-performance.js";
import { WclDeferredError } from "../wcl-runtime.js";

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

const previousSuccessAt = "2026-10-16T20:00:00.000Z";
async function previousRaidPerformance() {
	const query: RaidQuery = async () =>
		({
			characterData: { character: { dps4: raw, dps5: raw, bossdps4: raw, bossdps5: raw } },
		}) as never;
	const previous = await fetchRaidPerformance(query, identity, 53, "Arcane", false, encounters, [
		"dps",
		"bossdps",
	]);
	for (const metric of Object.values(previous))
		for (const difficulty of Object.values(metric))
			difficulty.collection.lastSuccessAt = previousSuccessAt;
	return previous;
}

describe("raid metrics and difficulty collection", () => {
	it("keeps WCL's All Stars rank percentile and total for rank colouring", () => {
		const mapped = mapRaidDifficulty(
			{
				...raw,
				allStars: [
					{ spec: "Arcane", points: 101.25, rank: "12", rankPercent: "99.53", total: 4210 },
				],
			},
			"dps",
			"Heroic",
			encounters,
			status,
		);
		expect(mapped.summary.allStars[0]).toMatchObject({ rank: 12, rankPercent: 99.53, total: 4210 });
		// Older payloads without the fields stay valid and simply carry no colour data.
		const legacy = mapRaidDifficulty(raw, "dps", "Heroic", encounters, status);
		expect(legacy.summary.allStars[0]?.rankPercent).toBeNull();
	});

	it("keeps completed Damage when later Boss Damage is deferred, then reuses fresh selections", async () => {
		let calls = 0;
		const query: RaidQuery = async () => {
			calls++;
			if (calls === 2) throw new WclDeferredError("budget deferred", Date.now() + 60_000);
			return { characterData: { character: { dps4: raw, dps5: raw } } } as never;
		};
		const first = await fetchRaidPerformance(query, identity, 53, "Arcane", false, encounters, [
			"dps",
			"bossdps",
		]);
		expect(first.dps?.Heroic.collection.state).toBe("ok");
		expect(first.bossdps?.Heroic.collection.deferred).toBe(true);
		expect(first.dps?.Heroic.rows[0]?.bestAmount).toBe(123456.7);
		const retry = vi.fn(async () => ({
			characterData: { character: { bossdps4: raw, bossdps5: raw } },
		}));
		const second = await fetchRaidPerformance(
			retry as RaidQuery,
			identity,
			53,
			"Arcane",
			false,
			encounters,
			["dps", "bossdps"],
			first,
			undefined,
			true,
			4 * 60 * 60_000,
		);
		expect(retry).toHaveBeenCalledTimes(1);
		expect(retry.mock.calls[0]).toBeDefined();
		expect(second.dps?.Heroic.collection.retainedAt).toBe(
			first.dps?.Heroic.collection.lastSuccessAt,
		);
		expect(second.bossdps?.Heroic.collection.state).toBe("ok");
	});
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
	it("bounds each KR/spec-scoped HTTP query to one metric and two difficulties", async () => {
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
		expect(query).toHaveBeenCalledTimes(2);
		expect(query.mock.calls[0]?.[0]).not.toContain("metric: bossdps");
		expect(query.mock.calls[1]?.[0]).toContain("metric: bossdps");
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
		expect(result.bossdps?.Mythic.collection.issues).toEqual(["WCL 레이드 조회 실패"]);
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
	it.each([
		{ label: "characterData parent", path: ["characterData"] },
		{ label: "character parent", path: ["characterData", "character"] },
		{ label: "root", path: [] },
	])("preserves every affected cached panel for a $label GraphQL error", async ({ path }) => {
		const previous = await previousRaidPerformance();
		const fresh = { ...raw, rankings: raw.rankings.map((r) => ({ ...r, bestAmount: 999999 })) };
		const query: RaidQuery = async (_query, _variables, onErrors) => {
			onErrors?.([{ message: "Synthetic parent error", path }]);
			return {
				characterData: {
					character: { dps4: fresh, dps5: fresh, bossdps4: fresh, bossdps5: fresh },
				},
			} as never;
		};
		const result = await fetchRaidPerformance(
			query,
			identity,
			53,
			"Arcane",
			false,
			encounters,
			["dps", "bossdps"],
			previous,
		);
		for (const metric of Object.values(result))
			for (const section of Object.values(metric)) {
				expect(section.collection.state).toBe("partial");
				expect(section.collection.failedRequests).toBe(1);
				expect(section.collection.lastSuccessAt).toBeUndefined();
				expect(section.collection.retainedAt).toBe(previousSuccessAt);
				expect(section.rows[0]?.bestAmount).toBe(123456.7);
			}
	});
	it.each([
		{ label: "null character", data: { characterData: { character: null } } },
		{ label: "null characterData", data: { characterData: null } },
	])(
		"does not classify a $label response without errors as successful empty records",
		async ({ data }) => {
			const previous = await previousRaidPerformance();
			const query: RaidQuery = async () => data as never;
			const result = await fetchRaidPerformance(
				query,
				identity,
				53,
				"Arcane",
				false,
				encounters,
				["dps", "bossdps"],
				previous,
			);
			for (const metric of Object.values(result))
				for (const section of Object.values(metric)) {
					expect(section.collection.state).toBe("failed");
					expect(section.collection.failedRequests).toBe(1);
					expect(section.collection.lastSuccessAt).toBeUndefined();
					expect(section.collection.retainedAt).toBe(previousSuccessAt);
					expect(section.rows[0]?.bestAmount).toBe(123456.7);
				}
		},
	);
	it("retains only the missing alias when its zone response is null without errors", async () => {
		const previous = await previousRaidPerformance();
		const query: RaidQuery = async () =>
			({
				characterData: { character: { dps4: raw, dps5: raw, bossdps4: raw, bossdps5: null } },
			}) as never;
		const result = await fetchRaidPerformance(
			query,
			identity,
			53,
			"Arcane",
			false,
			encounters,
			["dps", "bossdps"],
			previous,
		);
		expect(result.dps?.Heroic.collection.state).toBe("ok");
		expect(result.bossdps?.Mythic.collection.state).toBe("failed");
		expect(result.bossdps?.Mythic.collection.retainedAt).toBe(previousSuccessAt);
		expect(result.bossdps?.Mythic.rows[0]?.bestAmount).toBe(123456.7);
	});
	it("still accepts a valid empty rankings array and clears stale records", async () => {
		const previous = await previousRaidPerformance();
		const empty = { rankings: [] };
		const query: RaidQuery = async () =>
			({
				characterData: {
					character: { dps4: empty, dps5: empty, bossdps4: empty, bossdps5: empty },
				},
			}) as never;
		const result = await fetchRaidPerformance(
			query,
			identity,
			53,
			"Arcane",
			false,
			encounters,
			["dps", "bossdps"],
			previous,
		);
		expect(result.dps?.Heroic.collection.state).toBe("empty");
		expect(result.dps?.Heroic.collection.failedRequests).toBe(0);
		expect(result.dps?.Heroic.collection.lastSuccessAt).toBeTruthy();
		expect(result.dps?.Heroic.collection.retainedAt).toBeUndefined();
		expect(result.dps?.Heroic.rows[0]?.bestAmount).toBeNull();
	});
});

describe("retained successful zero-kill and empty sections", () => {
	it.each(["no-kills", "empty"])(
		"retains confirmed %s and its original timestamp across repeated failures",
		async (kind) => {
			const empty = {
				rankings:
					kind === "empty"
						? []
						: encounters.map((encounter) => ({ encounter, totalKills: 0, rankPercent: null })),
			};
			const success: RaidQuery = async () =>
				({
					characterData: {
						character: { dps4: empty, dps5: empty, bossdps4: empty, bossdps5: empty },
					},
				}) as never;
			const previous = await fetchRaidPerformance(
				success,
				identity,
				53,
				"Arcane",
				false,
				encounters,
				["dps", "bossdps"],
			);
			for (const metric of Object.values(previous))
				for (const section of Object.values(metric))
					section.collection.lastSuccessAt = previousSuccessAt;
			const failure: RaidQuery = async () => {
				throw Error("Synthetic query failure");
			};
			const failed = await fetchRaidPerformance(
				failure,
				identity,
				53,
				"Arcane",
				false,
				encounters,
				["dps", "bossdps"],
				previous,
			);
			const character = characterShell({
				name: "Fixture",
				realm: "Azshara",
				region: "kr",
				class: "Mage",
				default: true,
				specs: [{ spec: "Arcane", role: "main" }],
			});
			const spec = character.specs["arcane-mage"];
			if (!spec) throw Error("Synthetic spec missing");
			spec.raidPerformance = failed;
			const row = specRows([character])[0];
			if (!row) throw Error("Synthetic row missing");
			expect(rowRaid(row, "Heroic", "dps").state).toBe("failed");
			const progress = specKillProgress(spec, "dps", encounters, previousSuccessAt).Heroic;
			expect(progress.state).toBe("failed");
			expect(progress.killed).toBe(0);
			const repeated = failedRaidPerformance(false, encounters, failed, "2026-10-23T00:00:00.000Z");
			for (const result of [failed, repeated])
				for (const [metric, sections] of Object.entries(result))
					for (const [difficulty, section] of Object.entries(sections)) {
						expect(section.collection.state).toBe("failed");
						expect(section.collection.retainedAt).toBe(previousSuccessAt);
						expect(section.collection.lastSuccessAt).toBeUndefined();
						expect(section.rows).toEqual(previous[metric as "dps"]?.[difficulty as "Heroic"]?.rows);
						expect(section.summary).toEqual(
							previous[metric as "dps"]?.[difficulty as "Heroic"]?.summary,
						);
					}
		},
	);
});
