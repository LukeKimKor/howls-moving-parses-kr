import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppStateProvider } from "../../../contexts/AppStateContext.js";
import type { CharacterData } from "../../../types/snapshot.js";
import { CharacterSpecToggle } from "../CharacterSpecToggle.js";

const singleSpecChar: CharacterData = {
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
};

const multiSpecChar: CharacterData = {
	name: "Hxwl",
	realm: "Draenor",
	region: "eu",
	class: "Shaman",
	thumbnailUrl: null,
	isDefault: true,
	mainSpecSlug: "elemental-shaman",
	specOrder: ["elemental-shaman", "enhancement-shaman"],
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
		"enhancement-shaman": {
			specSlug: "enhancement-shaman",
			specName: "Enhancement",
			role: "offspec",
			mythicPlus: null,
			logs: null,
			gear: null,
			talents: null,
		},
	},
};

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

describe("CharacterSpecToggle", () => {
	it("does not render when character has only a main spec", () => {
		const { container } = render(<CharacterSpecToggle character={singleSpecChar} />, {
			wrapper: Wrapper,
		});
		expect(container.querySelector(".spec-toggle")).toBeNull();
	});

	it("renders one button per spec when character has main + offspec", () => {
		render(<CharacterSpecToggle character={multiSpecChar} />, { wrapper: Wrapper });
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(2);
	});

	it('main spec is selected by default (aria-pressed="true")', () => {
		render(<CharacterSpecToggle character={multiSpecChar} />, { wrapper: Wrapper });
		const buttons = screen.getAllByRole("button");
		const activeButton = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
		expect(activeButton?.textContent).toContain("정기");
	});

	it("spec labels show human-readable spec names", () => {
		render(<CharacterSpecToggle character={multiSpecChar} />, { wrapper: Wrapper });
		expect(screen.getByText("정기")).toBeTruthy();
		expect(screen.getByText("고양")).toBeTruthy();
	});

	it('clicking inactive spec sets aria-pressed="true" on it', () => {
		render(<CharacterSpecToggle character={multiSpecChar} />, { wrapper: Wrapper });
		const enhButton = screen.getByText("고양");
		fireEvent.click(enhButton);
		expect(enhButton.closest("button")?.getAttribute("aria-pressed")).toBe("true");
	});

	it('inactive specs have aria-pressed="false"', () => {
		render(<CharacterSpecToggle character={multiSpecChar} />, { wrapper: Wrapper });
		const buttons = screen.getAllByRole("button");
		const inactiveButtons = buttons.filter((b) => b.getAttribute("aria-pressed") === "false");
		expect(inactiveButtons).toHaveLength(1);
	});
});
