import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	primaryRaidMetric,
	raidPatchLabel,
	scopedAllStars,
	starPoints,
	starRank,
} from "../../../lib/all-stars.js";
import type { RaidDifficultyData } from "../../../types/snapshot.js";
import { AllStarsSummary } from "../AllStarsSummary.js";

// Synthetic scope and zero probes; never written to the real snapshot.
const data: RaidDifficultyData = {
	metric: "dps",
	difficulty: "Heroic",
	partition: -1,
	collection: { state: "ok", attemptedRequests: 1, failedRequests: 0, issues: [] },
	summary: {
		bestPerformanceAverage: null,
		medianPerformanceAverage: null,
		killsLogged: null,
		allStars: [
			{ spec: "Havoc", partition: 2, points: 0, rank: 0 },
			{ spec: "Havoc", partition: 1, points: 1017.71, rank: 308 },
			{ spec: "Devourer", partition: 1, points: 782.136, rank: 3441 },
		],
	},
	rows: [],
};
describe("scoped All Stars", () => {
	it("preserves each source pair and keeps the two DH specs separate", () => {
		expect(scopedAllStars(data, "Havoc")).toEqual(data.summary.allStars.slice(0, 2));
		expect(scopedAllStars(data, "Devourer")).toEqual([data.summary.allStars[2]]);
		expect(scopedAllStars(undefined, "Havoc")).toEqual([]);
	});
	it("uses overall damage or healing for the roster without combining metrics", () => {
		expect(primaryRaidMetric("arcane-mage")).toBe("dps");
		expect(primaryRaidMetric("preservation-evoker")).toBe("hps");
		expect(primaryRaidMetric("holy-paladin")).toBe("hps");
	});
	it("does not invent a patch name or interpret -1 as all patches", () => {
		for (const partition of [null, undefined, -1, 1, 2, 99])
			expect(raidPatchLabel(53, partition)).toBe("패치명 미확인");
		expect(raidPatchLabel(999, 1)).toBe("패치명 미확인");
	});
	it("distinguishes confirmed zeros and missing values", () => {
		expect(starPoints(0)).toBe("0");
		expect(starRank(0)).toBe("0위");
		for (const value of [null, undefined, Number.NaN]) {
			expect(starPoints(value)).toBe("—");
			expect(starRank(value)).toBe("—");
		}
	});
	it("shows both patch entries visibly with large score/rank pairs", () => {
		render(<AllStarsSummary data={data} specName="Havoc" zoneId={53} />);
		expect(document.querySelectorAll(".all-stars-entry")).toHaveLength(2);
		expect(screen.getByText("0")).toBeVisible();
		expect(screen.getByText("0위")).toBeVisible();
		expect(screen.getByText("1,017.71")).toBeVisible();
		expect(screen.getByText("308위")).toBeVisible();
		expect(screen.queryByText("3,441위")).not.toBeInTheDocument();
		expect(
			within(document.querySelector('[data-partition="2"]') as HTMLElement).getByText("0위"),
		).toBeVisible();
		expect(document.querySelector("details")).toBeNull();
	});
});
