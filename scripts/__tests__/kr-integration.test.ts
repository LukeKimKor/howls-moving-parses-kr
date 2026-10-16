import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_SPECS } from "../../src/data/specs.js";
import { characterProfileUrl, realmSlug } from "../../src/lib/regions.js";
import {
	type CharacterConfig,
	type CharactersConfig,
	validateConfig,
} from "../config-validation.js";
import {
	fetchCharacter,
	fetchEncounterRankings,
	fetchRioProfile,
	fetchRioTitleCutoff,
	fetchWclMplusLeaderboard,
	fetchWclRaidRankings,
	getBuildHash,
	getWclToken,
} from "../fetch-data.js";

// Synthetic API fixtures. These are never written to the user's live snapshot.
const profile = {
	name: "앙귀태",
	region: "kr",
	realm: "Azshara",
	active_spec_name: "Havoc",
	thumbnail_url: "",
	mythic_plus_scores_by_season: [
		{ season: "season-test", scores: { all: 2885.2 }, segments: { all: { color: "#abcdef" } } },
	],
	mythic_plus_ranks: { overall: { realm: 10, region: 20, world: 30 } },
	mythic_plus_recent_runs: [
		{
			dungeon: "Test Dungeon",
			short_name: "TD",
			mythic_level: 10,
			completed_at: "2026-10-16T00:00:00.000Z",
			clear_time_ms: 1000,
			par_time_ms: 2000,
			num_keystone_upgrades: 1,
			score: 100,
			affixes: [],
			url: "https://raider.io/mythic-plus-runs/test",
		},
	],
	mythic_plus_best_runs: [],
	gear: {
		item_level_equipped: 300,
		items: { trinket1: { name: "Fixture Trinket", item_level: 300, item_quality: 4 } },
	},
	talentLoadout: {
		loadout_text: "fixture-import",
		loadout_spec_id: 577,
		loadout: [
			{
				rank: 1,
				entryIndex: 1,
				node: {
					entries: [{ spell: { name: "Wrong choice" } }, { spell: { name: "Selected talent" } }],
				},
			},
		],
	},
};
const cutoff = {
	score: 3500,
	region: "kr" as const,
	percentile: 1 as const,
	updatedAt: "2026-10-16T00:00:00.000Z",
};
function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Required test fixture is missing");
	return value;
}
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("KR collector integration", () => {
	it("full mode fails before OAuth if credentials are absent", async () => {
		vi.stubEnv("WCL_CLIENT_ID", undefined);
		vi.stubEnv("WCL_CLIENT_SECRET", undefined);
		const fakeFetch = vi.fn();
		vi.stubGlobal("fetch", fakeFetch);
		await expect(getWclToken()).rejects.toThrow(
			"WCL_CLIENT_ID and WCL_CLIENT_SECRET environment variables are required",
		);
		expect(fakeFetch).not.toHaveBeenCalled();
	});
	it("validates all 13 Korean characters and leaves DH main/offspec unresolved", () => {
		const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
		expect(() => validateConfig(config)).not.toThrow();
		expect(config.characters).toHaveLength(13);
		expect(config.characters.every((c) => c.region === "kr" && c.realmSlug === "azshara")).toBe(
			true,
		);
		const dh = config.characters.find((c) => c.name === "앙귀태");
		expect(dh?.mainSpecPending).toBe(true);
		expect(dh?.specs).toEqual([
			{ spec: "Havoc", role: "tracked" },
			{ spec: "Devourer", role: "tracked" },
		]);
	});
	it("preserves Hangul and encodes profile URL segments once", () => {
		expect(realmSlug("아즈샤라")).toBe("azshara");
		for (const provider of ["rio", "wcl"] as const) {
			const url = new URL(characterProfileUrl(provider, "kr", "아즈샤라", "오렌지크림피자"));
			expect(decodeURIComponent(url.pathname)).toContain("/kr/azshara/오렌지크림피자");
			expect(url.href).not.toContain("%25EC");
		}
	});
	it("refuses mixed-region metadata and duplicate characters", () => {
		const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
		expect(() =>
			validateConfig({
				characters: [
					required(config.characters[0]),
					{ ...required(config.characters[1]), region: "eu" },
				],
			}),
		).toThrow(/single region/);
		expect(() =>
			validateConfig({
				characters: [
					required(config.characters[0]),
					{ ...required(config.characters[0]), default: false },
				],
			}),
		).toThrow(/duplicate character/);
	});
	it("loads actual collector fields for KR score, ranks, recent runs, gear and modern talentLoadout", async () => {
		const fakeFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(profile)));
		vi.stubGlobal("fetch", fakeFetch);
		const result = await fetchRioProfile("앙귀태", "azshara", "kr", "Havoc", [], cutoff);
		const url = new URL(required(fakeFetch.mock.calls[0])[0]);
		expect(url.searchParams.get("name")).toBe("앙귀태");
		expect(url.searchParams.get("region")).toBe("kr");
		expect(result.mplus).toMatchObject({
			score: 2885.2,
			scoreScope: "character-overall",
			realmRank: 10,
			regionRank: 20,
			worldRank: 30,
			recentRuns: [{ inTime: true }],
		});
		expect(result.gear?.items[0]?.name).toBe("Fixture Trinket");
		expect(result.talents?.talents).toEqual(["Selected talent"]);
	});
	it("never labels Havoc talents as Devourer talents", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(profile))));
		const result = await fetchRioProfile("앙귀태", "azshara", "kr", "Devourer", [], cutoff);
		expect(result.talents).toBeNull();
		expect(result.gear?.activeSpecName).toBe("Havoc");
	});
	it("rejects a cross-region API response", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockImplementation(() =>
					Promise.resolve(new Response(JSON.stringify({ ...profile, region: "eu" }))),
				),
		);
		expect(
			(await fetchRioProfile("앙귀태", "azshara", "kr", "Havoc", [], cutoff)).mplus,
		).toBeNull();
	});
	it("requests KR cutoff and keeps unknown cutoff unavailable", async () => {
		const fakeFetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					cutoffs: { updatedAt: cutoff.updatedAt, p990: { all: { quantileMinValue: 3654 } } },
				}),
			),
		);
		vi.stubGlobal("fetch", fakeFetch);
		expect(await fetchRioTitleCutoff("season-test", "kr")).toMatchObject({
			region: "kr",
			score: 3654,
		});
		expect(required(fakeFetch.mock.calls[0])[0]).toContain("region=kr");
		expect(await fetchRioTitleCutoff(null, "kr")).toMatchObject({ region: "kr", score: 0 });
	});
	it("filters the WCL API query by KR before pagination", async () => {
		const fakeFetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					data: { worldData: { encounter: { characterRankings: { rankings: [] } } } },
				}),
			),
		);
		vi.stubGlobal("fetch", fakeFetch);
		await fetchEncounterRankings(
			123,
			required(ALL_SPECS.find((s) => s.specSlug === "holy-paladin")),
			5,
			"fixture-token",
			"kr",
		);
		const body = JSON.parse(required(fakeFetch.mock.calls[0])[1].body);
		expect(body.variables.region).toBe("KR");
		expect(body.query).toContain("serverRegion: $region");
		expect(body.query).toContain("metric: hps");
	});
	it("passes Korean character identity and the selected spec to WCL raid queries", async () => {
		const fakeFetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ data: { characterData: { character: null } } })),
			);
		vi.stubGlobal("fetch", fakeFetch);
		await fetchWclRaidRankings("앙귀태", "azshara", "kr", 1, 5, "dps", "fixture-token", "Devourer");
		const body = JSON.parse(required(fakeFetch.mock.calls[0])[1].body);
		expect(body.variables).toMatchObject({
			name: "앙귀태",
			serverSlug: "azshara",
			serverRegion: "KR",
			specName: "Devourer",
		});
		expect(body.query).toContain("specName: $specName");
	});
	it("excludes EU players from the KR log sample and emits encoded KR links", async () => {
		const fakeFetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes("raider.io")) return new Response(JSON.stringify(profile));
			return new Response(
				JSON.stringify({
					data: {
						worldData: {
							encounter: {
								characterRankings: {
									rankings: [
										{
											name: "앙귀태",
											server: { name: "아즈샤라", region: "KR" },
											amount: 100,
											report: {},
										},
										{
											name: "EUPlayer",
											server: { name: "Draenor", region: "EU" },
											amount: 999,
											report: {},
										},
									],
								},
							},
						},
					},
				}),
			);
		});
		vi.stubGlobal("fetch", fakeFetch);
		const result = await fetchWclMplusLeaderboard(
			required(ALL_SPECS.find((s) => s.specSlug === "havoc-demon-hunter")),
			[{ id: 1, name: "Fixture dungeon" }],
			"fixture-token",
			"kr",
		);
		expect(result.leaderboard).toHaveLength(1);
		expect(result.leaderboard[0]).toMatchObject({ name: "앙귀태", region: "kr" });
		expect(result.leaderboard[0]?.profileUrl).toContain("/kr/azshara/%");
	});
	it("public-only character collection skips all WCL requests and preserves pending roles", async () => {
		const fakeFetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(profile)));
		vi.stubGlobal("fetch", fakeFetch);
		const char: CharacterConfig = {
			name: "앙귀태",
			realm: "아즈샤라",
			realmSlug: "azshara",
			region: "kr",
			class: "DemonHunter",
			default: false,
			mainSpecPending: true,
			specs: [
				{ spec: "Havoc", role: "tracked" },
				{ spec: "Devourer", role: "tracked" },
			],
		};
		const result = await fetchCharacter(char, "", 0, 0, [], cutoff, [], {});
		expect(result.mainSpecPending).toBe(true);
		expect(result.specOrder).toEqual(["havoc-demon-hunter", "devourer-demon-hunter"]);
		expect(
			Object.values(result.specs).every((spec) => spec.role === "tracked" && spec.logs === null),
		).toBe(true);
		expect(
			fakeFetch.mock.calls.every(([url]) => String(url).startsWith("https://raider.io/")),
		).toBe(true);
	});
	it("changes the update identifier even without a new Git commit", async () => {
		const first = getBuildHash();
		await new Promise((r) => setTimeout(r, 5));
		expect(getBuildHash()).not.toBe(first);
	});
});
