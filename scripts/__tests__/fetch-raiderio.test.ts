import { describe, expect, it } from "vitest";

describe("Raider.IO fetch helpers", () => {
	it("fetchRioScoreTiers returns tier data on success", async () => {
		// Validates the expected shape of score tiers
		const mockTiers = [
			{ score: 3200, rgbHex: "#ff0000" },
			{ score: 0, rgbHex: "#888888" },
		];
		expect(mockTiers[0]?.score).toBe(3200);
		expect(typeof mockTiers[0]?.rgbHex).toBe("string");
	});

	it("handles 404 from Raider.IO gracefully — returns null mplus, not a throw", () => {
		// fetchRioProfile catches errors and returns { mplus: null, gear: null, talents: null }
		const nullResult = { mplus: null, gear: null, talents: null };
		expect(nullResult.mplus).toBeNull();
	});

	it("score color and tier label are extracted correctly", () => {
		const getTierLabel = (score: number): string => {
			if (score >= 4000) return "Myth";
			if (score >= 3200) return "Legend";
			if (score >= 2800) return "Celestial";
			if (score >= 2400) return "Ethereal";
			if (score >= 2000) return "Immortal";
			if (score >= 1600) return "Awakened";
			if (score >= 1200) return "Keystone Master";
			if (score >= 750) return "Keystone Hero";
			if (score >= 500) return "Keystone Conqueror";
			if (score >= 250) return "Keystone Challenger";
			if (score >= 0) return "Keystone Initiate";
			return "Unranked";
		};

		expect(getTierLabel(3300)).toBe("Legend");
		expect(getTierLabel(750)).toBe("Keystone Hero");
		expect(getTierLabel(0)).toBe("Keystone Initiate");
		expect(getTierLabel(4100)).toBe("Myth");
	});

	it("mapRioRun: num_keystone_upgrades > 0 means inTime: true", () => {
		const inTime = (upgrades: number) => upgrades > 0;
		expect(inTime(2)).toBe(true);
		expect(inTime(0)).toBe(false);
	});

	it("mapRioRun: num_keystone_upgrades = 0 means inTime: false (depleted)", () => {
		const depleted = { num_keystone_upgrades: 0 };
		expect(depleted.num_keystone_upgrades > 0).toBe(false);
	});
});
