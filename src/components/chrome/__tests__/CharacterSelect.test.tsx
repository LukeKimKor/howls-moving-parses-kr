import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppStateProvider } from "../../../contexts/AppStateContext.js";
import type { CharacterData } from "../../../types/snapshot.js";
import { CharacterSelect } from "../CharacterSelect.js";

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

function Wrapper({ children }: { children: React.ReactNode }) {
	return (
		<AppStateProvider
			defaultCharacterName="Hxwl"
			defaultCharacterMainSpecSlug="elemental-shaman"
			defaultMetaSpecSlug="elemental-shaman"
		>
			{children}
		</AppStateProvider>
	);
}

describe("CharacterSelect", () => {
	it("renders one option per character", () => {
		render(<CharacterSelect characters={mockChars} />, { wrapper: Wrapper });
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(2);
	});

	it("default character is pre-selected", () => {
		render(<CharacterSelect characters={mockChars} />, { wrapper: Wrapper });
		const select = screen.getByRole("combobox") as HTMLSelectElement;
		expect(select.value).toBe("Hxwl");
	});

	it("selecting a character updates the selection", () => {
		render(<CharacterSelect characters={mockChars} />, { wrapper: Wrapper });
		const select = screen.getByRole("combobox");
		fireEvent.change(select, { target: { value: "Altchar" } });
		expect((select as HTMLSelectElement).value).toBe("Altchar");
	});
});
