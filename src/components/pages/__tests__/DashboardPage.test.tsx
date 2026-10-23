import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharactersConfig } from "../../../../scripts/config-validation.js";
import { ALL_SPECS } from "../../../data/specs.js";
import { bestRunByDungeon, sortRows, specRows } from "../../../lib/roster.js";
import type {
	CharacterData,
	MythicPlusData,
	MythicPlusRun,
	RaidDifficulty,
	RaidDifficultyData,
	Snapshot,
} from "../../../types/snapshot.js";
import { DashboardPage, isNewerBuild, tabFromHash } from "../DashboardPage.js";

const ok = { state: "ok", attemptedRequests: 1, failedRequests: 0, issues: [] } as const;

function run(dungeon: string, level: number, inTime: boolean, score = level * 20): MythicPlusRun {
	return {
		dungeon,
		shortName: dungeon.slice(0, 4).toUpperCase(),
		keystoneLevel: level,
		completedAt: "2026-10-15T12:00:00Z",
		clearTimeMs: inTime ? 1_500_000 : 2_000_000,
		keystoneTimeMs: 1_800_000,
		inTime,
		score,
	};
}

function mplus(score: number, bestRuns: MythicPlusRun[] = []): MythicPlusData {
	return {
		score,
		scoreColor: "#a335ee",
		scoreTierLabel: "Keystone Hero",
		realmRank: 100,
		regionRank: 2000,
		worldRank: 30000,
		titleCutoff: { score: 3400, percentile: 1, region: "kr", updatedAt: "2026-10-18T00:00:00Z" },
		recentRuns: [],
		bestRuns,
	};
}

function section(
	best: number | null,
	median: number | null,
	difficulty: RaidDifficulty = "Heroic",
): RaidDifficultyData {
	return {
		metric: "dps",
		difficulty,
		collection: { ...ok, issues: [] },
		partition: 1,
		summary: {
			bestPerformanceAverage: best,
			medianPerformanceAverage: median,
			killsLogged: 1,
			allStars: [],
		},
		rows: [],
	};
}

function bossRow(
	encounterId: number,
	bossName: string,
	state: "recorded" | "no-kills" | "unavailable",
): RaidDifficultyData["rows"][number] {
	const recorded = state === "recorded";
	return {
		encounterId,
		bossName,
		state,
		specName: recorded ? "Synthetic" : null,
		bestPercent: recorded ? 88.4 : null,
		bestAmount: recorded ? 1234567 : null,
		kills: recorded ? 3 : state === "no-kills" ? 0 : null,
		fastestKillMs: recorded ? 200000 : null,
		medianPercent: recorded ? 70.1 : null,
		allStarPoints: recorded ? 100 : null,
		allStarRank: recorded ? 10 : null,
	};
}

function fixture(): Snapshot {
	const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
	return {
		generatedAt: "2026-10-18T13:00:00.000Z",
		buildHash: "synthetic",
		dataMode: "full",
		region: "kr",
		specs: {},
		characters: config.characters.map((c) => {
			const definitions = c.specs
				.filter((s) => s.role !== "inactive")
				.map((s) => ({
					...s,
					slug:
						ALL_SPECS.find((d) => d.specName === s.spec && d.className === c.class)?.specSlug ??
						"missing",
				}));
			const specOrder = definitions.map((d) => d.slug);
			return {
				name: c.name,
				realm: c.realm,
				realmSlug: c.realmSlug,
				region: c.region,
				class: c.class,
				thumbnailUrl: null,
				isDefault: c.default,
				mainSpecPending: c.mainSpecPending,
				mainSpecSlug: specOrder[0] ?? "",
				specOrder,
				specs: Object.fromEntries(
					definitions.map((d) => [
						d.slug,
						{ specSlug: d.slug, specName: d.spec, role: d.role, mythicPlus: null, logs: null },
					]),
				),
			} as CharacterData;
		}),
	};
}

function withData(): Snapshot {
	const data = fixture();
	const [first, second, dh] = data.characters as [CharacterData, CharacterData, CharacterData];
	const firstSpec = first.specs[first.mainSpecSlug];
	const secondSpec = second.specs[second.mainSpecSlug];
	if (!firstSpec || !secondSpec) throw new Error("fixture");
	firstSpec.mythicPlus = mplus(2500, [run("Ara-Kara", 12, true), run("Ara-Kara", 14, false)]);
	firstSpec.gear = { equippedIlvl: 701.4, items: [] };
	const heroic = section(91.2, 80.5);
	heroic.summary.allStars = [
		{
			spec: firstSpec.specName,
			partition: 2,
			points: 897.969,
			rank: 16,
			rankPercent: 99.6,
			total: 4000,
		},
		{ spec: firstSpec.specName, partition: 1, points: 1017.71, rank: 308 },
	];
	const bossHeroic = section(77.7, 60);
	bossHeroic.metric = "bossdps";
	bossHeroic.summary.allStars = [
		{ spec: firstSpec.specName, partition: 2, points: 904.716, rank: 5 },
	];
	firstSpec.raidPerformance = {
		dps: { Heroic: heroic, Mythic: section(null, null, "Mythic") },
		bossdps: { Heroic: bossHeroic, Mythic: section(null, null, "Mythic") },
	};
	secondSpec.mythicPlus = mplus(3100, [run("City of Threads", 15, true)]);
	secondSpec.gear = { equippedIlvl: 695, items: [] };
	// Both tracked DH specs keep their own percentile.
	dh.specOrder.forEach((slug, index) => {
		const spec = dh.specs[slug];
		if (spec)
			spec.raidPerformance = {
				dps: { Heroic: section(60 + index * 10, 50), Mythic: section(null, null, "Mythic") },
			};
	});
	return data;
}

beforeEach(() => {
	window.history.replaceState(null, "", "/");
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
});

function rowFor(key: string) {
	return document.querySelector(`[data-roster-row="${key}"]`) as HTMLElement;
}

describe("overview tab", () => {
	it("opens on the overview with item level, score, and four separate WCL percentile columns", () => {
		const data = withData();
		render(<DashboardPage snapshot={data} />);
		expect(screen.getByRole("tab", { name: /종합 현황/ })).toHaveAttribute("aria-selected", "true");
		const first = data.characters[0] as CharacterData;
		const row = rowFor(`${first.name}/${first.mainSpecSlug}`);
		const cell = (label: string) => row.querySelector(`[data-label="${label}"]`) as HTMLElement;
		expect(within(cell("템렙")).getByText("701.4")).toBeInTheDocument();
		expect(within(cell("쐐기 점수")).getByText("2,500")).toBeInTheDocument();
		expect(within(cell("영웅 최고")).getByText("91.2%")).toBeInTheDocument();
		expect(within(cell("영웅 중앙")).getByText("80.5%")).toBeInTheDocument();
		// A successful collection with no Mythic logs reads as "no records", not as a failure.
		expect(within(cell("신화 최고")).getByText("기록 없음")).toBeInTheDocument();
		expect(within(cell("신화 중앙")).getByText("기록 없음")).toBeInTheDocument();
	});

	it("puts a kill count first in each difficulty group, matching the raid log cards", () => {
		const data = withData();
		data.raid = {
			id: 53,
			name: "Synthetic raid",
			encounters: [
				{ id: 1, name: "Boss A" },
				{ id: 2, name: "Boss B" },
			],
		};
		const first = data.characters[0] as CharacterData;
		const spec = first.specs[first.mainSpecSlug];
		const heroic = spec?.raidPerformance?.dps?.Heroic;
		const mythic = spec?.raidPerformance?.dps?.Mythic;
		if (!heroic || !mythic) throw new Error("fixture");
		heroic.rows = [bossRow(1, "Boss A", "recorded"), bossRow(2, "Boss B", "no-kills")];
		// Retained cache: state "skipped" but real rows, so 0 kills is a real 0 and "no records".
		mythic.collection = { ...ok, issues: [], state: "skipped", retainedAt: "2026-10-18T00:00:00Z" };
		mythic.rows = [bossRow(1, "Boss A", "no-kills"), bossRow(2, "Boss B", "no-kills")];
		render(<DashboardPage snapshot={data} />);
		const row = rowFor(`${first.name}/${first.mainSpecSlug}`);
		const cell = (label: string) => row.querySelector(`[data-label="${label}"]`) as HTMLElement;
		expect(cell("영웅 처치").textContent).toBe("1/2");
		expect(cell("신화 처치").textContent).toBe("0/2");
		expect(within(cell("신화 최고")).getByText("기록 없음")).toBeInTheDocument();
		// The kill column sits before 최고 in both difficulty groups.
		const labels = [...row.querySelectorAll("[data-label]")].map((td) =>
			td.getAttribute("data-label"),
		);
		expect(labels.indexOf("영웅 처치")).toBe(labels.indexOf("영웅 최고") - 1);
		expect(labels.indexOf("신화 처치")).toBe(labels.indexOf("신화 최고") - 1);
		// A spec with nothing collected says why instead of showing 0.
		const second = data.characters[1] as CharacterData;
		const secondRow = rowFor(`${second.name}/${second.mainSpecSlug}`);
		expect(secondRow.querySelector('[data-label="영웅 처치"]')?.textContent).toBe("미조회");
		// Same count as the raid log card for this spec.
		fireEvent.click(screen.getByRole("tab", { name: /레이드 로그/ }));
		const card = screen.getByRole("article", {
			name: `${first.name} ${spec?.specName} 보스별 기록`,
		});
		expect(within(card).getByText("1/2")).toBeInTheDocument();
		expect(within(card).getByText("0/2")).toBeInTheDocument();
	});

	it("sorts by Mythic kills with unknown counts last", () => {
		const data = withData();
		data.raid = { id: 53, name: "Synthetic raid", encounters: [{ id: 1, name: "Boss A" }] };
		const [a, b] = data.characters as [CharacterData, CharacterData];
		const specA = a.specs[a.mainSpecSlug];
		const specB = b.specs[b.mainSpecSlug];
		if (!specA?.raidPerformance?.dps || !specB) throw new Error("fixture");
		const mythicA = section(null, null, "Mythic");
		mythicA.rows = [bossRow(1, "Boss A", "no-kills")];
		specA.raidPerformance.dps.Mythic = mythicA;
		const mythicB = section(70, 60, "Mythic");
		mythicB.rows = [bossRow(1, "Boss A", "recorded")];
		specB.raidPerformance = { dps: { Heroic: section(80, 70), Mythic: mythicB } };
		render(<DashboardPage snapshot={data} />);
		fireEvent.change(screen.getByRole("combobox", { name: "종합 현황 정렬" }), {
			target: { value: "mythicKills" },
		});
		const dps = screen.getByRole("table", { name: /^딜러 전문화별/ });
		const names = [...dps.querySelectorAll("[data-roster-row]")].map((r) =>
			r.getAttribute("data-roster-character"),
		);
		expect(names[0]).toBe(b.name);
		expect(names[1]).toBe(a.name);
	});

	it("splits dealers, healers and tanks into separate tables", () => {
		const data = withData();
		render(<DashboardPage snapshot={data} />);
		const dps = screen.getByRole("table", { name: /^딜러 전문화별/ });
		const healers = screen.getByRole("table", { name: /^힐러 전문화별/ });
		const healerNames = data.characters.filter((c) => ["Evoker", "Paladin"].includes(c.class));
		expect(within(healers).getAllByRole("row")).toHaveLength(healerNames.length + 2);
		for (const healer of healerNames)
			expect(within(dps).queryByRole("button", { name: healer.name })).not.toBeInTheDocument();
		expect(screen.getByText(/등록된 탱커 전문화가 없습니다/)).toBeInTheDocument();
	});

	it("gives each tracked Demon Hunter spec its own row", () => {
		const data = withData();
		render(<DashboardPage snapshot={data} />);
		const dh = data.characters.find((c) => c.name === "앙귀태") as CharacterData;
		expect(dh.specOrder).toHaveLength(2);
		const [a, b] = dh.specOrder.map((slug) => rowFor(`앙귀태/${slug}`));
		expect(within(a as HTMLElement).getByText("파멸")).toBeInTheDocument();
		expect(within(a as HTMLElement).getByText("60.0%")).toBeInTheDocument();
		expect(within(b as HTMLElement).getByText("포식")).toBeInTheDocument();
		expect(within(b as HTMLElement).getByText("70.0%")).toBeInTheDocument();
	});

	it("shows All Stars points and rank for the selected patch and damage metric", () => {
		const data = withData();
		render(<DashboardPage snapshot={data} />);
		const first = data.characters[0] as CharacterData;
		const row = () => rowFor(`${first.name}/${first.mainSpecSlug}`);
		const cell = (label: string) => row().querySelector(`[data-label="${label}"]`) as HTMLElement;
		expect(cell("영웅 점수")).toHaveTextContent("897.97");
		expect(cell("영웅 순위")).toHaveTextContent("16위");
		fireEvent.change(screen.getByRole("combobox", { name: "All Stars 점수 패치" }), {
			target: { value: "1" },
		});
		expect(cell("영웅 점수")).toHaveTextContent("1,017.71");
		expect(cell("영웅 순위")).toHaveTextContent("308위");
		fireEvent.change(screen.getByRole("combobox", { name: "All Stars 점수 패치" }), {
			target: { value: "2" },
		});
		fireEvent.click(screen.getByRole("button", { name: "우두머리 피해" }));
		expect(cell("영웅 점수")).toHaveTextContent("904.72");
		expect(cell("영웅 최고")).toHaveTextContent("77.7%");
	});

	it("colours ranks by WCL rank percentile, points in the points colour, item level by crest band", () => {
		const data = withData();
		render(<DashboardPage snapshot={data} />);
		const first = data.characters[0] as CharacterData;
		const row = rowFor(`${first.name}/${first.mainSpecSlug}`);
		const cell = (label: string) => row.querySelector(`[data-label="${label}"]`) as HTMLElement;
		expect(within(cell("영웅 순위")).getByText("16위")).toHaveClass("wcl-pink");
		expect(within(cell("영웅 점수")).getByText("897.97")).toHaveClass("wcl-points");
		// 701.4 is above every Season 2 band → Myth graduation colour.
		expect(within(cell("템렙")).getByText("701.4")).toHaveClass("wcl-orange");
		const second = data.characters[1] as CharacterData;
		const secondIlvl = rowFor(`${second.name}/${second.mainSpecSlug}`).querySelector(
			'[data-label="템렙"]',
		) as HTMLElement;
		expect(secondIlvl.querySelector(".dash-ilvl")).toHaveAttribute("title", "신화 문장 졸업");
	});

	it("sorts by score and shows character names as plain text", () => {
		const data = withData();
		render(<DashboardPage snapshot={data} />);
		fireEvent.change(screen.getByRole("combobox", { name: "종합 현황 정렬" }), {
			target: { value: "score" },
		});
		const rows = document.querySelectorAll("[data-roster-character]");
		expect(rows[0]?.getAttribute("data-roster-character")).toBe(data.characters[1]?.name);
		// 오렌지크림피자 tracks Arcane and Frost, so its name appears on two rows.
		const name = data.characters[0]?.name ?? "";
		expect(screen.queryAllByRole("button", { name })).toHaveLength(0);
		const names = Array.from(document.querySelectorAll(".dash-char-name")).filter(
			(el) => el.textContent === name,
		);
		expect(names).toHaveLength(2);
		for (const el of names) expect(el.tagName).toBe("SPAN");
	});
});

describe("raid and Mythic+ tabs", () => {
	it("switches tabs and renders one header", () => {
		render(<DashboardPage snapshot={withData()} />);
		fireEvent.click(screen.getByRole("tab", { name: /^쐐기/ }));
		expect(screen.getByRole("table", { name: /던전 최고 단수/ })).toBeInTheDocument();
		expect(window.location.hash).toBe("#mplus");
		fireEvent.click(screen.getByRole("tab", { name: /레이드 로그/ }));
		expect(screen.getByRole("table", { name: /^딜러 영웅·신화 레이드 요약/ })).toBeInTheDocument();
		expect(screen.getAllByRole("heading", { name: "와우 대시보드", level: 1 })).toHaveLength(1);
	});

	it("lists every boss with Heroic and Mythic side by side per spec, keeping missing states distinct", () => {
		const data = withData();
		data.raid = {
			id: 53,
			name: "Synthetic raid",
			encounters: [
				{ id: 1, name: "Boss A" },
				{ id: 2, name: "Boss B" },
			],
		};
		const first = data.characters[0] as CharacterData;
		const spec = first.specs[first.mainSpecSlug];
		const heroic = spec?.raidPerformance?.dps?.Heroic;
		if (!heroic) throw new Error("fixture");
		heroic.rows = [
			{
				encounterId: 1,
				bossName: "Boss A",
				state: "recorded",
				specName: spec.specName,
				bestPercent: 88.4,
				bestAmount: 1234567,
				kills: 3,
				fastestKillMs: 200000,
				medianPercent: 70.1,
				allStarPoints: 100,
				allStarRank: 10,
			},
			{
				encounterId: 2,
				bossName: "Boss B",
				state: "no-kills",
				specName: null,
				bestPercent: null,
				bestAmount: null,
				kills: 0,
				fastestKillMs: null,
				medianPercent: null,
				allStarPoints: null,
				allStarRank: null,
			},
		];
		render(<DashboardPage snapshot={data} />);
		fireEvent.click(screen.getByRole("tab", { name: /레이드 로그/ }));
		const table = screen.getByRole("table", {
			name: new RegExp(`^${first.name} ${spec.specName} 전체 피해 우두머리별`),
		});
		const rowA = within(table).getByRole("row", { name: /Boss A/ });
		expect(within(rowA).getByText("88.4%")).toBeInTheDocument();
		expect(within(rowA).getByText("1,234,567")).toBeInTheDocument();
		const rowB = within(table).getByRole("row", { name: /Boss B/ });
		expect(within(rowB).getAllByText("미처치").length).toBeGreaterThan(0);
		expect(screen.getAllByRole("table", { name: /앙귀태 .* 우두머리별/ })).toHaveLength(2);
	});
});

describe("new build banner", () => {
	it("only reports a build other than the one this page loaded", () => {
		expect(isNewerBuild("b", "a")).toBe(true);
		expect(isNewerBuild("a", "a")).toBe(false);
		expect(isNewerBuild(undefined, "a")).toBe(false);
		expect(isNewerBuild("", "a")).toBe(false);
	});
});

describe("roster helpers", () => {
	it("maps item levels to Season 2 crest graduation bands", async () => {
		const { ilvlTier } = await import("../../../lib/roster.js");
		expect(ilvlTier(331).label).toBe("신화 문장 졸업");
		expect(ilvlTier(330.9).label).toBe("영웅 문장 졸업");
		expect(ilvlTier(321).band).toBe("purple");
		expect(ilvlTier(308).band).toBe("blue");
		expect(ilvlTier(292).band).toBe("green");
		expect(ilvlTier(280).band).toBe("grey");
	});

	it("maps URL hashes to tabs, keeping raid anchors on the raid tab", () => {
		expect(tabFromHash("#mplus")).toBe("mplus");
		expect(tabFromHash("#raid-character-3")).toBe("raid");
		expect(tabFromHash("")).toBeNull();
	});

	it("prefers the highest key level per dungeon, then timed runs", () => {
		const character = withData().characters[0] as CharacterData;
		expect(bestRunByDungeon(character).get("Ara-Kara")?.keystoneLevel).toBe(14);
		const spec = character.specs[character.mainSpecSlug];
		if (spec?.mythicPlus)
			spec.mythicPlus.bestRuns = [run("Ara-Kara", 12, false), run("Ara-Kara", 12, true)];
		expect(bestRunByDungeon(character).get("Ara-Kara")?.inTime).toBe(true);
	});

	it("keeps unknown values last when sorting and uses HPS for healers", () => {
		const data = withData();
		const rows = specRows(data.characters);
		const sorted = sortRows(rows, "ilvl", "dps");
		// Both of the first character's spec rows share its item level and stay together.
		expect(sorted.slice(0, 2).map((r) => r.character.name)).toEqual([
			data.characters[0]?.name,
			data.characters[0]?.name,
		]);
		expect(sorted[2]?.character.name).toBe(data.characters[1]?.name);
		const healer = rows.find((r) => r.character.class === "Evoker");
		expect(healer?.role).toBe("healer");
		expect(healer?.metric("bossdps")).toBe("hps");
	});
});
