import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MeterRow } from "../MeterRow.js";

describe("MeterRow", () => {
	it("renders label", () => {
		render(<MeterRow label="Lava Burst" value={28.4} />);
		expect(screen.getByText("Lava Burst")).toBeTruthy();
	});

	it("renders percentage value", () => {
		render(<MeterRow label="Lava Burst" value={28.4} />);
		expect(screen.getByText("28.4%")).toBeTruthy();
	});

	it("has accessible label combining name and percentage", () => {
		const { container } = render(<MeterRow label="Chain Lightning" value={17.0} />);
		const el = container.querySelector("[aria-label]");
		expect(el?.getAttribute("aria-label")).toContain("Chain Lightning");
		expect(el?.getAttribute("aria-label")).toContain("17.0%");
	});

	it("clamps values above 100 to 100", () => {
		render(<MeterRow label="Test" value={150} />);
		expect(screen.getByText("100.0%")).toBeTruthy();
	});
});
