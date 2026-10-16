import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_SPECS } from "../../src/data/specs.js";
import { countCollections } from "../collection-status.js";
import { fetchSpecMeta } from "../fetch-data.js";
import { wclTransport } from "../wcl-transport.js";

afterEach(() => vi.restoreAllMocks());
const dungeon = [{ id: 1, name: "Synthetic dungeon" }];
const raid = [{ id: 2, name: "Synthetic raid" }];
const empty = { data: { worldData: { encounter: { characterRankings: { rankings: [] } } } } };
const spec = (slug: string) => {
	const result = ALL_SPECS.find((s) => s.specSlug === slug);
	if (!result) throw new Error("Test spec missing");
	return result;
};

describe("real collector failure propagation (synthetic responses, no API calls)", () => {
	it("does not turn all Arms encounter failures into successful empty metadata", async () => {
		const request = vi.spyOn(wclTransport, "request").mockRejectedValue(new Error("WCL HTTP 429"));
		const result = await fetchSpecMeta(
			spec("arms-warrior"),
			"synthetic-token",
			dungeon,
			raid,
			"kr",
		);
		expect(request).toHaveBeenCalledTimes(2);
		expect(result.mythicPlus.collection).toMatchObject({ state: "failed", failedRequests: 1 });
		expect(result.raid.collection).toMatchObject({ state: "failed", failedRequests: 1 });
		expect(
			countCollections([[result.mythicPlus.collection, result.raid.collection]]),
		).toMatchObject({ failed: 1, complete: 0 });
	});
	it("shows Demonology raid failure separately from a successfully empty M+ response", async () => {
		vi.spyOn(wclTransport, "request").mockImplementation(async (_url, init) => {
			const { variables } = JSON.parse(String(init?.body));
			if (variables.encounterId === 2) throw new Error("WCL HTTP 429");
			return new Response(JSON.stringify(empty));
		});
		const result = await fetchSpecMeta(
			spec("demonology-warlock"),
			"synthetic-token",
			dungeon,
			raid,
			"kr",
		);
		expect(result.mythicPlus.collection?.state).toBe("empty");
		expect(result.raid.collection?.state).toBe("failed");
		expect(
			countCollections([[result.mythicPlus.collection, result.raid.collection]]),
		).toMatchObject({ partial: 1, complete: 0 });
	});
	it("retains previous raid trinkets on failed refresh, but marks their age and failure", async () => {
		vi.spyOn(wclTransport, "request").mockResolvedValue(new Response(JSON.stringify(empty)));
		const previous = await fetchSpecMeta(
			spec("demonology-warlock"),
			"synthetic-token",
			[],
			[],
			"kr",
		);
		previous.raid.metaGear.trinkets = [
			{ name: "Previously observed trinket", source: "—", usagePercent: 50 },
		];
		if (previous.raid.collection)
			previous.raid.collection.lastSuccessAt = "2026-10-16T22:01:39.083Z";
		vi.mocked(wclTransport.request).mockImplementation(async () => {
			throw new Error("WCL HTTP 429");
		});
		const result = await fetchSpecMeta(
			spec("demonology-warlock"),
			"synthetic-token",
			dungeon,
			raid,
			"kr",
			previous,
			"2026-10-16T22:01:39.083Z",
		);
		expect(result.raid.metaGear.trinkets).toEqual(previous.raid.metaGear.trinkets);
		expect(result.raid.collection).toMatchObject({
			state: "failed",
			retainedAt: "2026-10-16T22:01:39.083Z",
		});
	});
	it("marks GraphQL partial errors even when HTTP and some data succeed", async () => {
		vi.spyOn(wclTransport, "request").mockImplementation(
			async () =>
				new Response(
					JSON.stringify({ ...empty, errors: [{ message: "Synthetic partial error" }] }),
				),
		);
		const result = await fetchSpecMeta(
			spec("arms-warrior"),
			"synthetic-token",
			dungeon,
			raid,
			"kr",
		);
		expect(result.mythicPlus.collection).toMatchObject({
			state: "failed",
			failedRequests: 1,
			issues: expect.arrayContaining(["WCL GraphQL 부분 응답 오류"]),
		});
	});
});
