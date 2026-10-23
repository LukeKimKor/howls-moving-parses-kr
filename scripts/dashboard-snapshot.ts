import type { CharacterData, MythicPlusData, Snapshot } from "../src/types/snapshot.js";

function dashboardMplus(data: MythicPlusData | null) {
	if (!data) return null;
	const { recentRuns: _recent, ...current } = data;
	return current;
}

/** Drop retired detail-page fields even when a failed refresh retains old data. */
export function dashboardCharacter(character: CharacterData): CharacterData {
	return {
		...character,
		specs: Object.fromEntries(
			Object.entries(character.specs).map(([slug, spec]) => {
				const { talents: _talents, ...current } = spec;
				return [
					slug,
					{
						...current,
						mythicPlus: dashboardMplus(spec.mythicPlus),
						logs: spec.logs
							? {
									raidParses: spec.logs.raidParses.map(({ date: _date, ...parse }) => parse),
								}
							: null,
						collection: spec.collection
							? {
									raiderio: spec.collection.raiderio,
									raid: spec.collection.raid,
								}
							: undefined,
					},
				];
			}),
		),
	};
}

/** Read legacy snapshots, but never publish their retired payload again. */
export function dashboardSnapshot(snapshot: Snapshot): Snapshot {
	const { specs: _specs, wclMetadataAt: _metadataAt, ...current } = snapshot;
	const summary = snapshot.collectionSummary
		? {
				characters: snapshot.collectionSummary.characters,
				raidTables: snapshot.collectionSummary.raidTables,
			}
		: undefined;
	return {
		...current,
		characters: snapshot.characters.map(dashboardCharacter),
		collectionSummary: snapshot.collectionSummary ? summary : undefined,
	};
}
