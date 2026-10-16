import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExternalLink } from "../ExternalLink.js";

describe("ExternalLink", () => {
	it("renders label text", () => {
		render(<ExternalLink href="https://example.com" label="View on Wowhead" />);
		expect(screen.getByText(/View on Wowhead/)).toBeTruthy();
	});

	it('has target="_blank"', () => {
		render(<ExternalLink href="https://example.com" label="Link" />);
		const link = screen.getByRole("link");
		expect(link.getAttribute("target")).toBe("_blank");
	});

	it('has rel="noopener noreferrer"', () => {
		render(<ExternalLink href="https://example.com" label="Link" />);
		const link = screen.getByRole("link");
		expect(link.getAttribute("rel")).toContain("noopener");
		expect(link.getAttribute("rel")).toContain("noreferrer");
	});

	it("renders the ↗ glyph", () => {
		const { container } = render(<ExternalLink href="https://example.com" label="Link" />);
		expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("↗");
	});
});
