import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RaidMetaBuildsPanel } from "../RaidMetaBuildsPanel.js";

describe("RaidMetaBuildsPanel", () => {
	it("always renders the empty state regardless of input", () => {
		render(<RaidMetaBuildsPanel />);
		expect(screen.getByText("특성 빌드 집계는 아직 제공되지 않습니다.")).toBeTruthy();
	});

	it('is wrapped in a Card with header "Raid Meta Talent Builds"', () => {
		render(<RaidMetaBuildsPanel />);
		expect(screen.getByRole("heading", { name: "공격대 특성 빌드 표본" })).toBeTruthy();
	});
});
