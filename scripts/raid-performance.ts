import type {
	CharacterSpecData,
	CollectionStatus,
	RaidDifficulty,
	RaidDifficultyData,
	RaidMetric,
	RaidPerformanceRow,
	Snapshot,
} from "../src/types/snapshot.js";
import { retain } from "./collection-status.js";

export type GraphqlError = { message: string; path?: Array<string | number> };
export type RaidQuery = <T>(
	query: string,
	variables?: Record<string, unknown>,
	onErrors?: (errors: GraphqlError[]) => void,
) => Promise<T>;

export interface RaidZoneRaw {
	bestPerformanceAverage?: number | null;
	medianPerformanceAverage?: number | null;
	partition?: number;
	allStars?: Array<{
		spec: string;
		partition?: number;
		points: number | null;
		rank: number | string | null;
	}>;
	rankings?: Array<{
		encounter: { id: number; name: string };
		rankPercent?: number | null;
		medianPercent?: number | null;
		bestAmount?: number | null;
		totalKills?: number;
		fastestKill?: number;
		spec?: string | null;
		bestSpec?: string;
		allStars?: { points?: number; rank?: number | string } | null;
	}>;
}

function number(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const result = Number(value);
	return Number.isFinite(result) ? result : null;
}

export function mapRaidDifficulty(
	raw: RaidZoneRaw | null,
	metric: RaidMetric,
	difficulty: RaidDifficulty,
	encounters: Array<{ id: number; name: string }>,
	collection: CollectionStatus,
): RaidDifficultyData {
	const rows: RaidPerformanceRow[] = encounters.map((encounter) => {
		const row = raw?.rankings?.find((r) => r.encounter.id === encounter.id);
		const kills = number(row?.totalKills);
		const bestPercent = number(row?.rankPercent);
		const state = kills === 0 ? "no-kills" : bestPercent !== null ? "recorded" : "unavailable";
		return {
			encounterId: encounter.id,
			bossName: encounter.name,
			state,
			specName: row?.bestSpec ?? row?.spec ?? null,
			bestPercent: state === "recorded" ? bestPercent : null,
			bestAmount: state === "recorded" ? number(row?.bestAmount) : null,
			kills,
			fastestKillMs: state === "recorded" ? number(row?.fastestKill) : null,
			medianPercent: state === "recorded" ? number(row?.medianPercent) : null,
			allStarPoints: state === "recorded" ? number(row?.allStars?.points) : null,
			allStarRank: state === "recorded" ? number(row?.allStars?.rank) : null,
		};
	});
	return {
		metric,
		difficulty,
		collection,
		partition: number(raw?.partition),
		rows,
		summary: {
			bestPerformanceAverage: number(raw?.bestPerformanceAverage),
			medianPerformanceAverage: number(raw?.medianPerformanceAverage),
			killsLogged:
				rows.length > 0 && rows.every((r) => r.kills !== null)
					? rows.reduce((sum, r) => sum + (r.kills ?? 0), 0)
					: null,
			allStars: (raw?.allStars ?? []).map((a) => ({
				spec: a.spec,
				partition: number(a.partition),
				points: number(a.points),
				rank: number(a.rank),
			})),
		},
	};
}

export async function verifyRaidMetricSchema(
	query: RaidQuery,
): Promise<NonNullable<Snapshot["raidMetricSchema"]>> {
	try {
		const result = await query<{ __type: { enumValues: Array<{ name: string }> } | null }>(
			'{ __type(name: "CharacterPageRankingMetricType") { enumValues { name } } }',
		);
		if (!result.__type?.enumValues) throw new Error("Metric enum unavailable");
		const names = result.__type.enumValues.map((v) => v.name);
		const supported = (["dps", "bossdps", "hps"] as const).filter((metric) =>
			names.includes(metric),
		);
		console.log(`✓ WCL metric enum verified: ${supported.join(", ")}`);
		return { state: "verified", supported, checkedAt: new Date().toISOString() };
	} catch (err) {
		console.warn(
			`::warning::WCL metric schema unavailable: ${err instanceof Error ? err.message : "query failed"}; bossdps remains unqueried`,
		);
		return { state: "unavailable", supported: [], checkedAt: new Date().toISOString() };
	}
}

/** Four zone selections (or two for healers), one HTTP query per tracked spec. */
export async function fetchRaidPerformance(
	query: RaidQuery,
	identity: { name: string; realm: string; region: string },
	zoneId: number,
	specName: string,
	healer: boolean,
	encounters: Array<{ id: number; name: string }>,
	supported: RaidMetric[],
	previous?: CharacterSpecData["raidPerformance"],
	previousAt?: string,
	enabled = true,
): Promise<NonNullable<CharacterSpecData["raidPerformance"]>> {
	const metrics: RaidMetric[] = healer ? ["hps"] : ["dps", "bossdps"];
	// dps/hps are established existing collectors; new bossdps requires live enum verification.
	const allowed = metrics.filter((m) => supported.includes(m));
	const aliases = allowed.flatMap((metric) =>
		[4, 5].map(
			(difficulty) =>
				`${metric}${difficulty}: zoneRankings(zoneID: $zoneId, difficulty: ${difficulty}, metric: ${metric}, specName: $specName)`,
		),
	);
	let character: Record<string, RaidZoneRaw | null> | null = null;
	let errors: GraphqlError[] = [];
	let failure: string | undefined;
	if (enabled && aliases.length) {
		try {
			const result = await query<{
				characterData: { character: Record<string, RaidZoneRaw | null> | null };
			}>(
				`query CharacterRaidOverview($name: String!, $realm: String!, $region: String!, $zoneId: Int!, $specName: String!) { characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) { ${aliases.join("\n")} } } }`,
				{ ...identity, region: identity.region.toUpperCase(), zoneId, specName },
				(value) => {
					errors = value;
				},
			);
			character = result.characterData.character;
		} catch (err) {
			failure = err instanceof Error ? err.message : "WCL 레이드 조회 실패";
		}
	}
	const performance: NonNullable<CharacterSpecData["raidPerformance"]> = {};
	for (const metric of metrics) {
		const difficulties = {} as Record<RaidDifficulty, RaidDifficultyData>;
		for (const [difficulty, id] of [
			["Heroic", 4],
			["Mythic", 5],
		] as const) {
			const alias = `${metric}${id}`;
			const skipped = !enabled || !allowed.includes(metric);
			const issue =
				failure ??
				(errors.some((e) => !e.path || e.path.includes(alias))
					? "WCL GraphQL 부분 응답 오류"
					: undefined);
			const raw = character?.[alias] ?? null;
			const populated = raw?.rankings?.some((r) => number(r.rankPercent) !== null) ?? false;
			const status: CollectionStatus = {
				state: skipped
					? "skipped"
					: issue
						? populated
							? "partial"
							: "failed"
						: populated
							? "ok"
							: "empty",
				attemptedRequests: skipped ? 0 : 1,
				failedRequests: !skipped && issue ? 1 : 0,
				issues: skipped
					? [enabled ? "공식 metric 스키마 검증 전 · 미조회" : "WCL 미조회"]
					: issue
						? [issue]
						: [],
				lastSuccessAt: !skipped && !issue ? new Date().toISOString() : undefined,
			};
			const fresh = mapRaidDifficulty(raw, metric, difficulty, encounters, status);
			const old = previous?.[metric]?.[difficulty];
			let data = retain(fresh, status, old, old?.collection, previousAt, (d) =>
				d.rows.some((r) => r.state === "recorded"),
			);
			if (status.state === "skipped" && old?.rows.some((r) => r.state === "recorded")) {
				data = old;
				status.retainedAt = old.collection.retainedAt ?? old.collection.lastSuccessAt ?? previousAt;
			}
			difficulties[difficulty] = { ...data, collection: status };
		}
		performance[metric] = difficulties;
	}
	return performance;
}
