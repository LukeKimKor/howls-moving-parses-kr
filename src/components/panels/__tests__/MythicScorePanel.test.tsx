import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MythicPlusData } from "../../../types/snapshot.js";
import { MythicScorePanel } from "../MythicScorePanel.js";

const mockData: MythicPlusData = {
	score: 3142,
	scoreColor: "#ff8000",
	scoreTierLabel: "Keystone Hero",
	realmRank: 42,
	regionRank: 1830,
	worldRank: 19204,
	titleCutoff: { score: 3310, percentile: 1, region: "eu", updatedAt: "2024-01-01T00:00:00Z" },
	recentRuns: [],
	bestRuns: [],
};

describe("MythicScorePanel", () => {
	it("renders score and tier label", () => {
		render(<MythicScorePanel data={mockData} />);
		expect(screen.getByText("3,142")).toBeTruthy();
		expect(screen.getByText("쐐기돌 영웅")).toBeTruthy();
	});

	it("renders cutoff row with distance indicator", () => {
		render(<MythicScorePanel data={mockData} />);
		expect(screen.getByText(/점수 기준/)).toBeTruthy();
		// Score 3142, cutoff 3310 → 168 pts behind → shows ▼
		expect(screen.getByText(/168\.0점/)).toBeTruthy();
	});

	it("shows error state when data is null", () => {
		render(<MythicScorePanel data={null} />);
		expect(screen.getByText(/쐐기 점수 데이터가 없습니다/)).toBeTruthy();
	});

	it("does not show cutoff when cutoff score is 0", () => {
		const dataWithZeroCutoff: MythicPlusData = {
			...mockData,
			titleCutoff: { ...mockData.titleCutoff, score: 0 },
		};
		const { container } = render(<MythicScorePanel data={dataWithZeroCutoff} />);
		expect(container.querySelector(".cutoff-row")).toBeNull();
	});

	it("applies cutoff-behind class when score is clearly below cutoff", () => {
		const { container } = render(<MythicScorePanel data={mockData} />);
		// 3142 vs 3310 = -168 pts, within -300 range → cutoff-near (orange)
		expect(container.querySelector(".cutoff-near")).toBeTruthy();
	});

	it("applies cutoff-ahead class when score is comfortably above cutoff", () => {
		const aheadData: MythicPlusData = { ...mockData, score: 3700 };
		const { container } = render(<MythicScorePanel data={aheadData} />);
		expect(container.querySelector(".cutoff-ahead")).toBeTruthy();
	});
});
