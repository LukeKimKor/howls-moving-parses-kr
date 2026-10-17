import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MythicPlusMetaGearPanel } from "../MythicPlusMetaGearPanel.js";

describe("MythicPlusMetaGearPanel", () => {
	it("renders empty state when no trinkets", () => {
		render(<MythicPlusMetaGearPanel trinkets={[]} />);
		expect(screen.getByText("장신구 표본 데이터가 없습니다.")).toBeTruthy();
	});

	it("renders trinket name and usage when data is present", () => {
		render(
			<MythicPlusMetaGearPanel
				trinkets={[
					{ name: "Vial of Animated Blood", source: "—", usagePercent: 80 },
					{ name: "Emberwing Feather", source: "—", usagePercent: 60 },
				]}
			/>,
		);
		expect(screen.getByText("Vial of Animated Blood")).toBeTruthy();
		expect(screen.getByText("80%")).toBeTruthy();
	});

	it('is wrapped in a Card with header "M+ Meta Trinkets (Top 10 EU)"', () => {
		render(<MythicPlusMetaGearPanel trinkets={[]} />);
		expect(screen.getByRole("heading", { name: /쐐기 장신구 표본/ })).toBeTruthy();
	});
});
