import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankList } from "../RankList.js";

describe("RankList", () => {
	it("renders all three rank labels", () => {
		render(<RankList ranks={{ realm: 42, region: 1830, world: 19204 }} />);
		expect(screen.getByText("Realm")).toBeTruthy();
		expect(screen.getByText("Region")).toBeTruthy();
		expect(screen.getByText("World")).toBeTruthy();
	});

	it("renders rank values with # prefix", () => {
		render(<RankList ranks={{ realm: 42, region: 1830, world: 19204 }} />);
		expect(screen.getByText("#42")).toBeTruthy();
		expect(screen.getByText("#1,830")).toBeTruthy();
		expect(screen.getByText("#19,204")).toBeTruthy();
	});
});
