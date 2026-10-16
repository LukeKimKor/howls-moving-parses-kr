import { describe, expect, it } from "vitest";
import { collect, countCollections, recordRequest, retain } from "../collection-status.js";
import { extractPublishedSnapshot } from "../restore-snapshot.js";

describe("collection outcomes and retained data", () => {
	it("distinguishes a successful empty response from a failed lookup", async () => {
		const empty = await collect(
			async () => {
				recordRequest();
				return [];
			},
			(d) => d.length > 0,
			[],
		);
		const failed = await collect(
			async () => {
				recordRequest(true, "WCL HTTP 429");
				return [];
			},
			(d) => d.length > 0,
			[],
		);
		expect(empty.status.state).toBe("empty");
		expect(failed.status.state).toBe("failed");
		expect(failed.status.failedRequests).toBe(1);
	});
	it("keeps concurrent scopes independent and marks partially successful empty samples", async () => {
		const [first, second] = await Promise.all([
			collect(
				async () => {
					await Promise.resolve();
					recordRequest(true, "429");
					recordRequest();
					return [];
				},
				(d) => d.length > 0,
				[],
			),
			collect(
				async () => {
					await Promise.resolve();
					recordRequest();
					return [1];
				},
				(d) => d.length > 0,
				[],
			),
		]);
		expect(first.status).toMatchObject({
			state: "partial",
			attemptedRequests: 2,
			failedRequests: 1,
		});
		expect(second.status).toMatchObject({ state: "ok", attemptedRequests: 1, failedRequests: 0 });
	});
	it("retains previous good data only for failures and preserves its original timestamp", async () => {
		const failed = await collect(
			async () => {
				recordRequest(true, "429");
				return [];
			},
			(d) => d.length > 0,
			[] as number[],
		);
		const previousAt = "2026-10-16T22:01:39.083Z";
		expect(retain([], failed.status, [10], undefined, previousAt, (d) => d.length > 0)).toEqual([
			10,
		]);
		expect(failed.status.retainedAt).toBe(previousAt);
		const empty = await collect(
			async () => [],
			(d) => d.length > 0,
			[] as number[],
		);
		expect(retain([], empty.status, [10], undefined, previousAt, (d) => d.length > 0)).toEqual([]);
	});
	it("counts 14 tracked specs separately from 12 complete, one partial and one failed", async () => {
		const ok = (
			await collect(
				async () => [1],
				(d) => d.length > 0,
				[],
			)
		).status;
		const bad = (
			await collect(
				async () => {
					recordRequest(true, "429");
					return [];
				},
				(d) => d.length > 0,
				[],
			)
		).status;
		const counts = countCollections([
			...Array.from({ length: 12 }, () => [ok, ok]),
			[ok, bad],
			[bad, bad],
		]);
		expect(counts).toEqual({ tracked: 14, complete: 12, partial: 1, failed: 1, skipped: 0 });
	});
	it("reads a literal old public bundle without executing JavaScript", () => {
		const result = extractPublishedSnapshot(
			'const n="kr", c=JSON.parse(`[]`), s=JSON.parse(`{}`), x={region:n,generatedAt:"2026-10-16T00:00:00Z",characters:c,specs:s};',
		);
		expect(result.region).toBe("kr");
		expect(result.characters).toEqual([]);
		expect(() =>
			extractPublishedSnapshot('const x={generatedAt:"x",characters:stealSecrets(),specs:{}}'),
		).toThrow("literal JSON");
	});
});
