import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Score } from "../Score.js";

describe("점수", () => {
	it("renders numeric value", () => {
		render(<Score value={3142} tier="Hero" color="#ff8000" />);
		expect(screen.getByText("3,142")).toBeTruthy();
	});

	it("renders tier label", () => {
		render(<Score value={3142} tier="Keystone Hero" color="#ff8000" />);
		expect(screen.getByText("쐐기돌 영웅")).toBeTruthy();
	});

	it("applies color style to value element", () => {
		const { container } = render(<Score value={1000} tier="Hero" color="#ff0000" />);
		const valueEl = container.querySelector(".score-value");
		expect(valueEl).toBeTruthy();
		// happy-dom may return the original hex or computed rgb — just check it's set
		expect((valueEl as HTMLElement).getAttribute("style")).toContain("color");
	});
});
