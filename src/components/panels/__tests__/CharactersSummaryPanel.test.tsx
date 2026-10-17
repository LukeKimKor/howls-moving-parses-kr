import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CharacterData } from "../../../types/snapshot.js";
import { CharactersSummaryPanel } from "../CharactersSummaryPanel.js";

const mockCharacter: CharacterData = {
	name: "Hxwl",
	realm: "Draenor",
	region: "eu",
	class: "Shaman",
	thumbnailUrl: null,
	isDefault: true,
	mainSpecSlug: "elemental-shaman",
	specOrder: ["elemental-shaman"],
	specs: {
		"elemental-shaman": {
			specSlug: "elemental-shaman",
			specName: "Elemental",
			role: "main",
			mythicPlus: {
				score: 3142,
				scoreColor: "#ff8000",
				scoreTierLabel: "Keystone Hero",
				realmRank: 42,
				regionRank: 1830,
				worldRank: 19204,
				titleCutoff: {
					score: 3310,
					percentile: 1,
					region: "eu",
					updatedAt: "2024-01-01T00:00:00Z",
				},
				recentRuns: [],
				bestRuns: [
					{
						dungeon: "Algeth'ar Academy",
						shortName: "AA",
						keystoneLevel: 18,
						completedAt: "2024-01-01T00:00:00Z",
						clearTimeMs: 1_800_000,
						keystoneTimeMs: 1_900_000,
						inTime: true,
						score: 250,
						affixes: [],
					},
				],
			},
			logs: null,
			gear: null,
			talents: null,
		},
	},
};

describe("CharactersSummaryPanel", () => {
	it("trigger button shows character count and is present", () => {
		render(
			<CharactersSummaryPanel
				characters={[mockCharacter]}
				generatedAt="2024-05-03T18:04:00.000Z"
				onSelectCharacter={() => {}}
			/>,
		);
		expect(screen.getByText(/전체 캐릭터 \(1\)/)).toBeTruthy();
	});

	it("renders one row per character", () => {
		render(
			<CharactersSummaryPanel
				characters={[mockCharacter]}
				generatedAt="2024-05-03T18:04:00.000Z"
				onSelectCharacter={() => {}}
			/>,
		);
		const rows = screen.getAllByRole("row");
		// header + 1 data row
		expect(rows.length).toBe(2);
	});

	it("clicking a row calls onSelectCharacter with character name", () => {
		const onSelect = vi.fn();
		render(
			<CharactersSummaryPanel
				characters={[mockCharacter]}
				generatedAt="2024-05-03T18:04:00.000Z"
				onSelectCharacter={onSelect}
			/>,
		);
		const rows = screen.getAllByRole("row");
		const dataRow = rows[1];
		if (!dataRow) throw new Error("No data row found");
		fireEvent.click(dataRow);
		expect(onSelect).toHaveBeenCalledWith("Hxwl");
	});

	it("dungeon short names appear as column headers", () => {
		render(
			<CharactersSummaryPanel
				characters={[mockCharacter]}
				generatedAt="2024-05-03T18:04:00.000Z"
				onSelectCharacter={() => {}}
			/>,
		);
		expect(screen.getByRole("columnheader", { name: "AA" })).toBeTruthy();
	});

	it("shows key level for dungeons with runs", () => {
		render(
			<CharactersSummaryPanel
				characters={[mockCharacter]}
				generatedAt="2024-05-03T18:04:00.000Z"
				onSelectCharacter={() => {}}
			/>,
		);
		expect(screen.getByText("+18")).toBeTruthy();
	});
});
