import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DamageSource } from "../../../types/snapshot.js";
import { DamageBreakdownPanel } from "../DamageBreakdownPanel.js";

const mockSources: DamageSource[] = [
	{ name: "Chain Lightning", total: 28_664_914, percentOfTotal: 17.04 },
	{ name: "Tempest", total: 25_936_326, percentOfTotal: 15.42 },
	{ name: "Earthquake", total: 23_830_961, percentOfTotal: 14.17 },
	{ name: "Lightning Bolt", total: 22_379_510, percentOfTotal: 13.31 },
	{ name: "Lightning Rod", total: 17_970_472, percentOfTotal: 10.68 },
	{ name: "Primal Storm Elemental", total: 12_143_857, percentOfTotal: 7.22 },
];

describe("DamageBreakdownPanel", () => {
	it("renders up to 5 ability rows", () => {
		render(<DamageBreakdownPanel breakdown={mockSources} />);
		// 6 sources but only 5 should be shown
		expect(screen.getByText("Chain Lightning")).toBeTruthy();
		expect(screen.getByText("Lightning Rod")).toBeTruthy();
		expect(screen.queryByText("Primal Storm Elemental")).toBeNull();
	});

	it("each row has an accessible label with ability name + percentage", () => {
		render(<DamageBreakdownPanel breakdown={mockSources.slice(0, 2)} />);
		expect(screen.getByLabelText(/Chain Lightning.*17\.0/)).toBeTruthy();
	});

	it("handles empty breakdown gracefully", () => {
		render(<DamageBreakdownPanel breakdown={[]} />);
		expect(screen.getByText(/피해량 구성 데이터가 없습니다/)).toBeTruthy();
	});
});
