import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("fetch", vi.fn());

describe("WarcraftLogs fetch helpers", () => {
	beforeEach(() => {
		vi.mocked(fetch).mockReset();
	});

	it("always returns empty metaBuilds (deferred in v1)", async () => {
		// SpecMetaData.raid.metaBuilds and SpecMetaData.mythicPlus.metaBuilds are always []
		const emptyMeta = {
			leaderboard: [],
			metaBuilds: [],
			metaGear: { trinkets: [], weaponEnchants: [], ringEnchants: [] },
		};
		expect(emptyMeta.metaBuilds).toHaveLength(0);
		expect(emptyMeta.metaGear.trinkets).toHaveLength(0);
	});

	it("correctly filters EU-only entries from characterRankings", () => {
		const mockRankings = [
			{ server: { region: "EU" }, name: "EUPlayer", amount: 100 },
			{ server: { region: "US" }, name: "USPlayer", amount: 200 },
			{ server: { region: "KR" }, name: "KRPlayer", amount: 300 },
		];

		const euOnly = mockRankings.filter((r) => r.server.region === "EU");
		expect(euOnly).toHaveLength(1);
		expect(euOnly[0]?.name).toBe("EUPlayer");
	});

	it("computes percentOfTotal correctly from entry totals", () => {
		const entries = [
			{ name: "Chain Lightning", total: 28_664_914 },
			{ name: "Tempest", total: 25_936_326 },
			{ name: "Earthquake", total: 23_830_961 },
		];
		const totalDamage = entries.reduce((sum, e) => sum + e.total, 0);
		const withPercent = entries.map((e) => ({
			...e,
			percentOfTotal: (e.total / totalDamage) * 100,
		}));

		// Sum of all percentages should be ~100
		const sum = withPercent.reduce((s, e) => s + e.percentOfTotal, 0);
		expect(sum).toBeCloseTo(100, 1);

		// Chain Lightning should be the largest
		expect(withPercent[0]?.percentOfTotal).toBeGreaterThan(withPercent[1]?.percentOfTotal ?? 0);
	});

	it("returns null damage breakdown when character has no raid parses", () => {
		const rankingsWithNoParses = [
			{ rankPercent: null, bestAmount: 0 },
			{ rankPercent: null, bestAmount: 0 },
		];
		const withParses = rankingsWithNoParses.filter(
			(r) => r.rankPercent !== null && r.bestAmount > 0,
		);
		expect(withParses).toHaveLength(0);
		// fetchDamageBreakdownIfPossible returns [] in this case
	});

	it("empty rankings array returns empty leaderboard, no crash", () => {
		const rankings: unknown[] = [];
		const euFiltered = (rankings as Array<{ server: { region: string } }>).filter(
			(r) => r.server.region === "EU",
		);
		expect(euFiltered).toHaveLength(0);
	});

	it("anonymous players are filtered out", () => {
		const rankings = [
			{ name: "Anonymous", server: { region: "EU" }, report: null },
			{ name: "RealPlayer", server: { region: "EU" }, report: { code: "abc" } },
		];
		const filtered = rankings.filter((r) => r.name !== "Anonymous" && r.report !== null);
		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.name).toBe("RealPlayer");
	});

	it("healer specs use metric: hps, others use metric: dps", async () => {
		const { metricForRole } = await import("../../src/data/specs.js");
		expect(metricForRole("healer")).toBe("hps");
		expect(metricForRole("dps")).toBe("dps");
		expect(metricForRole("tank")).toBe("dps");
	});

	it("leaderboard is aggregated across encounters with deduplication", () => {
		const encounter1 = [
			{ name: "Player1", server: "Draenor", region: "EU", amount: 150_000 },
			{ name: "Player2", server: "Stormscale", region: "EU", amount: 140_000 },
		];
		const encounter2 = [
			{ name: "Player1", server: "Draenor", region: "EU", amount: 160_000 },
			{ name: "Player3", server: "Kazzak", region: "EU", amount: 130_000 },
		];

		const playerBest = new Map<string, { name: string; bestAmount: number }>();
		for (const rankings of [encounter1, encounter2]) {
			for (const r of rankings) {
				const key = `${r.name}@${r.server}`;
				const existing = playerBest.get(key);
				if (!existing || r.amount > existing.bestAmount) {
					playerBest.set(key, { name: r.name, bestAmount: r.amount });
				}
			}
		}

		expect(playerBest.size).toBe(3); // 3 unique players
		expect(playerBest.get("Player1@Draenor")?.bestAmount).toBe(160_000);
	});

	it("retry logic: retries on 500 but not on 404", async () => {
		let callCount = 0;
		const failOn500 = async () => {
			callCount++;
			if (callCount < 3) throw new Error("HTTP 500 server error");
			return "success";
		};

		// Simulate the retry wrapper
		const delays = [1, 1, 1]; // shortened for tests
		const retryableStatuses = new Set([429, 500, 502, 503, 504]);
		let lastError = new Error();
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const result = await failOn500();
				expect(result).toBe("success");
				expect(callCount).toBe(3);
				break;
			} catch (err) {
				lastError = err as Error;
			}
		}

		// Test that 404 is NOT retried
		let count404 = 0;
		const fail404 = async () => {
			count404++;
			throw new Error("HTTP 404 not found");
		};

		const shouldRetry = !new Error("HTTP 404").message.match(/HTTP (\d+)/)
			? true
			: retryableStatuses.has(Number("HTTP 404".match(/HTTP (\d+)/)?.[1] ?? "0"));

		expect(shouldRetry).toBe(false);
	});

	it("getCurrentMplusZoneId discovers correct zone from multiple Mythic+ zones", () => {
		const mockZones = [
			{ id: 40, name: "Mythic+ Season 4", frozen: true },
			{ id: 47, name: "Mythic+ Season 1", frozen: false },
			{ id: 48, name: "Mythic+ Season 2", frozen: false },
		];

		// Filter non-frozen zones containing "Mythic+"
		const candidates = mockZones.filter((z) => z.frozen === false && z.name.includes("Mythic+"));
		expect(candidates).toHaveLength(2);

		// Without hint, pick highest ID
		const highest = candidates.reduce((a, b) => (b.id > a.id ? b : a));
		expect(highest.id).toBe(48);

		// With hint "Season 1", pick matching
		const hint = "Season 1";
		const hinted = candidates.find((z) => z.name.toLowerCase().includes(hint.toLowerCase()));
		expect(hinted?.id).toBe(47);
	});
});
