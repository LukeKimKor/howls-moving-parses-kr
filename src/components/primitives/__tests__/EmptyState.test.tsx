import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../EmptyState.js";

describe("EmptyState", () => {
	it("renders message text", () => {
		render(<EmptyState message="No data available." />);
		expect(screen.getByText("No data available.")).toBeTruthy();
	});

	it("renders as a paragraph element", () => {
		const { container } = render(<EmptyState message="Empty" />);
		expect(container.querySelector("p.empty-state")).toBeTruthy();
	});
});
