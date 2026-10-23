import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../../src/types/snapshot.js";
import { characterShell } from "../fetch-data.js";
import { restoreSnapshot } from "../restore-snapshot.js";
const memory = vi.hoisted(() => new Map<string, string>());
const config = vi.hoisted(() => ({
	characters: ["Unchanged", "Renamed"].map((name, i) => ({
		name,
		region: "kr" as const,
		realm: "Azshara",
		realmSlug: "azshara",
		class: "Mage",
		default: i === 0,
		specs: [{ spec: "Arcane", role: "main" as const }],
	})),
}));
vi.mock("node:fs", () => {
	const mocked = {
		existsSync: (path: string) => memory.has(path),
		mkdirSync: vi.fn(),
		readFileSync: (path: unknown) => {
			if (String(path).endsWith("characters.config.json")) return JSON.stringify(config);
			const value = memory.get(String(path));
			if (value === undefined) throw Error("Synthetic file missing");
			return value;
		},
		writeFileSync: (path: string, value: string) => memory.set(path, value),
	};
	return { ...mocked, default: mocked };
});
let published: Snapshot;
beforeEach(() => {
	memory.clear();
	published = {
		generatedAt: "2026-10-22T00:00:00.000Z",
		buildHash: "fixture",
		region: "kr",
		dataMode: "full",
		characters: config.characters.map((c) => characterShell(c)),
	};
	vi.stubEnv("PREVIOUS_SITE_URL", "https://fixture.invalid/dashboard/");
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(JSON.stringify(published))),
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});
function restored(): Snapshot {
	return JSON.parse(memory.get("cache/last-snapshot.json") ?? "null");
}
describe("published snapshot partial roster restoration without real filesystem or network", () => {
	it.each(["legacy", "dashboard"])(
		"restores matching identities from %s data when another configured name changed",
		async (shape) => {
			const changed = published.characters[1];
			if (!changed) throw Error("Synthetic character missing");
			changed.name = "OldName";
			if (shape === "legacy") {
				published.specs = {};
				published.wclMetadataAt = published.generatedAt;
			}
			await restoreSnapshot();
			expect(restored()?.characters.map((c) => c.name)).toEqual(["Unchanged"]);
			expect(restored()?.characters[0]).toEqual(published.characters[0]);
			expect(restored()?.generatedAt).toBe(published.generatedAt);
			// The workflow's missing-name check still selects characters rather than cache.
			const names = new Set(restored()?.characters.map((c) => c.name));
			expect(config.characters.filter((c) => !names.has(c.name)).map((c) => c.name)).toEqual([
				"Renamed",
			]);
		},
	);
	it.each(["region", "realm"])(
		"never joins a same-name character with a different %s",
		async (field) => {
			const wrong = published.characters[1];
			if (!wrong) throw Error("Synthetic character missing");
			if (field === "region") wrong.region = "eu";
			else wrong.realmSlug = "other-realm";
			await restoreSnapshot();
			expect(restored()?.characters.map((c) => c.name)).toEqual(["Unchanged"]);
		},
	);
	it.each(["generatedAt", "characters", "region", "specs"])(
		"rejects malformed or foreign snapshot %s",
		async (field) => {
			if (field === "generatedAt") published.generatedAt = "invalid";
			if (field === "characters")
				(published as unknown as { characters: unknown }).characters = null;
			if (field === "region") published.region = "eu";
			if (field === "specs") {
				const c = published.characters[0];
				if (c) (c as unknown as { specs: unknown }).specs = null;
			}
			await restoreSnapshot();
			expect(memory.has("cache/last-snapshot.json")).toBe(false);
		},
	);
	it("keeps a newer cached snapshot", async () => {
		const cached = { ...published, generatedAt: "2026-10-23T00:00:00.000Z" };
		memory.set("cache/last-snapshot.json", JSON.stringify(cached));
		await restoreSnapshot();
		expect(restored()).toEqual(cached);
	});
});
