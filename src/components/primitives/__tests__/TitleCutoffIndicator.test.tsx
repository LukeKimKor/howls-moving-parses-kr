import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TitleCutoffIndicator } from "../TitleCutoffIndicator.js";

describe("TitleCutoffIndicator", () => {
	it("shows your score and cutoff score", () => {
		render(<TitleCutoffIndicator yourScore={3142} cutoff={3310} />);
		expect(screen.getByText(/3,142/)).toBeTruthy();
		expect(screen.getByText(/3,310/)).toBeTruthy();
	});

	it('shows "Below" indicator when score < cutoff', () => {
		render(<TitleCutoffIndicator yourScore={3000} cutoff={3310} />);
		expect(screen.getByText(/▼ Below/)).toBeTruthy();
	});

	it('shows "Above" indicator when score >= cutoff', () => {
		render(<TitleCutoffIndicator yourScore={3400} cutoff={3310} />);
		expect(screen.getByText(/▲ Above/)).toBeTruthy();
	});

	it("shows the label text", () => {
		render(<TitleCutoffIndicator yourScore={3000} cutoff={3310} />);
		expect(screen.getByText(/title cutoff/i)).toBeTruthy();
	});
});
