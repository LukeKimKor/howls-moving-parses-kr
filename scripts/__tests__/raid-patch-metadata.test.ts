import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../../src/types/snapshot.js";
import type { RaidQuery } from "../raid-performance.js";
import { fetchRaidPatchMetadata, mergeRaidPatchMetadata } from "../raid-patch-metadata.js";
import { WclRuntime } from "../wcl-runtime.js";

// Synthetic API/schema fixtures. Patch names below are probes, not verified live mappings.
const schemaFixture = () => ({
	zoneType: {
		name: "Zone",
		fields: [
			{
				name: "partitions",
				type: {
					kind: "NON_NULL",
					name: null,
					ofType: {
						kind: "LIST",
						name: null,
						ofType: { kind: "NON_NULL", name: null, ofType: { kind: "OBJECT", name: "Partition" } },
					},
				},
			},
		],
	},
	partitionType: {
		name: "Partition",
		fields: [
			{ name: "id", type: { kind: "SCALAR", name: "Int" } },
			{ name: "name", type: { kind: "SCALAR", name: "String" } },
		],
	},
	characterType: {
		name: "Character",
		fields: [
			{
				name: "zoneRankings",
				args: [
					{
						name: "partition",
						description: "Synthetic official argument description: -1 probe",
						defaultValue: null,
					},
					{
						name: "timeframe",
						description: "Synthetic timeframe scope",
						defaultValue: "Historical",
					},
				],
			},
		],
	},
});
const zoneFixture = () => ({
	worldData: {
		zone: {
			id: 53,
			name: "Synthetic Raid",
			partitions: [
				{ id: 1, name: "12.1" },
				{ id: 2, name: "12.1.5" },
			],
		},
	},
});

describe("official raid patch metadata (synthetic, no API)", () => {
	it("uses one schema and one metadata query, preserving exact argument descriptions", async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce(schemaFixture())
			.mockResolvedValueOnce(zoneFixture());
		const guard = vi.fn();
		const result = await fetchRaidPatchMetadata(query as RaidQuery, 53, guard);
		expect(query).toHaveBeenCalledTimes(2);
		expect(query.mock.calls[1]?.[1]).toEqual({ zoneId: 53 });
		expect(query.mock.calls.map((call) => call[0]).join(" ")).not.toMatch(
			/characterData|encounterRankings|zoneRankings\(/,
		);
		expect(result.partitions).toEqual(zoneFixture().worldData.zone.partitions);
		expect(result.schema.partitionArgument).toEqual(
			schemaFixture().characterType.fields[0]?.args[0] && {
				description: "Synthetic official argument description: -1 probe",
				defaultValue: null,
			},
		);
		expect(result.queries).toEqual({ schema: 1, metadata: 1 });
		expect(guard).toHaveBeenCalledTimes(1);
	});
	it("discovers a different partition object type only through the returned schema", async () => {
		const schema = schemaFixture();
		const ref = schema.zoneType.fields[0]?.type.ofType.ofType.ofType;
		if (!ref) throw new Error("Missing fixture type");
		ref.name = "ZonePartition";
		const query = vi
			.fn()
			.mockResolvedValueOnce(schema)
			.mockResolvedValueOnce({ partitionType: { ...schema.partitionType, name: "ZonePartition" } })
			.mockResolvedValueOnce(zoneFixture());
		const result = await fetchRaidPatchMetadata(query as RaidQuery, 53, vi.fn());
		expect(query.mock.calls[1]?.[1]).toEqual({ name: "ZonePartition" });
		expect(result.queries).toEqual({ schema: 2, metadata: 1 });
	});
	it("does not request patch data when required fields are not in the schema", async () => {
		const schema = schemaFixture();
		schema.partitionType.fields = schema.partitionType.fields.filter(
			(field) => field.name !== "name",
		);
		const query = vi.fn().mockResolvedValue(schema);
		await expect(fetchRaidPatchMetadata(query as RaidQuery, 53, vi.fn())).rejects.toThrow(
			"id/name",
		);
		expect(query).toHaveBeenCalledTimes(1);
	});
	it("stops before metadata if a live point budget is unavailable or reserved", async () => {
		for (const available of [false, true]) {
			const runtime = new WclRuntime(() => 1000);
			runtime.activate();
			if (available)
				runtime.observeBudget({ limitPerHour: 100, pointsSpentThisHour: 81, pointsResetIn: 300 });
			const query = vi.fn().mockResolvedValue(schemaFixture());
			const guard = () => {
				if (!runtime.currentBudget()) throw new Error("Budget unavailable");
				runtime.beforeQuery();
			};
			await expect(fetchRaidPatchMetadata(query as RaidQuery, 53, guard)).rejects.toThrow(
				/Budget|예산/,
			);
			expect(query).toHaveBeenCalledTimes(1);
		}
	});
	it("rejects wrong zones, duplicate IDs and empty patch names instead of fabricating names", async () => {
		for (const zone of [
			{ ...zoneFixture().worldData.zone, id: 99 },
			{
				...zoneFixture().worldData.zone,
				partitions: [
					{ id: 1, name: "12.1" },
					{ id: 1, name: "12.1.5" },
				],
			},
			{ ...zoneFixture().worldData.zone, partitions: [{ id: 1, name: "" }] },
		]) {
			const query = vi
				.fn()
				.mockResolvedValueOnce(schemaFixture())
				.mockResolvedValueOnce({ worldData: { zone } });
			await expect(fetchRaidPatchMetadata(query as RaidQuery, 53, vi.fn())).rejects.toThrow(
				/identity|invalid/,
			);
		}
	});
	it("leaves partial GraphQL metadata responses unverified", async () => {
		const query = vi.fn(async (_q, _v, onErrors) => {
			onErrors?.([{ message: "Synthetic partial error" }]);
			return schemaFixture();
		});
		await expect(fetchRaidPatchMetadata(query as RaidQuery, 53, vi.fn())).rejects.toThrow(
			"contained errors",
		);
	});
	it("only merges names and build hash while retaining all original logs and timestamps", async () => {
		const metadata = await fetchRaidPatchMetadata(
			vi
				.fn()
				.mockResolvedValueOnce(schemaFixture())
				.mockResolvedValueOnce(zoneFixture()) as RaidQuery,
			53,
			vi.fn(),
		);
		const previous: Snapshot = {
			generatedAt: "2026-10-17T00:00:00Z",
			buildHash: "before",
			characters: [],
			specs: {},
			raid: { id: 53, name: "Previous raid", encounters: [] },
			warnings: ["Existing collection warning"],
		};
		const next = mergeRaidPatchMetadata(previous, metadata, "after");
		expect(next.characters).toBe(previous.characters);
		expect(next.specs).toBe(previous.specs);
		expect(next.warnings).toBe(previous.warnings);
		expect(next.generatedAt).toBe(previous.generatedAt);
		expect(previous.raidPatchMetadata).toBeUndefined();
		expect(next.raidPatchMetadata).toBe(metadata);
		expect(next.buildHash).toBe("after");
		expect(() =>
			mergeRaidPatchMetadata(
				{ ...previous, raid: { id: 99, name: "Other", encounters: [] } },
				metadata,
				"after",
			),
		).toThrow("does not match");
	});
});
