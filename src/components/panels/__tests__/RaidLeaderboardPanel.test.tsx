import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RaidLeaderboardEntry } from "../../../types/snapshot.js";
import { RaidLeaderboardPanel } from "../RaidLeaderboardPanel.js";

const mockEntries: RaidLeaderboardEntry[] = [
	{
		rank: 1,
		name: "Player1",
		realm: "Draenor",
		region: "EU",
		bestPercent: 99.5,
		ilvlAdjustedPercent: 99.2,
		rankLabel: "Legendary",
		wclProfileUrl: "https://www.warcraftlogs.com/character/eu/draenor/player1",
	},
];

describe("RaidLeaderboardPanel", () => {
	it("renders rank, name, and score for each row", () => {
		render(<RaidLeaderboardPanel mythicLeaderboard={mockEntries} heroicLeaderboard={[]} />);
		expect(screen.getByText("1")).toBeTruthy();
		expect(screen.getByText(/Player1/)).toBeTruthy();
	});

	it("empty leaderboard shows empty state", () => {
		render(<RaidLeaderboardPanel mythicLeaderboard={[]} heroicLeaderboard={[]} />);
		expect(screen.getByText(/공격대 순위 데이터가 없습니다/)).toBeTruthy();
	});
});
