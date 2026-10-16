import { describe, expect, it } from "vitest";
import { validateConfig } from "../config-validation.js";

const validSingleSpec = {
	characters: [
		{
			name: "Hxwl",
			realm: "Draenor",
			region: "eu" as const,
			class: "Shaman",
			default: true,
			specs: [{ spec: "Elemental", role: "main" as const }],
		},
	],
};

const validMultiSpec = {
	characters: [
		{
			name: "Hxwl",
			realm: "Draenor",
			region: "eu" as const,
			class: "Shaman",
			default: true,
			specs: [
				{ spec: "Elemental", role: "main" as const },
				{ spec: "Enhancement", role: "offspec" as const },
				{ spec: "Restoration", role: "inactive" as const },
			],
		},
	],
};

describe("validateConfig", () => {
	it("passes for valid single-spec config", () => {
		expect(() => validateConfig(validSingleSpec)).not.toThrow();
	});

	it("passes for valid multi-spec config (main + offspec + inactive)", () => {
		expect(() => validateConfig(validMultiSpec)).not.toThrow();
	});

	it("throws when characters array is missing", () => {
		expect(() => validateConfig({} as never)).toThrow(/"characters"/);
	});

	it("throws when characters array is empty", () => {
		expect(() => validateConfig({ characters: [] })).toThrow(/empty/);
	});

	it("throws when name is missing", () => {
		const config = {
			characters: [
				{
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/name/);
	});

	it("throws when realm is missing", () => {
		const config = {
			characters: [
				{
					name: "X",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/realm/);
	});

	it("throws when region is missing", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/region/);
	});

	it("throws when class is missing", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/class/);
	});

	it("throws when specs is missing", () => {
		const config = {
			characters: [
				{ name: "X", realm: "Draenor", region: "eu" as const, class: "Shaman", default: true },
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/specs/);
	});

	it("throws when multiple default: true", () => {
		const config = {
			characters: [
				{
					name: "A",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
				{
					name: "B",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/multiple/i);
	});

	it("throws when zero default: true", () => {
		const config = {
			characters: [
				{
					name: "A",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: false,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/none found/i);
	});

	it("throws when region is not eu", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Area 52",
					region: "us",
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/"eu"/);
	});

	it("throws when specs array is empty", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/non-empty/);
	});

	it("throws when a spec entry is missing spec field", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/spec.*field/i);
	});

	it("throws when a spec entry is missing role field", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/role.*field/i);
	});

	it("throws when role is invalid", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "backup" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/invalid role/i);
	});

	it("throws when zero role: main entries", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "offspec" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/none found/i);
	});

	it("throws when two role: main entries on the same character", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [
						{ spec: "Elemental", role: "main" },
						{ spec: "Enhancement", role: "main" },
					],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/multiple/i);
	});

	it("throws when character has only inactive specs", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Elemental", role: "inactive" }],
				},
			],
		};
		// Validation may throw about missing "main" role first, or about all-inactive
		expect(() => validateConfig(config as never)).toThrow(/main|inactive/i);
	});

	it("throws when the same spec is declared twice", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [
						{ spec: "Elemental", role: "main" },
						{ spec: "Elemental", role: "offspec" },
					],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/duplicate/i);
	});

	it("throws when spec does not exist for the given class", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Shaman",
					default: true,
					specs: [{ spec: "Frost", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/not a valid spec/i);
	});

	it("throws when class is unknown", () => {
		const config = {
			characters: [
				{
					name: "X",
					realm: "Draenor",
					region: "eu" as const,
					class: "Tinker",
					default: true,
					specs: [{ spec: "Elemental", role: "main" }],
				},
			],
		};
		expect(() => validateConfig(config as never)).toThrow(/unknown class/i);
	});
});
