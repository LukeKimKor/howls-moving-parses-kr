import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharactersConfig } from "../../../../scripts/config-validation.js";
import { ALL_SPECS } from "../../../data/specs.js";
import { bestRunByDungeon, sortRoster, specRaidValues } from "../../../lib/roster.js";
import type {
	CharacterData,
	MythicPlusData,
	MythicPlusRun,
	RaidDifficultyData,
	Snapshot,
} from "../../../types/snapshot.js";
import { DashboardPage, tabFromHash } from "../DashboardPage.js";

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

function section(best: number | null, median: number | null): RaidDifficultyData {
	return {
		metric: "dps",
		difficulty: "Heroic",
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
	firstSpec.raidPerformance = { dps: { Heroic: section(91.2, 80.5), Mythic: section(null, null) } };
	secondSpec.mythicPlus = mplus(3100, [run("City of Threads", 15, true)]);
	secondSpec.gear = { equippedIlvl: 695, items: [] };
	// Both tracked DH specs keep their own percentile.
	dh.specOrder.forEach((slug, index) => {
		const spec = dh.specs[slug];
		if (spec)
			spec.raidPerformance = {
				dps: { Heroic: section(60 + index * 10, 50), Mythic: section(null, null) },
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

describe("tabbed dashboard", () => {
	it("opens on the overview with item level, Raider.IO score and WCL best/median per character", () => {
		const data = withData();
		render(<DashboardPage snapshot={data} onOpenCharacter={vi.fn()} />);
		expect(screen.getByRole("tab", { name: /종합 현황/ })).toHaveAttribute("aria-selected", "true");
		const table = screen.getByRole("table", { name: /아이템 레벨, 쐐기 점수, 레이드 백분위/ });
		expect(within(table).getAllByRole("row")).toHaveLength(data.characters.length + 1);
		const first = data.characters[0]?.name ?? "";
		const row = table.querySelector(`[data-roster-character="${first}"]`) as HTMLElement;
		expect(within(row).getByText("701.4")).toBeInTheDocument();
		expect(within(row).getByText("2,500")).toBeInTheDocument();
		expect(within(row).getByText("91.2%")).toBeInTheDocument();
		expect(within(row).getByText("80.5%")).toBeInTheDocument();
		// A successful collection with no Mythic logs reads as "no records", not as a failure.
		expect(within(row).getByText("기록 없음")).toBeInTheDocument();
	});

	it("shows both tracked Demon Hunter specs side by side", () => {
		render(<DashboardPage snapshot={withData()} onOpenCharacter={vi.fn()} />);
		const row = document.querySelector('[data-roster-character="앙귀태"]') as HTMLElement;
		expect(within(row).getByText("파멸")).toBeInTheDocument();
		expect(within(row).getByText("포식")).toBeInTheDocument();
		expect(within(row).getByText("60.0%")).toBeInTheDocument();
		expect(within(row).getByText("70.0%")).toBeInTheDocument();
	});

	it("sorts by score and opens the character detail from the name", () => {
		const data = withData();
		const onOpen = vi.fn();
		render(<DashboardPage snapshot={data} onOpenCharacter={onOpen} />);
		fireEvent.change(screen.getByRole("combobox", { name: "종합 현황 정렬" }), {
			target: { value: "score" },
		});
		const rows = document.querySelectorAll("[data-roster-character]");
		expect(rows[0]?.getAttribute("data-roster-character")).toBe(data.characters[1]?.name);
		fireEvent.click(screen.getByRole("button", { name: data.characters[0]?.name ?? "" }));
		expect(onOpen).toHaveBeenCalledWith(data.characters[0]);
	});

	it("switches to the Mythic+ and raid tabs", () => {
		render(<DashboardPage snapshot={withData()} onOpenCharacter={vi.fn()} />);
		fireEvent.click(screen.getByRole("tab", { name: /^쐐기/ }));
		expect(screen.getByRole("table", { name: /던전 최고 단수/ })).toBeInTheDocument();
		expect(window.location.hash).toBe("#mplus");
		fireEvent.click(screen.getByRole("tab", { name: /레이드 로그/ }));
		expect(screen.getByRole("table", { name: "영웅과 신화 전체 캐릭터 비교" })).toBeInTheDocument();
		// The shell owns the page header; the embedded raid view does not repeat it.
		expect(screen.getAllByRole("heading", { name: "와우 대시보드", level: 1 })).toHaveLength(1);
	});
});

describe("roster helpers", () => {
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
		const sorted = sortRoster(data.characters, "ilvl", "dps");
		expect(sorted[0]?.name).toBe(data.characters[0]?.name);
		expect(sorted[1]?.name).toBe(data.characters[1]?.name);
		const healer = data.characters.find((c) => c.class === "Evoker") as CharacterData;
		expect(specRaidValues(healer, "Heroic", "bossdps")[0]?.metric).toBe("hps");
	});
});
