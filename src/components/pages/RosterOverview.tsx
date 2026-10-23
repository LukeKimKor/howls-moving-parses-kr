import { type ReactNode, useMemo, useState } from "react";
import { specLabel } from "../../lib/ko.js";
import {
	type KillProgress,
	RAID_METRIC_LABELS,
	raidEncounters,
	specKillProgress,
} from "../../lib/raid-overview.js";
import { selectedSummaryStar, summaryPatchOptions } from "../../lib/raid-summary.js";
import { characterProfileUrl } from "../../lib/regions.js";
import {
	type DamageMetric,
	ROLE_LABELS,
	ROLE_ORDER,
	type RowSortKey,
	type SpecRole,
	type SpecRow,
	average,
	characterIlvl,
	characterMythicPlus,
	readableOnDark,
	rowRaid,
	sortRows,
	specRows,
} from "../../lib/roster.js";
import type { CharacterData, RaidDifficulty, Snapshot } from "../../types/snapshot.js";
import { MissingValue } from "../primitives/MissingValue.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
import { CLASS_COLORS } from "../primitives/SpecIcon.js";
import {
	CharacterCell,
	IlvlLegend,
	IlvlValue,
	KillValue,
	PctValue,
	RoleHeading,
	Segment,
	SortHeader,
	SpecChip,
	StarPointsValue,
	StarRankValue,
	classRow,
} from "./DashParts.js";

const SORT_LABELS: Record<RowSortKey, string> = {
	config: "등록 순",
	score: "쐐기 점수",
	ilvl: "아이템 레벨",
	heroic: "영웅 최고",
	heroicMedian: "영웅 중앙",
	heroicPoints: "영웅 All Stars 점수",
	heroicKills: "영웅 처치 수",
	mythic: "신화 최고",
	mythicMedian: "신화 중앙",
	mythicPoints: "신화 All Stars 점수",
	mythicKills: "신화 처치 수",
};

type StarLookup = (
	row: SpecRow,
	difficulty: RaidDifficulty,
) =>
	| {
			points: number | null;
			rank: number | null;
			rankPercent?: number | null;
			total?: number | null;
	  }
	| undefined;

type KillLookup = (row: SpecRow, difficulty: RaidDifficulty) => KillProgress | undefined;

/** WCL opens filtered to this row's spec (and the current raid), so its numbers match the row. */
function CharacterLinks({
	character,
	specName,
	zoneId,
}: { character: CharacterData; specName: string; zoneId?: number }) {
	const realm = character.realmSlug ?? character.realm;
	const wcl = new URL(characterProfileUrl("wcl", character.region, realm, character.name));
	wcl.searchParams.set("spec", specName);
	if (zoneId) wcl.searchParams.set("zone", String(zoneId));
	const spec = specLabel(specName, character.class);
	return (
		<span className="dash-inline-links">
			<a
				href={wcl.href}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`WCL · ${character.name} ${spec} 기록`}
				title={`WarcraftLogs에서 ${spec} 기록만 보기`}
			>
				WCL
			</a>
			<a
				href={characterProfileUrl("rio", character.region, realm, character.name)}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`RIO · ${character.name} Raider.IO`}
			>
				RIO
			</a>
		</span>
	);
}

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
	return (
		<div className="dash-kpi">
			<span className="dash-kpi-label">{label}</span>
			<strong className="dash-kpi-value">{value}</strong>
			{sub && <span className="dash-kpi-sub">{sub}</span>}
		</div>
	);
}

function RoleTable({
	role,
	rows,
	damageMetric,
	sortKey,
	onSort,
	maxScore,
	star,
	kills,
	zoneId,
}: {
	zoneId?: number;
	star: StarLookup;
	kills: KillLookup;
	role: SpecRole;
	rows: SpecRow[];
	damageMetric: DamageMetric;
	sortKey: RowSortKey;
	onSort: (key: RowSortKey) => void;
	maxScore: number;
}) {
	const roleLabel = ROLE_LABELS[role];
	const metricNote =
		role === "healer"
			? "치유량 기준 · 전문화별 기록"
			: `${RAID_METRIC_LABELS[damageMetric]} 기준 · 전문화별 기록`;
	const sortProps = { current: sortKey, onSort };
	return (
		<section className="dash-role-section" aria-label={`${roleLabel} 현황`}>
			<RoleHeading role={role} count={rows.length} note={metricNote} />
			<div className="dash-table-scroll">
				<table
					className="dash-table dash-roster-table"
					aria-label={`${roleLabel} 전문화별 아이템 레벨, 쐐기 점수, 레이드 처치 수와 백분위`}
				>
					<colgroup>
						<col className="dash-w-char" />
						<col className="dash-w-spec" />
						<col className="dash-w-num" />
						<col className="dash-w-score" />
						{["H", "M"].flatMap((d) =>
							["kills", "best", "median", "points", "rank"].map((k) => (
								<col key={`${d}-${k}`} className={k === "kills" ? "dash-w-kills" : "dash-w-pct"} />
							)),
						)}
					</colgroup>
					<thead>
						<tr>
							<th scope="col" rowSpan={2} className="dash-col-char">
								캐릭터
							</th>
							<th scope="col" rowSpan={2}>
								전문화
							</th>
							<SortHeader sortKey="ilvl" rowSpan={2} className="dash-center" {...sortProps}>
								템렙
							</SortHeader>
							<SortHeader sortKey="score" rowSpan={2} {...sortProps}>
								쐐기 점수
							</SortHeader>
							<th scope="colgroup" colSpan={5} className="dash-group dash-heroic dash-group-start">
								영웅
							</th>
							<th scope="colgroup" colSpan={5} className="dash-group dash-mythic dash-group-start">
								신화
							</th>
						</tr>
						<tr className="dash-subhead">
							<SortHeader
								sortKey="heroicKills"
								className="dash-num dash-heroic dash-group-start dash-col-kills"
								{...sortProps}
							>
								처치
							</SortHeader>
							<SortHeader sortKey="heroic" className="dash-num dash-heroic" {...sortProps}>
								최고
							</SortHeader>
							<SortHeader sortKey="heroicMedian" className="dash-num dash-heroic" {...sortProps}>
								중앙
							</SortHeader>
							<SortHeader sortKey="heroicPoints" className="dash-num dash-heroic" {...sortProps}>
								점수
							</SortHeader>
							<th scope="col" className="dash-num dash-heroic">
								순위
							</th>
							<SortHeader
								sortKey="mythicKills"
								className="dash-num dash-mythic dash-group-start dash-col-kills"
								{...sortProps}
							>
								처치
							</SortHeader>
							<SortHeader sortKey="mythic" className="dash-num dash-mythic" {...sortProps}>
								최고
							</SortHeader>
							<SortHeader sortKey="mythicMedian" className="dash-num dash-mythic" {...sortProps}>
								중앙
							</SortHeader>
							<SortHeader sortKey="mythicPoints" className="dash-num dash-mythic" {...sortProps}>
								점수
							</SortHeader>
							<th scope="col" className="dash-num dash-mythic">
								순위
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => {
							const { character } = row;
							const mplus = characterMythicPlus(character);
							const ilvl = characterIlvl(character);
							const heroic = rowRaid(row, "Heroic", damageMetric);
							const mythic = rowRaid(row, "Mythic", damageMetric);
							const heroicStar = star(row, "Heroic");
							const mythicStar = star(row, "Mythic");
							const heroicKills = kills(row, "Heroic");
							const mythicKills = kills(row, "Mythic");
							return (
								<tr
									key={row.key}
									data-roster-row={row.key}
									data-roster-character={character.name}
									{...classRow(character)}
								>
									<th scope="row" className="dash-col-char">
										<CharacterCell
											character={character}
											sub={
												<CharacterLinks
													character={character}
													specName={row.specName}
													zoneId={zoneId}
												/>
											}
										/>
									</th>
									<td data-label="전문화">
										<SpecChip character={character} specName={row.specName} />
									</td>
									<td className="dash-center" data-label="템렙">
										<IlvlValue value={ilvl} />
									</td>
									<td data-label="쐐기 점수">
										{mplus ? (
											<div className="dash-score">
												<strong style={{ color: readableOnDark(mplus.scoreColor) }}>
													{Math.round(mplus.score).toLocaleString("ko-KR")}
												</strong>
												<span className="dash-meter" aria-hidden="true">
													<span
														style={{
															width: `${maxScore ? Math.round((mplus.score / maxScore) * 100) : 0}%`,
															background: mplus.scoreColor,
														}}
													/>
												</span>
											</div>
										) : (
											<MissingValue label="쐐기 점수 미확인" />
										)}
									</td>
									<td
										className="dash-num dash-heroic dash-group-start dash-col-kills"
										data-label="영웅 처치"
									>
										<KillValue progress={heroicKills} />
									</td>
									<td className="dash-num dash-heroic" data-label="영웅 최고">
										<PctValue value={heroic.best} state={heroic.state} emphasis />
									</td>
									<td className="dash-num dash-heroic" data-label="영웅 중앙">
										<PctValue value={heroic.median} state={heroic.state} />
									</td>
									<td className="dash-num dash-heroic" data-label="영웅 점수">
										<StarPointsValue value={heroicStar?.points} />
									</td>
									<td className="dash-num dash-heroic" data-label="영웅 순위">
										<StarRankValue
											rank={heroicStar?.rank}
											rankPercent={heroicStar?.rankPercent}
											total={heroicStar?.total}
										/>
									</td>
									<td
										className="dash-num dash-mythic dash-group-start dash-col-kills"
										data-label="신화 처치"
									>
										<KillValue progress={mythicKills} />
									</td>
									<td className="dash-num dash-mythic" data-label="신화 최고">
										<PctValue value={mythic.best} state={mythic.state} emphasis />
									</td>
									<td className="dash-num dash-mythic" data-label="신화 중앙">
										<PctValue value={mythic.median} state={mythic.state} />
									</td>
									<td className="dash-num dash-mythic" data-label="신화 점수">
										<StarPointsValue value={mythicStar?.points} />
									</td>
									<td className="dash-num dash-mythic" data-label="신화 순위">
										<StarRankValue
											rank={mythicStar?.rank}
											rankPercent={mythicStar?.rankPercent}
											total={mythicStar?.total}
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}

export function RosterOverview({
	snapshot,
}: {
	snapshot: Snapshot;
}) {
	const [damageMetric, setDamageMetric] = useState<DamageMetric>("dps");
	const [sortKey, setSortKey] = useState<RowSortKey>("config");
	const patches = summaryPatchOptions(snapshot);
	const [patchId, setPatchId] = useState<number | null>(() => patches[0]?.id ?? null);
	const allRows = useMemo(() => specRows(snapshot.characters), [snapshot.characters]);
	const star: StarLookup = (row, difficulty) =>
		selectedSummaryStar(
			snapshot,
			row.characterIndex,
			row.slug,
			row.metric(damageMetric),
			difficulty,
			patchId,
		);
	const encounters = useMemo(() => raidEncounters(snapshot), [snapshot]);
	const killMap = useMemo(() => {
		const map = new Map<string, Record<RaidDifficulty, KillProgress>>();
		for (const row of allRows) {
			const spec = row.character.specs[row.slug];
			if (spec)
				map.set(
					row.key,
					specKillProgress(spec, row.metric(damageMetric), encounters, snapshot.generatedAt),
				);
		}
		return map;
	}, [allRows, damageMetric, encounters, snapshot.generatedAt]);
	const kills: KillLookup = (row, difficulty) => killMap.get(row.key)?.[difficulty];
	const sorted = sortRows(
		allRows,
		sortKey,
		damageMetric,
		(row, d) => star(row, d)?.points ?? null,
		(row, d) => {
			const progress = kills(row, d);
			if (!progress || progress.total === 0 || !progress.known) return null;
			return progress.killed;
		},
	);
	const toggleSort = (key: RowSortKey) => setSortKey(sortKey === key ? "config" : key);

	const scores = snapshot.characters.map((c) => characterMythicPlus(c)?.score ?? null);
	const ilvls = snapshot.characters.map(characterIlvl);
	const topScoreIndex = scores.reduce<number>(
		(best, s, i) => (s !== null && (best < 0 || s > (scores[best] ?? 0)) ? i : best),
		-1,
	);
	const topScoreChar = topScoreIndex >= 0 ? snapshot.characters[topScoreIndex] : undefined;
	const maxScore = Math.max(0, ...scores.filter((s): s is number => s !== null));
	const avgIlvl = average(ilvls);
	const heroicAvg = average(allRows.map((row) => rowRaid(row, "Heroic", damageMetric).best));
	const mythicLogged = allRows.filter(
		(row) => rowRaid(row, "Mythic", damageMetric).best !== null,
	).length;

	return (
		<section className="dash-roster" aria-label="전체 캐릭터 종합 현황">
			<div className="dash-kpis">
				<Kpi
					label="캐릭터"
					value={`${snapshot.characters.length}개`}
					sub={`전문화 ${allRows.length}개 추적`}
				/>
				<Kpi
					label="평균 아이템 레벨"
					value={avgIlvl === null ? "—" : avgIlvl.toFixed(1)}
					sub={`최고 ${Math.max(0, ...ilvls.filter((v): v is number => v !== null)).toFixed(1)}`}
				/>
				<Kpi
					label="최고 쐐기 점수"
					value={
						topScoreChar ? (
							<span
								style={{ color: readableOnDark(characterMythicPlus(topScoreChar)?.scoreColor) }}
							>
								{Math.round(maxScore).toLocaleString("ko-KR")}
							</span>
						) : (
							"—"
						)
					}
					sub={
						topScoreChar && (
							<span style={{ color: CLASS_COLORS[topScoreChar.class] }}>{topScoreChar.name}</span>
						)
					}
				/>
				<Kpi
					label="영웅 최고 % 평균"
					value={heroicAvg === null ? "—" : <RaidPercent value={heroicAvg} />}
					sub="전문화별 최고 백분위의 평균"
				/>
				<Kpi
					label="신화 기록 보유"
					value={`${mythicLogged} / ${allRows.length}`}
					sub="신화 백분위가 있는 전문화"
				/>
			</div>

			<div className="dash-toolbar">
				<h2>전문화별 현황</h2>
				<div className="dash-toolbar-controls">
					<Segment
						label="딜러 레이드 지표"
						value={damageMetric}
						options={[
							{ value: "dps", label: RAID_METRIC_LABELS.dps },
							{ value: "bossdps", label: RAID_METRIC_LABELS.bossdps },
						]}
						onChange={setDamageMetric}
					/>
					<label className="dash-sort-select">
						점수 패치
						<select
							aria-label="All Stars 점수 패치"
							value={patchId ?? ""}
							disabled={!patches.length}
							onChange={(event) => setPatchId(Number(event.target.value))}
						>
							{patches.length ? (
								patches.map((patch) => (
									<option key={patch.id} value={patch.id}>
										{patch.name}
									</option>
								))
							) : (
								<option value="">패치명 미확인</option>
							)}
						</select>
					</label>
					<label className="dash-sort-select">
						정렬
						<select
							aria-label="종합 현황 정렬"
							value={sortKey}
							onChange={(event) => setSortKey(event.target.value as RowSortKey)}
						>
							{(Object.keys(SORT_LABELS) as RowSortKey[]).map((key) => (
								<option key={key} value={key}>
									{SORT_LABELS[key]}
								</option>
							))}
						</select>
					</label>
				</div>
			</div>

			{ROLE_ORDER.map((role) => {
				const rows = sorted.filter((row) => row.role === role);
				if (!rows.length)
					return (
						<section
							key={role}
							className="dash-role-section"
							aria-label={`${ROLE_LABELS[role]} 현황`}
						>
							<RoleHeading role={role} count={0} />
							<p className="dash-role-empty">
								등록된 {ROLE_LABELS[role]} 전문화가 없습니다. characters.config.json에 추가하면
								이곳에 표시됩니다.
							</p>
						</section>
					);
				return (
					<RoleTable
						key={role}
						role={role}
						rows={rows}
						damageMetric={damageMetric}
						sortKey={sortKey}
						onSort={toggleSort}
						maxScore={maxScore}
						star={star}
						kills={kills}
						zoneId={snapshot.raid?.id}
					/>
				);
			})}

			<IlvlLegend />
			<p className="dash-note">
				처치는 그 전문화로 처치 기록이 있는 우두머리 수 / 전체 우두머리 수로, 레이드 로그 화면과
				같은 값입니다. 레이드 값은 WCL 요약 백분위이며, 각 행의 전문화로 기록한 처치만
				집계합니다(WCL의 전체 전문화 화면과 다를 수 있어요. WCL 링크는 해당 전문화로 걸러서
				열립니다). 최고는 보스별 최고 기록의 평균, 중앙은 보스별 중앙값의 평균이에요. 딜러는 선택한
				피해 지표, 힐러는 치유량 기준입니다. 쐐기 점수와 템렙은 캐릭터 전체 값이라 같은 캐릭터의
				전문화 행에는 같은 값이 표시됩니다. 열 제목을 누르면 정렬됩니다. All Stars 점수·순위는
				선택한 패치의 WCL 값입니다.
			</p>
		</section>
	);
}
