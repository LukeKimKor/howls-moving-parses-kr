import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MythicPlusRun } from "../../../types/snapshot.js";
import { RecentRunsPanel } from "../RecentRunsPanel.js";

const mockRun = (inTime: boolean, level: number): MythicPlusRun => ({
	dungeon: "Algeth'ar Academy",
	shortName: "AA",
	keystoneLevel: level,
	completedAt: "2024-01-01T00:00:00Z",
	clearTimeMs: 1_800_000,
	keystoneTimeMs: 1_900_000,
	inTime,
	score: 250,
	affixes: [{ name: "Fortified", description: "", iconUrl: "" }],
});

describe("RecentRunsPanel", () => {
	it("renders correct number of rows for mock run data", () => {
		const runs = [mockRun(true, 18), mockRun(false, 17), mockRun(true, 16)];
		render(<RecentRunsPanel recentRuns={runs} bestRuns={[]} />);
		const rows = screen.getAllByRole("row");
		// 1 header row + 3 data rows
		expect(rows.length).toBe(4);
	});

	it("in-time runs show green styled 'In time' text", () => {
		render(<RecentRunsPanel recentRuns={[mockRun(true, 18)]} bestRuns={[]} />);
		const el = screen.getByText("시간 내 완료");
		expect(el.className).toContain("run-status-intimer");
	});

	it("depleted runs show red styled 'Depleted' text", () => {
		render(<RecentRunsPanel recentRuns={[mockRun(false, 17)]} bestRuns={[]} />);
		const el = screen.getByText("시간 초과");
		expect(el.className).toContain("run-status-depleted");
	});

	it("empty runs array renders empty state message", () => {
		render(<RecentRunsPanel recentRuns={[]} bestRuns={[]} />);
		expect(screen.getByText(/최근 쐐기 기록이 없습니다/)).toBeTruthy();
	});
});
