import { describe, expect, it } from "vitest";
import { ALL_SPECS } from "../../src/data/specs.js";

describe("ALL_SPECS", () => {
	it("has exactly 40 specs", () => {
		expect(ALL_SPECS).toHaveLength(40);
	});

	it("has no duplicate slugs", () => {
		const slugs = ALL_SPECS.map((s) => s.specSlug);
		const unique = new Set(slugs);
		expect(unique.size).toBe(40);
	});

	it("all slugs match pattern [a-z]+-[a-z-]+", () => {
		for (const spec of ALL_SPECS) {
			expect(spec.specSlug).toMatch(/^[a-z]+-[a-z-]+$/);
		}
	});

	it("all specs have required fields", () => {
		for (const spec of ALL_SPECS) {
			expect(spec.specSlug).toBeTruthy();
			expect(spec.specName).toBeTruthy();
			expect(spec.className).toBeTruthy();
			expect(spec.classDisplayName).toBeTruthy();
			expect(["dps", "tank", "healer"]).toContain(spec.role);
		}
	});

	it("Blood DK is tank", () => {
		const spec = ALL_SPECS.find((s) => s.specSlug === "blood-death-knight");
		expect(spec?.role).toBe("tank");
	});

	it("Holy Priest is healer", () => {
		const spec = ALL_SPECS.find((s) => s.specSlug === "holy-priest");
		expect(spec?.role).toBe("healer");
	});

	it("Elemental Shaman is dps", () => {
		const spec = ALL_SPECS.find((s) => s.specSlug === "elemental-shaman");
		expect(spec?.role).toBe("dps");
	});

	it("Brewmaster Monk is tank", () => {
		const spec = ALL_SPECS.find((s) => s.specSlug === "brewmaster-monk");
		expect(spec?.role).toBe("tank");
	});

	it("uses concatenated className for multi-word classes", () => {
		const dk = ALL_SPECS.find((s) => s.specSlug === "blood-death-knight");
		expect(dk?.className).toBe("DeathKnight");

		const dh = ALL_SPECS.find((s) => s.specSlug === "havoc-demon-hunter");
		expect(dh?.className).toBe("DemonHunter");
	});

	it("uses spaced classDisplayName for multi-word classes", () => {
		const dk = ALL_SPECS.find((s) => s.specSlug === "blood-death-knight");
		expect(dk?.classDisplayName).toBe("Death Knight");
	});
});
