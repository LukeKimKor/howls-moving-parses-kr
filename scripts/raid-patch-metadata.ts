import type { RaidPatchMetadata, Snapshot } from "../src/types/snapshot.js";
import type { RaidQuery } from "./raid-performance.js";

interface TypeRef {
	kind: string;
	name: string | null;
	ofType?: TypeRef | null;
}
interface Argument {
	name: string;
	description: string | null;
	defaultValue: string | null;
}
interface Field {
	name: string;
	description?: string | null;
	type: TypeRef;
	args?: Argument[];
}
interface SchemaType {
	name: string;
	fields: Field[];
}

const typeSelection = "kind name ofType { kind name ofType { kind name ofType { kind name } } }";
export const PATCH_SCHEMA_QUERY = `query RaidPatchSchema {
 zoneType: __type(name: "Zone") { name fields { name description type { ${typeSelection} } } }
 partitionType: __type(name: "Partition") { name fields { name type { ${typeSelection} } } }
 characterType: __type(name: "Character") { name fields { name args { name description defaultValue } } }
}`;

function namedType(type: TypeRef | undefined): string | undefined {
	return type?.name ?? (type?.ofType ? namedType(type.ofType) : undefined);
}

/** Read the live schema first. No patch versions or special IDs are inferred. */
export async function fetchRaidPatchMetadata(
	query: RaidQuery,
	zoneId: number,
	beforeMetadata: () => void,
): Promise<RaidPatchMetadata> {
	if (!Number.isInteger(zoneId) || zoneId <= 0) throw new Error("Invalid raid metadata zone ID");
	const rejectPartial = () => {
		throw new Error("WCL patch metadata GraphQL response contained errors");
	};
	const schema = await query<{
		zoneType: SchemaType | null;
		partitionType: SchemaType | null;
		characterType: SchemaType | null;
	}>(PATCH_SCHEMA_QUERY, undefined, rejectPartial);
	const partitionsField = schema.zoneType?.fields.find((field) => field.name === "partitions");
	const partitionTypeName = namedType(partitionsField?.type);
	if (!partitionsField || !partitionTypeName)
		throw new Error("WCL Zone.partitions schema unavailable");
	let partitionType = schema.partitionType;
	let schemaQueries = 1;
	if (partitionType?.name !== partitionTypeName) {
		// Adapt only to the exact object type returned by the official schema.
		beforeMetadata();
		const result = await query<{ partitionType: SchemaType | null }>(
			`query RaidPartitionFields($name: String!) { partitionType: __type(name: $name) { name fields { name type { ${typeSelection} } } } }`,
			{ name: partitionTypeName },
			rejectPartial,
		);
		partitionType = result.partitionType;
		schemaQueries++;
	}
	const id = partitionType?.fields.find((field) => field.name === "id");
	const name = partitionType?.fields.find((field) => field.name === "name");
	if (
		partitionType?.name !== partitionTypeName ||
		!["Int", "ID"].includes(namedType(id?.type) ?? "") ||
		namedType(name?.type) !== "String"
	)
		throw new Error("WCL partition id/name fields are not verified");
	const ranking = schema.characterType?.fields.find((field) => field.name === "zoneRankings");
	const partitionArgument = ranking?.args?.find((argument) => argument.name === "partition");
	if (!partitionArgument)
		throw new Error("WCL Character.zoneRankings partition argument unavailable");
	beforeMetadata();
	const data = await query<{
		worldData: {
			zone: { id: number; name: string; partitions: Array<{ id: number; name: string }> } | null;
		};
	}>(
		"query RaidPatchNames($zoneId: Int!) { worldData { zone(id: $zoneId) { id name partitions { id name } } } }",
		{ zoneId },
		rejectPartial,
	);
	const zone = data.worldData?.zone;
	if (zone?.id !== zoneId || !Array.isArray(zone.partitions) || !zone.partitions.length)
		throw new Error("WCL raid patch metadata identity/list missing");
	const ids = new Set<number>();
	for (const patch of zone.partitions) {
		if (
			!Number.isInteger(patch.id) ||
			ids.has(patch.id) ||
			typeof patch.name !== "string" ||
			!patch.name.trim()
		)
			throw new Error("WCL raid patch metadata contains an invalid or duplicate entry");
		ids.add(patch.id);
	}
	return {
		zoneId,
		zoneName: zone.name,
		checkedAt: new Date().toISOString(),
		partitions: zone.partitions.map((patch) => ({ id: patch.id, name: patch.name })),
		source: "WCL API worldData.zone.partitions",
		schema: {
			partitionType: partitionTypeName,
			partitionArgument: {
				description: partitionArgument.description,
				defaultValue: partitionArgument.defaultValue,
			},
			timeframeArgument: ranking?.args?.find((argument) => argument.name === "timeframe"),
		},
		queries: { schema: schemaQueries, metadata: 1 },
	};
}

export function mergeRaidPatchMetadata(
	snapshot: Snapshot,
	metadata: RaidPatchMetadata,
	buildHash: string,
): Snapshot {
	if (snapshot.raid?.id !== metadata.zoneId)
		throw new Error("Patch metadata does not match cached raid");
	// Log timestamps, character records, regional spec meta and collection notices stay intact.
	return { ...snapshot, raidPatchMetadata: metadata, buildHash };
}
