import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countCollections } from "../collection-status.js";
import type { CharactersConfig } from "../config-validation.js";
import { fetchCharacter } from "../fetch-data.js";
import * as raid from "../raid-performance.js";

const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
const at = "2026-10-16T20:00:00.000Z";
const cutoff = { score: 0, percentile: 1 as const, region: "kr" as const, updatedAt: at };
const encounters = [{ id: 1, name: "Synthetic Boss" }];

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			if (!url.startsWith("https://raider.io/"))
				throw new Error("Unexpected remote target in synthetic test");
			return new Response(
				JSON.stringify({
					name: new URL(url).searchParams.get("name"),
					region: "kr",
					realm: "Azshara",
					active_spec_name: "Arcane",
					mythic_plus_scores_by_season: [{ scores: { all: 1250.7 } }],
				}),
			);
		}),
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("unexpected whole-spec collection failure (no live API calls)", () => {
	it("creates all 56 expected raid panels as explicit failures without previous data", async () => {
		vi.spyOn(raid, "fetchRaidPerformance").mockRejectedValue(
			new Error("Synthetic unexpected collector exception"),
		);
		const characters = await Promise.all(
			config.characters.map((c) => fetchCharacter(c, "", 53, 55, [], cutoff, encounters)),
		);
		const sections = characters.flatMap((c) =>
			Object.values(c.specs).flatMap((s) =>
				Object.values(s.raidPerformance ?? {}).flatMap((m) => Object.values(m)),
			),
		);
		expect(sections).toHaveLength(56);
		expect(sections.every((s) => s.collection.state === "failed")).toBe(true);
		expect(sections.every((s) => s.collection.lastSuccessAt === undefined)).toBe(true);
		expect(countCollections(sections.map((s) => [s.collection]))).toMatchObject({
			tracked: 56,
			failed: 56,
			skipped: 0,
		});
		expect(
			vi.mocked(fetch).mock.calls.every(([url]) => String(url).startsWith("https://raider.io/")),
		).toBe(true);
	});
	it("retains previous score/logs and raid data with their timestamp on a whole-spec exception", async () => {
		const character = config.characters.find((c) => c.name === "오렌지크림피자");
		if (!character) throw new Error("Fixture configuration missing");
		const previous = await fetchCharacter(character, "", 53, 55, [], cutoff, encounters);
		const old = previous.specs["arcane-mage"];
		if (!old) throw new Error("Fixture spec missing");
		const raw = {
			rankings: [
				{
					encounter: encounters[0] ?? { id: 1, name: "Synthetic Boss" },
					rankPercent: 91,
					bestAmount: 12345,
					totalKills: 2,
				},
			],
		};
		const status = {
			state: "ok" as const,
			attemptedRequests: 1,
			failedRequests: 0,
			issues: [],
			lastSuccessAt: at,
		};
		old.raidPerformance = {
			dps: {
				Heroic: raid.mapRaidDifficulty(raw, "dps", "Heroic", encounters, status),
				Mythic: raid.mapRaidDifficulty(raw, "dps", "Mythic", encounters, status),
			},
			bossdps: {
				Heroic: raid.mapRaidDifficulty(raw, "bossdps", "Heroic", encounters, status),
				Mythic: raid.mapRaidDifficulty(raw, "bossdps", "Mythic", encounters, status),
			},
		};
		old.logs = {
			raidParses: [
				{
					bossName: "Synthetic Boss",
					difficulty: "Heroic",
					bestPercent: 91,
					bestAmount: 12345,
					ilvlAdjustedPercent: 91,
					rankLabel: "synthetic",
					date: at,
				},
			],
			recentDungeonLogs: [],
			latestLogDamageBreakdown: [],
		};
		vi.spyOn(raid, "fetchRaidPerformance").mockRejectedValue(
			new Error("Synthetic unexpected collector exception"),
		);
		const result = await fetchCharacter(
			character,
			"",
			53,
			55,
			[],
			cutoff,
			encounters,
			previous,
			at,
		);
		const actual = result.specs["arcane-mage"];
		expect(actual?.mythicPlus?.score).toBe(1250.7);
		expect(actual?.logs?.raidParses[0]?.bestAmount).toBe(12345);
		expect(actual?.raidPerformance?.bossdps?.Mythic.collection).toMatchObject({
			state: "failed",
			retainedAt: at,
		});
		expect(actual?.raidPerformance?.bossdps?.Mythic.collection.lastSuccessAt).toBeUndefined();
		expect(actual?.raidPerformance?.bossdps?.Mythic.rows[0]?.bestAmount).toBe(12345);
	});
});
