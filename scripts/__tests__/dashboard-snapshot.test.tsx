import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../../src/components/pages/DashboardPage.js";
import type { Snapshot } from "../../src/types/snapshot.js";
import type { CharactersConfig } from "../config-validation.js";
import { dashboardCharacter, dashboardSnapshot } from "../dashboard-snapshot.js";
import { characterShell, deferCharacterRaid, fetchCharacter } from "../fetch-data.js";
import { extractPublishedSnapshot } from "../restore-snapshot.js";

const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
const at = "2026-10-23T00:00:00.000Z";
const status = {
	state: "ok" as const,
	attemptedRequests: 1,
	failedRequests: 0,
	issues: [],
	lastSuccessAt: at,
};
const counts = { tracked: 1, complete: 1, partial: 0, failed: 0, skipped: 0 };
function legacy(): Snapshot {
	const characters = config.characters.map((c) => characterShell(c));
	for (const c of characters)
		for (const s of Object.values(c.specs)) {
			s.talents = { talents: ["Synthetic talent"], wowheadUrl: null };
			s.mythicPlus = {
				score: 1200,
				scoreColor: "#ffffff",
				scoreTierLabel: "",
				realmRank: 1,
				regionRank: 2,
				worldRank: 3,
				titleCutoff: { score: 0, percentile: 1, region: c.region, updatedAt: at },
				recentRuns: [],
				bestRuns: [],
			};
			s.logs = {
				raidParses: [
					{
						bossName: "Synthetic Boss",
						difficulty: "Heroic",
						bestPercent: 90,
						ilvlAdjustedPercent: 90,
						rankLabel: "Epic",
						bestAmount: 100,
						date: at,
					},
				],
				recentDungeonLogs: [],
				latestLogDamageBreakdown: [],
			};
			s.collection = { raiderio: status, raid: status, mythicPlus: status, raidDates: status };
		}
	return {
		generatedAt: at,
		buildHash: "synthetic",
		region: "kr",
		characters,
		specs: {},
		wclMetadataAt: at,
		collectionSummary: { characters: counts, metaSpecs: { ...counts, withData: 0 } },
	};
}
afterEach(() => vi.unstubAllGlobals());
describe("retired detail payload compatibility (synthetic, no provider calls)", () => {
	it("drops every retired field while preserving active values and timestamps without mutating input", () => {
		const before = legacy();
		const copy = structuredClone(before);
		const next = dashboardSnapshot(before);
		expect(before).toEqual(copy);
		expect(next).not.toHaveProperty("specs");
		expect(next).not.toHaveProperty("wclMetadataAt");
		expect(next.collectionSummary).not.toHaveProperty("metaSpecs");
		for (const c of next.characters)
			for (const s of Object.values(c.specs)) {
				expect(s).not.toHaveProperty("talents");
				expect(s.mythicPlus).not.toHaveProperty("recentRuns");
				expect(s.mythicPlus?.score).toBe(1200);
				expect(s.logs).not.toHaveProperty("recentDungeonLogs");
				expect(s.logs).not.toHaveProperty("latestLogDamageBreakdown");
				expect(s.logs?.raidParses[0]).not.toHaveProperty("date");
				expect(s.logs?.raidParses[0]?.bestAmount).toBe(100);
				expect(s.collection).toEqual({ raiderio: status, raid: status });
			}
		expect(next.generatedAt).toBe(before.generatedAt);
		expect(dashboardSnapshot(next)).toEqual(next);
	});
	it("retains active records on failed public-profile refresh and deferred raid refresh, omitting retired fields", async () => {
		const previous = legacy().characters[0];
		const char = config.characters[0];
		if (!previous || !char) throw new Error("Synthetic character missing");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 404 })),
		);
		const next = await fetchCharacter(
			char,
			"",
			53,
			55,
			[],
			{ score: 0, percentile: 1, region: "kr", updatedAt: at },
			[],
			previous,
			at,
			[],
			true,
		);
		expect(next).toEqual(dashboardCharacter(next));
		for (const s of Object.values(next.specs)) {
			expect(s.mythicPlus?.score).toBe(1200);
			expect(s.collection?.raiderio.retainedAt).toBe(at);
		}
		const deferred = deferCharacterRaid(previous, [], at, "Synthetic deferral");
		expect(deferred).toEqual(dashboardCharacter(deferred));
	});
	it.each([false, true])(
		"extracts literal published bundles with retired fields present=%s",
		(trimmed) => {
			const data = trimmed ? dashboardSnapshot(legacy()) : legacy();
			expect(extractPublishedSnapshot(`const snapshot=${JSON.stringify(data)};`)).toEqual(data);
		},
	);
	it("requests only the retained raid metrics from WCL for a two-spec character", async () => {
		const char = config.characters.find((c) => c.class === "Mage" && c.specs.length === 2);
		if (!char) throw new Error("Two-spec synthetic target missing");
		const queries: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				if (url.includes("raider.io"))
					return new Response(
						JSON.stringify({ name: char.name, region: char.region, realm: "Azshara" }),
					);
				const { query } = JSON.parse(String(init?.body)) as { query: string };
				queries.push(query);
				expect(query).toContain("CharacterRaidOverview");
				expect(query).not.toMatch(/encounterRankings|mythicPlusRankings|table\(/);
				return new Response(
					JSON.stringify({
						data: {
							characterData: {
								character: {
									dps4: { rankings: [] },
									dps5: { rankings: [] },
									bossdps4: { rankings: [] },
									bossdps5: { rankings: [] },
								},
							},
						},
					}),
				);
			}),
		);
		await fetchCharacter(
			char,
			"synthetic-token",
			53,
			55,
			[],
			{ score: 0, percentile: 1, region: "kr", updatedAt: at },
			[],
			undefined,
			undefined,
			["dps", "bossdps"],
		);
		expect(queries).toHaveLength(4);
	});
	it("renders identical output in each dashboard tab before and after trimming", () => {
		const before = legacy();
		const next = dashboardSnapshot(before);
		window.history.replaceState(null, "", "#overview");
		const view = render(<DashboardPage snapshot={before} />);
		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(3);
		for (let i = 0; i < tabs.length; i++) {
			view.rerender(<DashboardPage snapshot={before} />);
			const tab = screen.getAllByRole("tab")[i];
			if (!tab) throw new Error("Tab missing");
			fireEvent.click(tab);
			const html = view.container.innerHTML;
			view.rerender(<DashboardPage snapshot={next} />);
			expect(view.container.innerHTML).toBe(html);
		}
		view.unmount();
	});
});
