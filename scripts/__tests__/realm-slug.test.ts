import { describe, expect, it } from "vitest";
import { toRealmSlug } from "../realm-slug.js";

describe("toRealmSlug", () => {
	it('converts "Draenor" to "draenor"', () => {
		expect(toRealmSlug("Draenor")).toBe("draenor");
	});

	it('converts "Twisting Nether" to "twisting-nether"', () => {
		expect(toRealmSlug("Twisting Nether")).toBe("twisting-nether");
	});

	it('converts "Mal\'Ganis" to "malganis"', () => {
		expect(toRealmSlug("Mal'Ganis")).toBe("malganis");
	});

	it('converts "Area 52" to "area-52"', () => {
		expect(toRealmSlug("Area 52")).toBe("area-52");
	});

	it('converts "Frostmäne" to "frostmane" (NFD normalisation)', () => {
		expect(toRealmSlug("Frostmäne")).toBe("frostmane");
	});

	it("strips leading/trailing special chars", () => {
		expect(toRealmSlug("  Draenor  ")).toBe("draenor");
	});

	it("converts curly apostrophe in realm name", () => {
		expect(toRealmSlug("Kael'thas")).toBe("kaelthas");
	});

	it("handles multiple spaces", () => {
		expect(toRealmSlug("Burning  Blade")).toBe("burning-blade");
	});
});
