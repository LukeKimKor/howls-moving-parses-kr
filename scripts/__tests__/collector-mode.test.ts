import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../../src/types/snapshot.js";
import { characterShell, main } from "../fetch-data.js";
import { wclTransport } from "../wcl-transport.js";

const memory = vi.hoisted(() => new Map<string, string>());
const config = vi.hoisted(() => ({
	characters: [
		{
			name: "Fixture",
			realm: "Azshara",
			realmSlug: "azshara",
			region: "kr" as const,
			class: "Mage",
			default: true,
			specs: [{ spec: "Arcane", role: "main" as const }],
		},
	],
}));
vi.mock("node:fs", () => {
	const mocked = {
		readFileSync: (path: unknown) => {
			if (String(path).endsWith("characters.config.json")) return JSON.stringify(config);
			if (String(path).endsWith("refresh.yml")) return "cron: '0 4,10,16,22 * * *'";
			const value = memory.get(String(path));
			if (value === undefined) throw Error("Synthetic file missing");
			return value;
		},
		mkdirSync: vi.fn(),
		writeFileSync: (path: string, value: string) => memory.set(path, value),
	};
	return { ...mocked, default: mocked };
});
const oldAt = "2026-10-01T00:00:00.000Z";
function seed(mode: Snapshot["dataMode"]): Snapshot {
	const snapshot: Snapshot = {
		generatedAt: oldAt,
		buildHash: "fixture",
		dataMode: mode,
		region: "kr",
		characters: config.characters.map((c) => characterShell(c)),
		raid: { id: 53, name: "Raid", encounters: [{ id: 1, name: "Boss" }] },
		mythicPlusZone: { id: 55, name: "Mythic+", encounters: [] },
		wclZones: { raid: 53, mythicPlus: 55 },
		raidMetricSchema: {
			state: "verified",
			supported: ["dps", "bossdps", "hps"],
			checkedAt: new Date().toISOString(),
		},
		raidPatchMetadata: {
			zoneId: 53,
			checkedAt: new Date().toISOString(),
		} as Snapshot["raidPatchMetadata"],
	};
	memory.set("cache/last-snapshot.json", JSON.stringify(snapshot));
	return snapshot;
}
function output(): Snapshot {
	return JSON.parse(memory.get("cache/last-snapshot.json") ?? "null");
}
async function run(...flags: string[]) {
	vi.stubGlobal("process", { ...process, argv: ["node", "fixture", ...flags] });
	await main();
	return output();
}
beforeEach(() => {
	memory.clear();
	vi.stubEnv("WCL_CLIENT_ID", "fixture");
	vi.stubEnv("WCL_CLIENT_SECRET", "fixture");
	vi.stubEnv("GITHUB_STEP_SUMMARY", "");
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						mythic_plus_scores_by_season: [{ season: "fixture", scores: { all: 100 } }],
						mythic_plus_best_runs: [],
					}),
				),
		),
	);
	vi.spyOn(wclTransport, "request").mockImplementation(async (url) => {
		if (String(url).includes("oauth"))
			return new Response(JSON.stringify({ access_token: "fixture" }));
		const raw = {
			rankings: [{ encounter: { id: 1, name: "Boss" }, totalKills: 1, rankPercent: 90 }],
		};
		return new Response(
			JSON.stringify({
				data: {
					characterData: { character: { dps4: raw, dps5: raw, bossdps4: raw, bossdps5: raw } },
				},
			}),
		);
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});
describe("collector mode transitions with in-memory files and blocked provider I/O", () => {
	it("promotes public-only to full after WCL success and preserves full in cache", async () => {
		seed("raiderio-only");
		expect((await run("--raiderio-only")).dataMode).toBe("raiderio-only");
		const full = await run();
		expect(full.characters[0]?.specs["arcane-mage"]?.logs).toBeTruthy();
		expect(full.dataMode).toBe("full");
		vi.mocked(fetch).mockClear();
		vi.mocked(wclTransport.request).mockClear();
		const cached = await run("--cache-only");
		expect(cached.dataMode).toBe("full");
		expect(cached.generatedAt).toBe(full.generatedAt);
		expect(fetch).not.toHaveBeenCalled();
		expect(wclTransport.request).not.toHaveBeenCalled();
	});
	it.each([
		{ mode: "full" as const, phase: "OAuth" },
		{ mode: "raiderio-only" as const, phase: "OAuth" },
		{ mode: "full" as const, phase: "bootstrap" },
		{ mode: "raiderio-only" as const, phase: "bootstrap" },
	])(
		"keeps $mode after $phase failure without claiming a successful transition",
		async ({ mode, phase }) => {
			seed(mode);
			if (mode === "full") expect((await run()).dataMode).toBe("full");
			// Expire raid TTL and then fail bootstrap authentication.
			const old = output();
			old.dataMode = mode;
			for (const spec of Object.values(old.characters[0]?.specs ?? {}))
				for (const metric of Object.values(spec.raidPerformance ?? {}))
					for (const section of Object.values(metric)) section.collection.lastSuccessAt = oldAt;
			memory.set("cache/last-snapshot.json", JSON.stringify(old));
			vi.mocked(wclTransport.request).mockImplementation(async (url) => {
				if (phase === "bootstrap" && String(url).includes("oauth"))
					return new Response(JSON.stringify({ access_token: "fixture" }));
				throw Error("Synthetic initialization failure");
			});
			if (phase === "bootstrap") {
				const pending = output();
				pending.raidPatchMetadata = undefined;
				memory.set("cache/last-snapshot.json", JSON.stringify(pending));
			}
			const failed = await run();
			expect(failed.dataMode).toBe(mode);
			if (mode === "raiderio-only") {
				expect(failed.warnings?.length).toBeGreaterThan(0);
				expect(failed.characters[0]?.specs["arcane-mage"]?.logs).toBeNull();
			}
			if (mode === "full") {
				const section = failed.characters[0]?.specs["arcane-mage"]?.raidPerformance?.dps?.Heroic;
				expect(section?.rows[0]?.bestPercent).toBe(90);
				expect(section?.collection.retainedAt).toBe(oldAt);
				expect(section?.collection.state).toBe("skipped");
			}
		},
	);
});
