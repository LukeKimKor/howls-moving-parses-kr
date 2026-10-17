import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CharactersConfig } from "../../../../scripts/config-validation.js";
import { ALL_SPECS } from "../../../data/specs.js";
import type { Snapshot } from "../../../types/snapshot.js";
import { MobileRaidOverview } from "../MobileRaidOverview.js";

// Synthetic presentation fixtures, never saved to the public snapshot.
function fixture(): Snapshot {
	const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
	const encounters = [
		{ id: 1, name: "Recorded Boss" },
		{ id: 2, name: "Unkilled Boss" },
	];
	return {
		generatedAt: "2026-10-16T22:00:00Z",
		buildHash: "synthetic-mobile",
		region: "kr",
		specs: {},
		raid: { id: 53, name: "Synthetic Raid", encounters },
		characters: config.characters.map((c) => {
			const entries = c.specs.filter((s) => s.role !== "inactive");
			const specs = Object.fromEntries(
				entries.map((s) => {
					const def = ALL_SPECS.find((d) => d.className === c.class && d.specName === s.spec);
					if (!def) throw new Error("Unknown fixture spec");
					const metrics = def.role === "healer" ? ["hps"] : ["dps", "bossdps"];
					return [
						def.specSlug,
						{
							specSlug: def.specSlug,
							specName: s.spec,
							role: s.role,
							mythicPlus: null,
							logs: null,
							raidPerformance: Object.fromEntries(
								metrics.map((metric) => [
									metric,
									Object.fromEntries(
										["Heroic", "Mythic"].map((difficulty) => [
											difficulty,
											{
												metric,
												difficulty,
												partition: 1,
												collection: {
													state: "ok",
													attemptedRequests: 1,
													failedRequests: 0,
													issues: [],
													lastSuccessAt: "2026-10-16T22:00:00Z",
												},
												summary: {
													bestPerformanceAverage: metric === "bossdps" ? 95 : 88,
													medianPerformanceAverage: 66,
													killsLogged: 3,
													allStars: [],
												},
												rows: encounters.map((boss, index) => ({
													encounterId: boss.id,
													bossName: boss.name,
													state: index === 0 ? "recorded" : "no-kills",
													specName: s.spec,
													bestPercent: index === 0 ? 88 : null,
													medianPercent: index === 0 ? 66 : null,
													bestAmount: index === 0 ? 123456.7 : null,
													kills: index === 0 ? 3 : 0,
													fastestKillMs: index === 0 ? 125000 : null,
													allStarPoints: index === 0 ? 77.25 : null,
													allStarRank: index === 0 ? 123 : null,
												})),
											},
										]),
									),
								]),
							),
						},
					];
				}),
			);
			const specOrder = Object.keys(specs);
			return {
				name: c.name,
				realm: c.realm,
				realmSlug: c.realmSlug,
				region: c.region,
				class: c.class,
				thumbnailUrl: null,
				isDefault: c.default,
				mainSpecPending: c.mainSpecPending,
				mainSpecSlug: specOrder[0],
				specOrder,
				specs,
			};
		}),
	} as Snapshot;
}

beforeEach(() => {
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe("focused mobile raid overview", () => {
	it("shows one character and metric with all details still available on demand", () => {
		render(<MobileRaidOverview snapshot={fixture()} onOpenCharacter={vi.fn()} />);
		expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
		expect(document.querySelectorAll(".mobile-performance")).toHaveLength(1);
		const cards = document.querySelectorAll(".mobile-boss-card");
		const first = cards[0];
		if (!first) throw new Error("Missing boss");
		expect(document.querySelectorAll(".mobile-boss-extra:not([hidden])")).toHaveLength(0);
		fireEvent.click(within(first as HTMLElement).getByRole("button"));
		expect(within(first as HTMLElement).getByText("123,456.7")).toBeVisible();
		expect(within(first as HTMLElement).getByText("2:05")).toBeVisible();
		expect(screen.getByText("미처치 · 처치 수 0")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
		expect(document.querySelectorAll(".mobile-boss-extra:not([hidden])")).toHaveLength(2);
		fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
		expect(document.querySelectorAll(".mobile-boss-extra:not([hidden])")).toHaveLength(0);
	});
	it("switches both DH specs, difficulty and metric without choosing a main spec", () => {
		render(<MobileRaidOverview snapshot={fixture()} onOpenCharacter={vi.fn()} />);
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
		fireEvent.click(screen.getByRole("button", { name: /포식/ }));
		fireEvent.click(screen.getByRole("button", { name: "신화" }));
		fireEvent.click(screen.getByRole("button", { name: "우두머리 피해" }));
		expect(
			screen.getByRole("region", { name: "앙귀태 포식 신화 우두머리 피해 모바일 성적" }),
		).toBeInTheDocument();
		expect(screen.getByText(/주 전문화 미확정/)).toBeInTheDocument();
		expect(screen.getAllByText("95.0%")).toHaveLength(1);
	});
	it("automatically presents Healing for both healer characters", () => {
		render(<MobileRaidOverview snapshot={fixture()} onOpenCharacter={vi.fn()} />);
		for (const index of [3, 12]) {
			fireEvent.change(screen.getByRole("combobox"), { target: { value: String(index) } });
			expect(screen.getByText("치유량")).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "우두머리 피해" })).not.toBeInTheDocument();
			expect(document.querySelector(".mobile-performance")?.getAttribute("aria-label")).toContain(
				"치유량 모바일 성적",
			);
		}
	});
	it("offers thirteen compact summary cards with both DH specs and returns to the chosen character", () => {
		render(<MobileRaidOverview snapshot={fixture()} onOpenCharacter={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "전체 요약 13" }));
		expect(document.querySelectorAll(".mobile-roster-card")).toHaveLength(13);
		expect(document.querySelectorAll(".mobile-roster-spec")).toHaveLength(14);
		fireEvent.click(screen.getByRole("button", { name: "김동효성기사" }));
		expect(screen.getByRole("heading", { name: "김동효성기사", level: 2 })).toBeInTheDocument();
		expect(screen.getByRole("combobox")).toHaveValue("12");
	});
	it("honors the selected character on return from the detailed dashboard", () => {
		const open = vi.fn();
		render(
			<MobileRaidOverview
				snapshot={fixture()}
				initialCharacterName="용귀태"
				onOpenCharacter={open}
			/>,
		);
		expect(screen.getByRole("combobox")).toHaveValue("3");
		fireEvent.click(screen.getByRole("button", { name: /쐐기·장비·특성/ }));
		expect(open.mock.calls[0]?.[0].name).toBe("용귀태");
	});
});
