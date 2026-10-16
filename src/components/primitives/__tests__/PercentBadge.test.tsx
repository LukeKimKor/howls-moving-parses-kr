import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PercentBadge } from "../PercentBadge.js";

describe("PercentBadge", () => {
	it("renders the percentage value", () => {
		render(<PercentBadge value={94.1} />);
		expect(screen.getByText("94.1%")).toBeTruthy();
	});

	it("applies parse-legendary class for 99+", () => {
		const { container } = render(<PercentBadge value={99} />);
		expect(container.querySelector(".parse-legendary")).toBeTruthy();
	});

	it("applies parse-epic class for 95-98", () => {
		const { container } = render(<PercentBadge value={95} />);
		expect(container.querySelector(".parse-epic")).toBeTruthy();
	});

	it("applies parse-rare class for 75-94", () => {
		const { container } = render(<PercentBadge value={80} />);
		expect(container.querySelector(".parse-rare")).toBeTruthy();
	});

	it("applies parse-uncommon class for 50-74", () => {
		const { container } = render(<PercentBadge value={60} />);
		expect(container.querySelector(".parse-uncommon")).toBeTruthy();
	});
});
