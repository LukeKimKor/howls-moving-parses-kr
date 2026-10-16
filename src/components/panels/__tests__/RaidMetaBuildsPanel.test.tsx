import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RaidMetaBuildsPanel } from "../RaidMetaBuildsPanel.js";

describe("RaidMetaBuildsPanel", () => {
	it("always renders the empty state regardless of input", () => {
		render(<RaidMetaBuildsPanel />);
		expect(screen.getByText("Meta builds will be available in a future release.")).toBeTruthy();
	});

	it('is wrapped in a Card with header "Raid Meta Talent Builds"', () => {
		render(<RaidMetaBuildsPanel />);
		expect(screen.getByRole("heading", { name: "Raid Meta Talent Builds" })).toBeTruthy();
	});
});
