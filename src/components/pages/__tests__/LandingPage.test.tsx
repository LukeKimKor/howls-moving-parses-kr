import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CharacterData } from "../../../types/snapshot.js";
import { LandingPage } from "../LandingPage.js";

const mockChars: CharacterData[] = [
	{
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
				mythicPlus: null,
				logs: null,
				gear: null,
				talents: null,
			},
		},
	},
	{
		name: "Altchar",
		realm: "Kazzak",
		region: "eu",
		class: "Druid",
		thumbnailUrl: null,
		isDefault: false,
		mainSpecSlug: "guardian-druid",
		specOrder: ["guardian-druid"],
		specs: {
			"guardian-druid": {
				specSlug: "guardian-druid",
				specName: "Guardian",
				role: "main",
				mythicPlus: null,
				logs: null,
				gear: null,
				talents: null,
			},
		},
	},
];

describe("LandingPage", () => {
	it("renders a button for each character", () => {
		render(<LandingPage characters={mockChars} onSelect={vi.fn()} />);
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(mockChars.length);
	});

	it("clicking a character button calls onSelect with the correct character", () => {
		const onSelect = vi.fn();
		render(<LandingPage characters={mockChars} onSelect={onSelect} />);

		// Click the button for "Altchar"
		const altcharButton = screen.getByText("Altchar");
		fireEvent.click(altcharButton);

		expect(onSelect).toHaveBeenCalledOnce();
		expect(onSelect).toHaveBeenCalledWith(mockChars[1]);
	});

	it("clicking the first character button calls onSelect with the first character", () => {
		const onSelect = vi.fn();
		render(<LandingPage characters={mockChars} onSelect={onSelect} />);

		const hxwlButton = screen.getByText("Hxwl");
		fireEvent.click(hxwlButton);

		expect(onSelect).toHaveBeenCalledOnce();
		expect(onSelect).toHaveBeenCalledWith(mockChars[0]);
	});
});
