import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecIcon, specIconUrl } from "../SpecIcon.js";

describe("WCL spec icon URLs (no image-host requests)", () => {
	it("uses the documented icons directory for all fourteen registered specs", () => {
		const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as {
			characters: Array<{ class: string; specs: Array<{ spec: string; role: string }> }>;
		};
		const urls = config.characters.flatMap((c) =>
			c.specs.filter((s) => s.role !== "inactive").map((s) => specIconUrl(c.class, s.spec)),
		);
		expect(urls).toHaveLength(14);
		for (const url of urls)
			expect(url).toMatch(
				/^https:\/\/assets\.rpglogs\.com\/img\/warcraft\/icons\/[A-Za-z]+-[A-Za-z]+\.jpg$/,
			);
		expect(specIconUrl("Demon Hunter", "Devourer")).toBe(
			"https://assets.rpglogs.com/img/warcraft/icons/DemonHunter-Devourer.jpg",
		);
		expect(specIconUrl("DeathKnight", "Unholy")).toBe(
			"https://assets.rpglogs.com/img/warcraft/icons/DeathKnight-Unholy.jpg",
		);
	});
	it("does not invent a filename for unknown All Stars specs", () => {
		expect(specIconUrl("Mage", "Unknown")).toBeUndefined();
		render(<SpecIcon className="Mage" specName="Unknown" />);
		expect(screen.getByRole("img", { name: "전문화 미확인" }).tagName).toBe("SPAN");
		expect(document.querySelector("img")).toBeNull();
	});
	it("keeps its label after an image failure and retries when the spec changes", () => {
		const { rerender } = render(<SpecIcon className="DemonHunter" specName="Havoc" />);
		fireEvent.error(screen.getByRole("img", { name: "파멸" }));
		expect(screen.getByRole("img", { name: "파멸" }).tagName).toBe("SPAN");
		rerender(<SpecIcon className="DemonHunter" specName="Devourer" />);
		expect(screen.getByRole("img", { name: "포식" })).toHaveAttribute(
			"src",
			"https://assets.rpglogs.com/img/warcraft/icons/DemonHunter-Devourer.jpg",
		);
	});
});
