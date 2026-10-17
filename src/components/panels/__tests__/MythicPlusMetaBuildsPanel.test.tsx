import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MythicPlusMetaBuildsPanel } from "../MythicPlusMetaBuildsPanel.js";

describe("MythicPlusMetaBuildsPanel", () => {
	it("always renders the empty state regardless of input", () => {
		render(<MythicPlusMetaBuildsPanel />);
		expect(screen.getByText("특성 빌드 집계는 아직 제공되지 않습니다.")).toBeTruthy();
	});

	it('is wrapped in a Card with header "M+ Meta Talent Builds"', () => {
		render(<MythicPlusMetaBuildsPanel />);
		expect(screen.getByRole("heading", { name: "쐐기 특성 빌드 표본" })).toBeTruthy();
	});
});
