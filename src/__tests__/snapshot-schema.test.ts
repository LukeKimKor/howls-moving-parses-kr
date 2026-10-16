import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CharactersConfig } from "../../scripts/config-validation.js";
import type { CollectionStatus, Snapshot } from "../types/snapshot.js";

const snapshotPath = join(process.cwd(), "src/data/snapshot.json");
const buildHashPath = join(process.cwd(), "dist/build-hash.json");

let snapshot: Record<string, unknown>;

describe("snapshot.json schema validation", () => {
	it("validates optional per-source collection outcomes and stale timestamps", () => {
		const data = snapshot as unknown as Snapshot;
		const statuses: Array<CollectionStatus | undefined> = [
			...data.characters.flatMap((c) =>
				Object.values(c.specs).flatMap((s) => Object.values(s.collection ?? {})),
			),
			...Object.values(data.specs).flatMap((s) => [s.mythicPlus.collection, s.raid.collection]),
		];
		for (const status of statuses) {
			if (!status) continue;
			expect(["ok", "empty", "partial", "failed", "skipped"]).toContain(status.state);
			expect(status.failedRequests).toBeGreaterThanOrEqual(0);
			expect(status.attemptedRequests).toBeGreaterThanOrEqual(status.failedRequests);
			if (status.state === "ok" || status.state === "empty") expect(status.issues).toHaveLength(0);
			if (status.state === "failed" || status.state === "partial")
				expect(status.issues.length).toBeGreaterThan(0);
			for (const at of [status.retainedAt, status.lastSuccessAt])
				if (at) expect(new Date(at).toISOString()).toBe(at);
		}
	});
	it("counts tracked results separately from displayable retained data", () => {
		const summary = (snapshot as unknown as Snapshot).collectionSummary;
		if (!summary) return; // Existing public-only snapshots predate collection status.
		for (const counts of [summary.characters, summary.metaSpecs])
			expect(counts.complete + counts.partial + counts.failed + counts.skipped).toBe(
				counts.tracked,
			);
		expect(summary.metaSpecs.withData).toBeLessThanOrEqual(summary.metaSpecs.tracked);
	});
	it("matches configured character identities and all active specs", () => {
		const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
		const data = snapshot as unknown as Snapshot;
		expect(data.characters.map((c) => c.name)).toEqual(config.characters.map((c) => c.name));
		for (const char of config.characters) {
			const found = data.characters.find((c) => c.name === char.name);
			expect(found?.region).toBe(char.region);
			expect(
				Object.values(found?.specs ?? {})
					.map((s) => [s.specName, s.role])
					.sort(),
			).toEqual(
				char.specs
					.filter((s) => s.role !== "inactive")
					.map((s) => [s.spec, s.role])
					.sort(),
			);
		}
	});
	it("never mixes cutoff or meta regions with character regions", () => {
		const data = snapshot as unknown as Snapshot;
		for (const char of data.characters) {
			if (data.region) expect(char.region).toBe(data.region);
			for (const spec of Object.values(char.specs)) {
				if (spec.mythicPlus) expect(spec.mythicPlus.titleCutoff.region).toBe(char.region);
			}
		}
		for (const meta of Object.values(data.specs))
			if (meta.region) expect(meta.region).toBe(data.region);
	});
	it("public-only snapshots contain no invented WCL logs or meta", () => {
		const data = snapshot as unknown as Snapshot;
		if (data.dataMode !== "raiderio-only") return;
		expect(data.warnings?.length).toBeGreaterThan(0);
		for (const char of data.characters)
			for (const spec of Object.values(char.specs)) expect(spec.logs).toBeNull();
		for (const meta of Object.values(data.specs)) {
			expect(meta.mythicPlus.leaderboard).toHaveLength(0);
			expect(meta.raid.leaderboard).toHaveLength(0);
			expect(meta.mythicPlus.metaGear.trinkets).toHaveLength(0);
			expect(meta.raid.metaGear.trinkets).toHaveLength(0);
		}
	});
	beforeAll(() => {
		if (!existsSync(snapshotPath)) {
			throw new Error("snapshot.json does not exist — run pnpm tsx scripts/fetch-data.ts first");
		}
		const raw = readFileSync(snapshotPath, "utf-8");
		snapshot = JSON.parse(raw) as Record<string, unknown>;
	});

	it("exists and is valid JSON", () => {
		expect(snapshot).toBeTruthy();
		expect(typeof snapshot).toBe("object");
	});

	it("has a valid ISO 8601 generatedAt timestamp", () => {
		const { generatedAt } = snapshot as { generatedAt: string };
		expect(typeof generatedAt).toBe("string");
		const parsed = new Date(generatedAt);
		expect(parsed.toISOString()).toBe(generatedAt);
	});

	it("has a non-empty buildHash", () => {
		const { buildHash } = snapshot as { buildHash: string };
		expect(typeof buildHash).toBe("string");
		expect(buildHash.length).toBeGreaterThan(0);
	});

	it("buildHash matches dist/build-hash.json if it exists", () => {
		if (!existsSync(buildHashPath)) return;
		const { hash } = JSON.parse(readFileSync(buildHashPath, "utf-8")) as { hash: string };
		const { buildHash } = snapshot as { buildHash: string };
		expect(buildHash).toBe(hash);
	});

	it("characters array is non-empty", () => {
		const { characters } = snapshot as { characters: unknown[] };
		expect(Array.isArray(characters)).toBe(true);
		expect(characters.length).toBeGreaterThan(0);
	});

	it("each character has required identity fields", () => {
		const { characters } = snapshot as {
			characters: Array<{
				name: string;
				realm: string;
				region: string;
				class: string;
				mainSpecSlug: string;
			}>;
		};
		for (const char of characters) {
			expect(char.name).toBeTruthy();
			expect(char.realm).toBeTruthy();
			expect(char.region).toBeTruthy();
			expect(char.class).toBeTruthy();
			expect(char.mainSpecSlug).toBeTruthy();
		}
	});

	it("each character specOrder starts with mainSpecSlug and has no duplicates", () => {
		const { characters } = snapshot as {
			characters: Array<{ mainSpecSlug: string; specOrder: string[] }>;
		};
		for (const char of characters) {
			expect(char.specOrder[0]).toBe(char.mainSpecSlug);
			const unique = new Set(char.specOrder);
			expect(unique.size).toBe(char.specOrder.length);
		}
	});

	it("each character specs map keys match specOrder exactly", () => {
		const { characters } = snapshot as {
			characters: Array<{ specOrder: string[]; specs: Record<string, unknown> }>;
		};
		for (const char of characters) {
			const specKeys = Object.keys(char.specs).sort();
			const orderKeys = [...char.specOrder].sort();
			expect(specKeys).toEqual(orderKeys);
		}
	});

	it("each character has at least one spec entry", () => {
		const { characters } = snapshot as {
			characters: Array<{ specs: Record<string, unknown> }>;
		};
		for (const char of characters) {
			expect(Object.keys(char.specs).length).toBeGreaterThan(0);
		}
	});

	it("no character has inactive specs in the snapshot", () => {
		const { characters } = snapshot as {
			characters: Array<{ specs: Record<string, { role: string }> }>;
		};
		for (const char of characters) {
			for (const spec of Object.values(char.specs)) {
				expect(spec.role).not.toBe("inactive");
			}
		}
	});

	it("each character spec role is main, offspec, or explicitly pending tracked", () => {
		const { characters } = snapshot as {
			characters: Array<{ specs: Record<string, { role: string }> }>;
		};
		for (const char of characters) {
			for (const spec of Object.values(char.specs)) {
				expect(["main", "offspec", "tracked"]).toContain(spec.role);
			}
		}
	});

	it("confirmed characters have exactly one main and pending characters have none", () => {
		const { characters } = snapshot as {
			characters: Array<{ mainSpecPending?: boolean; specs: Record<string, { role: string }> }>;
		};
		for (const char of characters) {
			const mainCount = Object.values(char.specs).filter((s) => s.role === "main").length;
			expect(mainCount).toBe(char.mainSpecPending ? 0 : 1);
		}
	});

	it("all non-null M+ scores are non-negative numbers", () => {
		const { characters } = snapshot as {
			characters: Array<{
				specs: Record<string, { mythicPlus: { score: number } | null }>;
			}>;
		};
		for (const char of characters) {
			for (const spec of Object.values(char.specs)) {
				if (spec.mythicPlus !== null) {
					expect(spec.mythicPlus.score).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});

	it("top-level specs map has at least 1 key (only tracked specs included)", () => {
		const { specs } = snapshot as { specs: Record<string, unknown> };
		expect(Object.keys(specs).length).toBeGreaterThan(0);
	});

	it("every spec slug in top-level specs has specName and className", () => {
		const { specs } = snapshot as {
			specs: Record<string, { specName: string; className: string }>;
		};
		for (const spec of Object.values(specs)) {
			expect(spec.specName).toBeTruthy();
			expect(spec.className).toBeTruthy();
		}
	});

	it("all spec metaBuilds are empty arrays (deferred in v1)", () => {
		const { specs } = snapshot as {
			specs: Record<
				string,
				{ mythicPlus: { metaBuilds: unknown[] }; raid: { metaBuilds: unknown[] } }
			>;
		};
		for (const spec of Object.values(specs)) {
			expect(spec.mythicPlus.metaBuilds).toHaveLength(0);
			expect(spec.raid.metaBuilds).toHaveLength(0);
		}
	});

	it("weaponEnchants and ringEnchants are always empty arrays (not yet collected)", () => {
		const { specs } = snapshot as {
			specs: Record<
				string,
				{
					mythicPlus: { metaGear: { weaponEnchants: unknown[]; ringEnchants: unknown[] } };
					raid: { metaGear: { weaponEnchants: unknown[]; ringEnchants: unknown[] } };
				}
			>;
		};
		for (const spec of Object.values(specs)) {
			expect(spec.mythicPlus.metaGear.weaponEnchants).toHaveLength(0);
			expect(spec.mythicPlus.metaGear.ringEnchants).toHaveLength(0);
			expect(spec.raid.metaGear.weaponEnchants).toHaveLength(0);
			expect(spec.raid.metaGear.ringEnchants).toHaveLength(0);
		}
	});
});
