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
import { WclDeferredError } from "./wcl-runtime.js";

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

/** At most two difficulty selections per query; fresh selections are reused independently. */
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
	reuseTtlMs = 0,
): Promise<NonNullable<CharacterSpecData["raidPerformance"]>> {
	const metrics: RaidMetric[] = healer ? ["hps"] : ["dps", "bossdps"];
	const outcomes = new Map<
		string,
		{
			raw: RaidZoneRaw | null;
			issue?: string;
			deferred?: WclDeferredError;
			cached?: RaidDifficultyData;
			attempted: boolean;
		}
	>();
	for (const metric of metrics) {
		if (!enabled || !supported.includes(metric)) continue;
		const pending: Array<{ difficulty: RaidDifficulty; id: number; alias: string }> = [];
		for (const [difficulty, id] of [
			["Heroic", 4],
			["Mythic", 5],
		] as const) {
			const alias = `${metric}${id}`;
			const old = previous?.[metric]?.[difficulty];
			const at = old?.collection.lastSuccessAt ?? old?.collection.retainedAt;
			if (
				old &&
				at &&
				reuseTtlMs > 0 &&
				!["failed", "partial"].includes(old.collection.state) &&
				Date.now() - Date.parse(at) >= 0 &&
				Date.now() - Date.parse(at) < reuseTtlMs
			)
				outcomes.set(alias, { raw: null, cached: old, attempted: false });
			else pending.push({ difficulty, id, alias });
		}
		if (!pending.length) continue;
		let character: Record<string, RaidZoneRaw | null> | null = null;
		let errors: GraphqlError[] = [];
		let failure: string | undefined;
		let deferred: WclDeferredError | undefined;
		try {
			const aliases = pending.map(
				({ id, alias }) =>
					`${alias}: zoneRankings(zoneID: $zoneId, difficulty: ${id}, metric: ${metric}, specName: $specName)`,
			);
			const data = await query<{
				characterData: { character: Record<string, RaidZoneRaw | null> | null } | null;
			}>(
				`query CharacterRaidOverview($name: String!, $realm: String!, $region: String!, $zoneId: Int!, $specName: String!) { characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) { ${aliases.join("\n")} } } }`,
				{ ...identity, region: identity.region.toUpperCase(), zoneId, specName },
				(value) => {
					errors = value;
				},
			);
			character = data.characterData?.character ?? null;
		} catch (error) {
			if (error instanceof WclDeferredError) deferred = error;
			failure = error instanceof Error ? error.message : "WCL 레이드 조회 실패";
		}
		for (const { alias } of pending) {
			const targetPath = ["characterData", "character", alias];
			const response = character?.[alias];
			const raw = response && Array.isArray(response.rankings) ? response : null;
			const issue =
				failure ??
				(errors.some(
					(e) =>
						!e.path?.length ||
						e.path.slice(0, targetPath.length).every((part, i) => part === targetPath[i]),
				)
					? "WCL GraphQL 부분 응답 오류"
					: !character
						? "WCL 캐릭터 응답 누락 · 기록 유무 확인 불가"
						: !raw
							? "WCL 레이드 순위 응답 누락 · 기록 유무 확인 불가"
							: undefined);
			outcomes.set(alias, {
				raw,
				issue,
				deferred,
				attempted: deferred ? deferred.attempted : true,
			});
		}
	}
	const performance: NonNullable<CharacterSpecData["raidPerformance"]> = {};
	for (const metric of metrics) {
		const sections = {} as Record<RaidDifficulty, RaidDifficultyData>;
		for (const [difficulty, id] of [
			["Heroic", 4],
			["Mythic", 5],
		] as const) {
			const outcome = outcomes.get(`${metric}${id}`);
			const old = previous?.[metric]?.[difficulty];
			if (outcome?.cached) {
				sections[difficulty] = {
					...outcome.cached,
					collection: {
						state: "skipped",
						attemptedRequests: 0,
						failedRequests: 0,
						issues: ["4시간 캐릭터 레이드 캐시 재사용"],
						retainedAt:
							outcome.cached.collection.retainedAt ??
							outcome.cached.collection.lastSuccessAt ??
							previousAt,
					},
				};
				continue;
			}
			const skipped = !enabled || !supported.includes(metric) || !!outcome?.deferred;
			const raw = outcome?.raw ?? null;
			const populated = raw?.rankings?.some((r) => number(r.rankPercent) !== null) ?? false;
			const collection: CollectionStatus = {
				state: skipped
					? "skipped"
					: outcome?.issue
						? populated
							? "partial"
							: "failed"
						: populated
							? "ok"
							: "empty",
				deferred: !!outcome?.deferred,
				deferredUntil: outcome?.deferred?.retryAt
					? new Date(outcome.deferred.retryAt).toISOString()
					: undefined,
				attemptedRequests: Number(outcome?.attempted),
				failedRequests: outcome?.issue ? Number(outcome.attempted) : 0,
				issues: skipped
					? [
							outcome?.deferred?.message ??
								(enabled ? "공식 metric 스키마 지원 미확인 · 미조회" : "WCL 미조회"),
						]
					: outcome?.issue
						? [outcome.issue]
						: [],
				lastSuccessAt: !skipped && !outcome?.issue ? new Date().toISOString() : undefined,
			};
			const fresh = mapRaidDifficulty(raw, metric, difficulty, encounters, collection);
			let result = retain(fresh, collection, old, old?.collection, previousAt, (d) =>
				d.rows.some((r) => r.state === "recorded"),
			);
			if (skipped && old && (old.collection.lastSuccessAt || old.collection.retainedAt)) {
				result = old;
				collection.retainedAt =
					old.collection.retainedAt ?? old.collection.lastSuccessAt ?? previousAt;
			}
			sections[difficulty] = { ...result, collection };
		}
		performance[metric] = sections;
	}
	return performance;
}

/** Unexpected whole-spec exceptions still produce every expected panel, without claiming an API attempt. */
export function failedRaidPerformance(
	healer: boolean,
	encounters: Array<{ id: number; name: string }>,
	previous?: CharacterSpecData["raidPerformance"],
	previousAt?: string,
): NonNullable<CharacterSpecData["raidPerformance"]> {
	const result: NonNullable<CharacterSpecData["raidPerformance"]> = {};
	const metrics: RaidMetric[] = healer ? ["hps"] : ["dps", "bossdps"];
	for (const metric of metrics) {
		const difficulties = {} as Record<RaidDifficulty, RaidDifficultyData>;
		for (const difficulty of ["Heroic", "Mythic"] as const) {
			const collection: CollectionStatus = {
				state: "failed",
				attemptedRequests: 0,
				failedRequests: 0,
				issues: ["캐릭터 전문화 조회 실패 · 기록 유무 확인 불가"],
			};
			const fresh = mapRaidDifficulty(null, metric, difficulty, encounters, collection);
			const old = previous?.[metric]?.[difficulty];
			const data = retain(fresh, collection, old, old?.collection, previousAt, (d) =>
				d.rows.some((r) => r.state === "recorded"),
			);
			difficulties[difficulty] = { ...data, collection };
		}
		result[metric] = difficulties;
	}
	return result;
}

export function deferredRaidPerformance(
	healer: boolean,
	encounters: Array<{ id: number; name: string }>,
	previous: CharacterSpecData["raidPerformance"],
	previousAt: string | undefined,
	reason: string,
) {
	const result = failedRaidPerformance(healer, encounters, previous, previousAt);
	for (const [metric, sections] of Object.entries(result))
		for (const [difficulty, section] of Object.entries(sections)) {
			const old = previous?.[metric as RaidMetric]?.[difficulty as RaidDifficulty];
			if (old && (old.collection.lastSuccessAt || old.collection.retainedAt)) {
				sections[difficulty as RaidDifficulty] = {
					...old,
					collection: {
						state: "skipped",
						deferred: true,
						attemptedRequests: 0,
						failedRequests: 0,
						issues: [reason],
						retainedAt: old.collection.retainedAt ?? old.collection.lastSuccessAt ?? previousAt,
					},
				};
			} else
				section.collection = {
					...section.collection,
					state: "skipped",
					deferred: true,
					issues: [reason],
				};
		}
	return result;
}
