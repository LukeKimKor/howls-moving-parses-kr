import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CharactersConfig } from "../../../../scripts/config-validation.js";
import { ALL_SPECS } from "../../../data/specs.js";
import { raidSection } from "../../../lib/raid-overview.js";
import type { CharacterSpecData, RaidDifficultyData, Snapshot } from "../../../types/snapshot.js";
import { RaidOverviewPage } from "../RaidOverviewPage.js";

function fixture(): Snapshot {
	const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
	return {
		generatedAt: "2026-10-16T22:00:00.000Z",
		buildHash: "synthetic",
		dataMode: "full",
		region: "kr",
		specs: {},
		raid: { id: 53, name: "Synthetic raid", encounters: [{ id: 1, name: "Fixture Boss" }] },
		characters: config.characters.map((c) => {
			const definitions = c.specs
				.filter((s) => s.role !== "inactive")
				.map((s) => ({
					...s,
					definition: ALL_SPECS.find((d) => d.specName === s.spec && d.className === c.class),
				}));
			const specOrder = definitions.map((s) => s.definition?.specSlug ?? "missing");
			return {
				name: c.name,
				realm: c.realm,
				region: c.region,
				class: c.class,
				thumbnailUrl: null,
				isDefault: c.default,
				mainSpecPending: c.mainSpecPending,
				mainSpecSlug: specOrder[0] ?? "",
				specOrder,
				specs: Object.fromEntries(
					definitions.map((s) => [
						s.definition?.specSlug ?? "missing",
						{
							specSlug: s.definition?.specSlug ?? "missing",
							specName: s.spec,
							role: s.role,
							mythicPlus: null,
							logs: null,
						},
					]),
				),
			};
		}),
	} as Snapshot;
}

describe("all-character raid overview", () => {
	it("localizes boss labels without changing source identities and hides empty-cell spec icons", () => {
		const data = fixture();
		data.raid = {
			id: 53,
			name: "The Venomous Abyss",
			encounters: [
				{ id: 1, name: "Nek'zali the Soulcoiler" },
				{ id: 2, name: "Nymrissa Wavecaller" },
				{ id: 3, name: "Kith'ix" },
			],
		};
		const spec = data.characters[0]?.specs["arcane-mage"];
		if (!spec) throw new Error("Fixture missing");
		const empty = raidSection(spec, "dps", "Heroic", data.raid.encounters, data.generatedAt);
		const zero = {
			...empty,
			collection: { state: "ok" as const, attemptedRequests: 1, failedRequests: 0, issues: [] },
			summary: { ...empty.summary, bestPerformanceAverage: 0, medianPerformanceAverage: null },
		};
		spec.raidPerformance = { dps: { Heroic: zero, Mythic: { ...empty, difficulty: "Mythic" } } };
		render(<RaidOverviewPage snapshot={data} onOpenCharacter={vi.fn()} />);
		const summary = document.querySelector(".raid-roster-summary");
		if (!summary) throw new Error("Missing summary");
		expect(summary.querySelectorAll("img")).toHaveLength(1);
		expect(within(summary as HTMLElement).getByText("0.0%")).toBeInTheDocument();
		expect(screen.getAllByText("영혼살무사 네크잘리").length).toBeGreaterThan(0);
		expect(screen.getAllByText("해일결속 동굴").length).toBeGreaterThan(0);
		expect(document.querySelectorAll(".raid-boss-marker")).toHaveLength(0);
		expect(data.raid.encounters[0]?.name).toBe("Nek'zali the Soulcoiler");
		const link = document.querySelector<HTMLAnchorElement>(".raid-metric-title a");
		expect(link?.href).toContain("spec=Arcane");
		expect(link?.href).toContain("metric=dps");
	});
	it("offers a summary and every character in the desktop table of contents", () => {
		const data = fixture();
		render(<RaidOverviewPage snapshot={data} onOpenCharacter={vi.fn()} />);
		const toc = screen.getByRole("navigation", { name: "공격대 성적 목차" });
		expect(within(toc).getAllByRole("link")).toHaveLength(14);
		expect(within(toc).getByRole("link", { name: "종합 요약" })).toHaveAttribute(
			"href",
			"#raid-summary",
		);
		expect(toc.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
	});
	it("shows all 13 characters, both DH specs and all 52 metric/difficulty panels without selection", () => {
		const data = fixture();
		render(<RaidOverviewPage snapshot={data} onOpenCharacter={vi.fn()} />);
		expect(document.querySelectorAll(".raid-character-header h2")).toHaveLength(13);
		for (const character of data.characters)
			expect(screen.getByRole("heading", { name: character.name, level: 2 })).toBeInTheDocument();
		expect(document.querySelectorAll(".raid-metric-panel")).toHaveLength(52);
		expect(screen.getAllByRole("columnheader", { name: "최고 초당 치유량" })).toHaveLength(4);
		expect(document.querySelectorAll(".raid-spec-section")).toHaveLength(14);
		expect(document.querySelectorAll(".raid-roster-summary tbody tr")).toHaveLength(13);
		expect(screen.queryByText("Mage")).not.toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "앙귀태", level: 2 })).toHaveStyle({
			color: "#c77df4",
		});
		expect(screen.getByText(/주 전문화 미확정/)).toBeInTheDocument();
	});
	it("marks unqueried new metrics and keeps historical DPS separate from Boss Damage", () => {
		const data = fixture();
		const spec = data.characters[0]?.specs["arcane-mage"];
		if (!spec) throw new Error("Fixture missing");
		spec.logs = {
			raidParses: [
				{
					bossName: "Fixture Boss",
					difficulty: "Heroic",
					bestPercent: 88,
					bestAmount: 12345,
					ilvlAdjustedPercent: 88,
					rankLabel: "fixture",
					date: "",
				},
			],
			recentDungeonLogs: [],
			latestLogDamageBreakdown: [],
		};
		const damage = raidSection(
			spec,
			"dps",
			"Heroic",
			data.raid?.encounters ?? [],
			data.generatedAt,
		);
		const boss = raidSection(
			spec,
			"bossdps",
			"Heroic",
			data.raid?.encounters ?? [],
			data.generatedAt,
		);
		expect(damage.rows[0]?.bestAmount).toBe(12345);
		expect(damage.summary.bestPerformanceAverage).toBeNull();
		expect(boss.rows[0]?.bestAmount).toBeNull();
		expect(boss.collection.state).toBe("skipped");
		const staleAt = "2026-10-16T20:00:00.000Z";
		const failed = {
			...damage,
			rows: damage.rows.map((r) => ({
				...r,
				state: "unavailable" as const,
				bestAmount: null,
				bestPercent: null,
			})),
			collection: {
				state: "failed" as const,
				attemptedRequests: 1,
				failedRequests: 1,
				issues: ["WCL HTTP 429"],
			},
		};
		spec.raidPerformance = { dps: { Heroic: failed, Mythic: { ...failed, difficulty: "Mythic" } } };
		spec.collection = {
			raiderio: damage.collection,
			raid: { ...failed.collection, retainedAt: staleAt },
			raidDates: damage.collection,
			mythicPlus: damage.collection,
		};
		const retained = raidSection(
			spec,
			"dps",
			"Heroic",
			data.raid?.encounters ?? [],
			data.generatedAt,
		);
		expect(retained.rows[0]?.bestAmount).toBe(12345);
		expect(retained.collection.state).toBe("failed");
		expect(retained.collection.retainedAt).toBe(staleAt);
	});
	it("shows failed and retained data clearly, with the WCL percentile colour band", () => {
		const data = fixture();
		const spec = data.characters[0]?.specs["arcane-mage"] as CharacterSpecData;
		const sample: RaidDifficultyData = {
			metric: "dps",
			difficulty: "Heroic",
			partition: 1,
			collection: {
				state: "failed",
				attemptedRequests: 1,
				failedRequests: 1,
				issues: ["WCL HTTP 429"],
				retainedAt: data.generatedAt,
			},
			summary: {
				bestPerformanceAverage: 89,
				medianPerformanceAverage: 60,
				killsLogged: 3,
				allStars: [],
			},
			rows: [
				{
					encounterId: 1,
					bossName: "Fixture Boss",
					state: "recorded",
					specName: "Arcane",
					bestPercent: 89,
					bestAmount: 12345,
					kills: 3,
					fastestKillMs: 125000,
					medianPercent: 60,
					allStarPoints: 12.5,
					allStarRank: 50,
				},
			],
		};
		spec.raidPerformance = { dps: { Heroic: sample, Mythic: { ...sample, difficulty: "Mythic" } } };
		render(<RaidOverviewPage snapshot={data} onOpenCharacter={vi.fn()} />);
		const panel = screen.getByRole("region", { name: "오렌지크림피자 비전 영웅 전체 피해" });
		expect(within(panel).getByText(/기록 유무를 확인할 수 없습니다/)).toBeInTheDocument();
		expect(within(panel).getByText(/이전 데이터 표시/)).toBeInTheDocument();
		expect(within(panel).getByText("2:05")).toBeInTheDocument();
		expect(within(panel).getAllByText("89.0%")[0]).toHaveClass("wcl-purple");
		const summary = screen.getByRole("region", { name: "전체 캐릭터 성적 요약" });
		expect(within(summary).getAllByText("89.0%")).toHaveLength(2);
		expect(within(summary).queryByText("12,345")).not.toBeInTheDocument();
	});
	it("opens the existing detailed dashboard for the chosen character", () => {
		const data = fixture();
		const open = vi.fn();
		render(<RaidOverviewPage snapshot={data} onOpenCharacter={open} />);
		const header = screen.getByRole("heading", { name: "용귀태", level: 2 }).closest("section");
		if (!header) throw new Error("Character section missing");
		fireEvent.click(within(header).getByRole("button", { name: /쐐기·장비·특성/ }));
		expect(open.mock.calls[0]?.[0]?.name).toBe("용귀태");
	});
});
