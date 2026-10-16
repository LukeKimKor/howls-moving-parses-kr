import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MythicPlusLeaderboardEntry } from "../../../types/snapshot.js";
import { MythicPlusLeaderboardPanel } from "../MythicPlusLeaderboardPanel.js";

const mockEntries: MythicPlusLeaderboardEntry[] = [
	{
		rank: 1,
		name: "Player1",
		realm: "Draenor",
		region: "eu",
		score: 4200,
		scoreColor: "#ff8000",
		bestPerformance: 222_174,
		trinkets: ["Emberwing Feather", "Gaze of the Alnseer"],
		profileUrl: "https://www.warcraftlogs.com/character/eu/draenor/player1",
		rioProfileUrl: "https://raider.io/characters/eu/draenor/player1",
	},
	{
		rank: 2,
		name: "Player2",
		realm: "Kazzak",
		region: "eu",
		score: 4100,
		scoreColor: "#e268a8",
		bestPerformance: 209_242,
		trinkets: [],
		profileUrl: "https://www.warcraftlogs.com/character/eu/kazzak/player2",
		rioProfileUrl: "https://raider.io/characters/eu/kazzak/player2",
	},
];

describe("MythicPlusLeaderboardPanel", () => {
	it("renders rank, name for each row", () => {
		render(<MythicPlusLeaderboardPanel leaderboard={mockEntries} metric="dps" />);
		expect(screen.getByText("1")).toBeTruthy();
		expect(screen.getByText(/Player1/)).toBeTruthy();
	});

	it("renders M+ score with locale formatting", () => {
		render(<MythicPlusLeaderboardPanel leaderboard={mockEntries} metric="dps" />);
		expect(screen.getByText("4,200")).toBeTruthy();
	});

	it("renders best DPS formatted as compact string", () => {
		render(<MythicPlusLeaderboardPanel leaderboard={mockEntries} metric="dps" />);
		expect(screen.getByText("222.2k")).toBeTruthy();
	});

	it("renders trinkets for players who have them", () => {
		render(<MythicPlusLeaderboardPanel leaderboard={mockEntries} metric="dps" />);
		expect(screen.getByText(/Emberwing Feather/)).toBeTruthy();
	});

	it("shows — when score is 0", () => {
		const base = mockEntries[0];
		if (!base) throw new Error("no mock");
		const noScore: MythicPlusLeaderboardEntry[] = [{ ...base, score: 0, scoreColor: "" }];
		render(<MythicPlusLeaderboardPanel leaderboard={noScore} metric="dps" />);
		expect(screen.getByText("—")).toBeTruthy();
	});

	it("shows HPS label for healer specs", () => {
		render(<MythicPlusLeaderboardPanel leaderboard={mockEntries} metric="hps" />);
		expect(screen.getByRole("columnheader", { name: "Best HPS" })).toBeTruthy();
	});

	it("empty leaderboard shows empty state", () => {
		render(<MythicPlusLeaderboardPanel leaderboard={[]} metric="dps" />);
		expect(screen.getByText(/No M\+ leaderboard data available/)).toBeTruthy();
	});
});
