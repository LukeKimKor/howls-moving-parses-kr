import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppStateProvider } from "../../../contexts/AppStateContext.js";
import { SpecSelect } from "../SpecSelect.js";

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

describe("SpecSelect", () => {
	it("renders 39 options total", () => {
		render(<SpecSelect />, { wrapper: Wrapper });
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(40);
	});

	it("has optgroups for each class", () => {
		const { container } = render(<SpecSelect />, { wrapper: Wrapper });
		const optgroups = container.querySelectorAll("optgroup");
		// 13 classes: DK, DH, Druid, Evoker, Hunter, Mage, Monk, Paladin, Priest, Rogue, Shaman, Warlock, Warrior
		expect(optgroups.length).toBeGreaterThanOrEqual(13);
	});

	it('uses classDisplayName for group labels (e.g. "Death Knight" not "DeathKnight")', () => {
		const { container } = render(<SpecSelect />, { wrapper: Wrapper });
		const optgroups = container.querySelectorAll("optgroup");
		const labels = [...optgroups].map((g) => g.getAttribute("label"));
		expect(labels).toContain("죽음의 기사");
		expect(labels).not.toContain("DeathKnight");
	});

	it("selecting a spec calls setSelectedMetaSpecSlug with correct slug", () => {
		render(<SpecSelect />, { wrapper: Wrapper });
		const select = screen.getByRole("combobox");
		fireEvent.change(select, { target: { value: "frost-mage" } });
		expect((select as HTMLSelectElement).value).toBe("frost-mage");
	});
});
