import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { nextScheduledAt } from "../../src/lib/refresh-time.js";
import { readRefreshSchedule } from "../refresh-policy.js";
import { freshStatus, runCharacterBatches } from "../refresh-scheduler.js";
import { WclQueryCache } from "../wcl-query-cache.js";
import {
	WclDeferredError,
	WclRuntime,
	readPointBudget,
	snapshotCooldown,
	withPointBudget,
} from "../wcl-runtime.js";
import { WclTransport } from "../wcl-transport.js";

describe("actual quota samples and persistent cooldown (synthetic, zero provider calls)", () => {
	it("requires all three finite numeric fields and never assumes a fixed allowance", () => {
		for (const value of [
			null,
			{},
			{ limitPerHour: 3600 },
			{ limitPerHour: "100", pointsSpentThisHour: 0, pointsResetIn: 60 },
			{ limitPerHour: 0, pointsSpentThisHour: 0, pointsResetIn: 60 },
		])
			expect(readPointBudget(value, 0)).toBeUndefined();
		for (const limit of [25, 100, 730])
			expect(
				readPointBudget({ limitPerHour: limit, pointsSpentThisHour: 1, pointsResetIn: 60 }, 0)
					?.limitPerHour,
			).toBe(limit);
	});
	it("reserves 20% as application policy and rejects expired/invalid samples for meta", () => {
		let now = 0;
		const runtime = new WclRuntime(() => now);
		runtime.activate();
		runtime.setStage("meta");
		expect(() => runtime.beforeQuery()).toThrow("미확인");
		runtime.observeBudget({ limitPerHour: 25, pointsSpentThisHour: 19, pointsResetIn: 60 });
		expect(() => runtime.beforeQuery()).not.toThrow();
		now = 61_000;
		expect(() => runtime.beforeQuery()).toThrow("미확인");
		runtime.observeBudget({ limitPerHour: 100, pointsSpentThisHour: 80, pointsResetIn: 60 });
		expect(() => runtime.beforeQuery()).toThrow("예산");
		expect(runtime.state.cooldownUntil).toBe(121_000);
	});
	it("learns weighted query cost only within the observed reset window", () => {
		let now = 0;
		const runtime = new WclRuntime(() => now);
		runtime.activate();
		runtime.setStage("raid");
		runtime.observeBudget({ limitPerHour: 100, pointsSpentThisHour: 10, pointsResetIn: 60 });
		runtime.beforeQuery(2);
		now = 1000;
		runtime.observeBudget({ limitPerHour: 100, pointsSpentThisHour: 18, pointsResetIn: 59 });
		expect(runtime.state.maxCostPerSelection).toBe(4);
		runtime.beforeQuery(2);
		now = 2000;
		runtime.observeBudget({ limitPerHour: 100, pointsSpentThisHour: 1, pointsResetIn: 60 });
		expect(runtime.state.maxCostPerSelection).toBe(4);
	});
	it("persists 821-second Retry-After and blocks even OAuth in a new run", async () => {
		const now = Date.parse("2026-10-16T23:46:54Z");
		const runtime = new WclRuntime(() => now);
		runtime.activate();
		const request = vi.fn(
			async () => new Response(null, { status: 429, headers: { "Retry-After": "821" } }),
		);
		const transport = new WclTransport({
			fetch: request,
			now: () => now,
			random: () => 0,
			beforeRequest: () => runtime.assertCooldown(),
			onDeferred: (reason, until) => runtime.defer(reason, until),
		});
		await expect(transport.request("mock")).rejects.toBeInstanceOf(WclDeferredError);
		const state = JSON.parse(JSON.stringify(runtime.state));
		const resumed = new WclRuntime(() => now + 60_000);
		resumed.activate(state);
		const oauth = vi.fn(async () => new Response("{}"));
		const next = new WclTransport({ fetch: oauth, beforeRequest: () => resumed.assertCooldown() });
		await expect(next.request("mock-oauth")).rejects.toBeInstanceOf(WclDeferredError);
		expect(oauth).not.toHaveBeenCalled();
		expect(new Date(state.cooldownUntil).toISOString()).toBe("2026-10-17T00:00:35.000Z");
	});
	it("updates the quota before admitting the next queued request", async () => {
		const runtime = new WclRuntime(() => 0);
		runtime.activate();
		runtime.setStage("meta");
		runtime.observeBudget({ limitPerHour: 100, pointsSpentThisHour: 1, pointsResetIn: 60 });
		const request = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						data: {
							collectorBudget: { limitPerHour: 100, pointsSpentThisHour: 85, pointsResetIn: 60 },
						},
					}),
				),
		);
		const transport = new WclTransport({ fetch: request, intervalMs: 0 });
		const hooks = {
			beforeSend: () => runtime.beforeQuery(),
			afterResponse: async (r: Response) =>
				runtime.observeBudget((await r.json()).data.collectorBudget),
		};
		const result = await Promise.allSettled([
			transport.request("mock", undefined, hooks),
			transport.request("mock", undefined, hooks),
		]);
		expect(result.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
		expect(request).toHaveBeenCalledTimes(1);
	});
	it("migrates only explicit server cooldown evidence and adds quota to the same operation", () => {
		expect(
			snapshotCooldown(
				{ generatedAt: "2099-01-01", issues: ["WCL retry after 2026-10-17T00:00:35.000Z"] },
				Date.parse("2026-10-16T23:00:00Z"),
			),
		).toBe(Date.parse("2026-10-17T00:00:35Z"));
		expect(snapshotCooldown({ generatedAt: "2099-01-01" }, 0)).toBeUndefined();
		expect(withPointBudget("query X { worldData { zones { id } } }")).toContain(
			"collectorBudget: rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }",
		);
	});
});

describe("character checkpoints and query cache", () => {
	it("refreshes one unknown-budget character and retains all thirteen in every checkpoint", async () => {
		const runtime = new WclRuntime(() => 0);
		runtime.activate({ nextCharacterKey: "2" });
		runtime.setStage("raid");
		const seen: number[] = [];
		const checkpoints: number[][] = [];
		const result = await runCharacterBatches({
			items: Array.from({ length: 13 }, (_, id) => ({ id, updated: false })),
			key: (i) => String(i.id),
			fresh: () => false,
			refresh: async (i) => {
				seen.push(i.id);
				return { ...i, updated: true };
			},
			defer: (i) => i,
			checkpoint: (items) => checkpoints.push(items.map((i) => i.id)),
			runtime,
		});
		expect(seen).toEqual([2]);
		expect(checkpoints.every((c) => c.length === 13)).toBe(true);
		expect(result.filter((i) => i.updated)).toHaveLength(1);
		expect(runtime.state.nextCharacterKey).toBe("3");
	});
	it("continues serially with actual quota and skips fresh sections", async () => {
		const runtime = new WclRuntime(() => 0);
		runtime.activate();
		runtime.setStage("raid");
		runtime.observeBudget({ limitPerHour: 100, pointsSpentThisHour: 1, pointsResetIn: 60 });
		const seen: number[] = [];
		await runCharacterBatches({
			items: [0, 1, 2],
			key: String,
			fresh: (i) => i === 1,
			refresh: async (i) => {
				seen.push(i);
				return i;
			},
			defer: (i) => i,
			checkpoint: () => undefined,
			runtime,
		});
		expect(seen).toEqual([0, 2]);
		expect(
			freshStatus(
				{
					state: "empty",
					attemptedRequests: 1,
					failedRequests: 0,
					issues: [],
					lastSuccessAt: new Date(0).toISOString(),
				},
				1000,
				500,
			),
		).toBe(true);
	});
	it("reuses successful meta queries but never stale quota or null failures", () => {
		const cache = new WclQueryCache();
		cache.activate({}, () => undefined);
		const query = "query Meta { worldData { encounter { characterRankings { rankings } } } }";
		cache.put(
			query,
			undefined,
			"meta",
			{
				worldData: { encounter: { characterRankings: { rankings: [] } } },
				collectorBudget: { limitPerHour: 100 },
			},
			0,
		);
		expect(cache.get(query, undefined, "meta", 100)?.data).not.toHaveProperty("collectorBudget");
		expect(cache.get(query, undefined, "meta", 25 * 60 * 60_000)).toBeUndefined();
		cache.put("failed", undefined, "meta", { worldData: { encounter: null } }, 0);
		expect(cache.get("failed", undefined, "meta", 100)).toBeUndefined();
		expect(cache.get(query, undefined, "raid", 100)).toBeUndefined();
		cache.bypass = true;
		expect(cache.get(query, undefined, "meta", 100)).toBeUndefined();
		expect(JSON.stringify(cache.entries)).not.toContain("Authorization");
	});
	it("derives next KST display from the real workflow cron including the next UTC day", () => {
		expect(
			readRefreshSchedule(readFileSync(".github/workflows/refresh.yml", "utf8")).utcHours,
		).toEqual([4, 10, 16, 22]);
		expect(nextScheduledAt([4, 10, 16, 22], Date.parse("2026-10-16T23:00:00Z"))).toBe(
			"2026-10-17T04:00:00.000Z",
		);
	});
});
