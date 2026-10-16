import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RaidPercent } from "../RaidPercent.js";

describe("WCL raid percentile bands", () => {
	it.each([
		[24.9, "grey"],
		[25, "green"],
		[49.9, "green"],
		[50, "blue"],
		[74.9, "blue"],
		[75, "purple"],
		[94.9, "purple"],
		[95, "orange"],
		[98.9, "orange"],
		[99, "pink"],
		[100, "gold"],
	] as const)("%s belongs to %s", (value, band) => {
		render(<RaidPercent value={value} />);
		expect(screen.getByText(`${value.toFixed(1)}%`)).toHaveClass(`wcl-${band}`);
	});
});
