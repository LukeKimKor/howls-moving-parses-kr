import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RaidMetaGearPanel } from "../RaidMetaGearPanel.js";

describe("RaidMetaGearPanel", () => {
	it("renders empty state when no trinkets", () => {
		render(<RaidMetaGearPanel trinkets={[]} />);
		expect(screen.getByText("No trinket data available.")).toBeTruthy();
	});

	it("renders trinket name and usage when data is present", () => {
		render(
			<RaidMetaGearPanel
				trinkets={[{ name: "Vial of Animated Blood", source: "—", usagePercent: 70 }]}
			/>,
		);
		expect(screen.getByText("Vial of Animated Blood")).toBeTruthy();
		expect(screen.getByText("70%")).toBeTruthy();
	});

	it('is wrapped in a Card with header "Raid Meta Trinkets (Top 10 EU)"', () => {
		render(<RaidMetaGearPanel trinkets={[]} />);
		expect(screen.getByRole("heading", { name: /Raid Meta Trinkets/ })).toBeTruthy();
	});
});
