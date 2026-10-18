import { useMemo, useState } from "react";
import { raidPatchLabel, scopedAllStars } from "../../lib/all-stars.js";
import { formatNumber } from "../../lib/format.js";
import { bossGroup, difficultyLabel, gameName, rateLabel } from "../../lib/ko.js";
import { RAID_METRIC_LABELS, raidEncounters, raidSection } from "../../lib/raid-overview.js";
import { selectedSummaryStar, summaryPatchOptions } from "../../lib/raid-summary.js";
import { characterProfileUrl } from "../../lib/regions.js";
import {
	type DamageMetric,
	ROLE_LABELS,
	ROLE_ORDER,
	type SpecRow,
	rowRaid,
	specRows,
} from "../../lib/roster.js";
import type {
	CharacterData,
	RaidDifficulty,
	RaidDifficultyData,
	RaidPerformanceRow,
	Snapshot,
} from "../../types/snapshot.js";
import { AllStarsHelp } from "../primitives/AllStarsSummary.js";
import { CollectionNotice } from "../primitives/CollectionNotice.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
import { CLASS_COLORS } from "../primitives/SpecIcon.js";
import {
	CharacterCell,
	PctValue,
	RoleHeading,
	Segment,
	SpecChip,
	StarPointsValue,
	StarRankValue,
	classRow,
} from "./DashParts.js";
import { DesktopRaidToc } from "./DesktopRaidToc.js";

const DIFFICULTIES: RaidDifficulty[] = ["Heroic", "Mythic"];
const diffClass = (d: RaidDifficulty) => (d === "Heroic" ? "dash-heroic" : "dash-mythic");
const amount = (value: number | null) =>
	value === null ? null : value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

function unavailableLabel(data: RaidDifficultyData) {
	const state = data.collection.state;
	if (state === "failed" || state === "partial") return "조회 실패";
	if (state === "empty") return "기록 없음";
	return "미조회";
}

// ── Summary ──────────────────────────────────────────────────

function SummaryTable({
	snapshot,
	rows,
	role,
	damageMetric,
	patchId,
}: {
	snapshot: Snapshot;
	rows: SpecRow[];
	role: SpecRow["role"];
	damageMetric: DamageMetric;
	patchId: number | null;
}) {
	return (
		<section className="dash-role-section" aria-label={`${ROLE_LABELS[role]} 레이드 요약`}>
			<RoleHeading
				role={role}
				count={rows.length}
				note={role === "healer" ? "치유량 기준" : `${RAID_METRIC_LABELS[damageMetric]} 기준`}
			/>
			<div className="dash-table-scroll">
				<table
					className="dash-table dash-raid-summary"
					aria-label={`${ROLE_LABELS[role]} 영웅·신화 레이드 요약`}
				>
					<colgroup>
						<col className="dash-w-char" />
						<col className="dash-w-spec" />
						{DIFFICULTIES.flatMap((d) =>
							["best", "median", "points", "rank"].map((k) => (
								<col key={`${d}-${k}`} className="dash-w-pct" />
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
							{DIFFICULTIES.map((d) => (
								<th
									key={d}
									scope="colgroup"
									colSpan={4}
									className={`dash-group ${diffClass(d)} dash-group-start`}
								>
									{difficultyLabel(d)}
								</th>
							))}
						</tr>
						<tr className="dash-subhead">
							{DIFFICULTIES.flatMap((d) =>
								["최고", "중앙", "종합 점수", "순위"].map((label, i) => (
									<th
										key={`${d}-${label}`}
										scope="col"
										className={`dash-num ${diffClass(d)}${i === 0 ? " dash-group-start" : ""}`}
									>
										{label}
									</th>
								)),
							)}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.key} data-raid-summary-row={row.key} {...classRow(row.character)}>
								<th scope="row" className="dash-col-char">
									<CharacterCell character={row.character} />
								</th>
								<td data-label="전문화">
									<SpecChip character={row.character} specName={row.specName} />
								</td>
								{DIFFICULTIES.map((d) => {
									const pair = rowRaid(row, d, damageMetric);
									const star = selectedSummaryStar(
										snapshot,
										row.characterIndex,
										row.slug,
										row.metric(damageMetric),
										d,
										patchId,
									);
									const label = difficultyLabel(d);
									return [
										<td
											key={`${d}-best`}
											className={`dash-num ${diffClass(d)} dash-group-start`}
											data-label={`${label} 최고`}
										>
											<PctValue value={pair.best} state={pair.state} emphasis />
										</td>,
										<td
											key={`${d}-median`}
											className={`dash-num ${diffClass(d)}`}
											data-label={`${label} 중앙`}
										>
											<PctValue value={pair.median} state={pair.state} />
										</td>,
										<td
											key={`${d}-points`}
											className={`dash-num ${diffClass(d)}`}
											data-label={`${label} 종합 점수`}
										>
											<StarPointsValue value={star?.points} />
										</td>,
										<td
											key={`${d}-rank`}
											className={`dash-num ${diffClass(d)}`}
											data-label={`${label} 순위`}
										>
											<StarRankValue
												rank={star?.rank}
												rankPercent={star?.rankPercent}
												total={star?.total}
											/>
										</td>,
									];
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function PatchHistory({
	snapshot,
	damageMetric,
}: { snapshot: Snapshot; damageMetric: DamageMetric }) {
	const entries = specRows(snapshot.characters).flatMap((row) =>
		DIFFICULTIES.flatMap((d) => {
			const metric = row.metric(damageMetric);
			return scopedAllStars(
				row.character.specs[row.slug]?.raidPerformance?.[metric]?.[d],
				row.specName,
			).map((star, index) => ({ row, d, metric, star, index }));
		}),
	);
	return (
		<details className="dash-details">
			<summary>전체 패치 기록 · 종합 점수와 순위</summary>
			{entries.length ? (
				<div className="dash-table-scroll">
					<table
						className="dash-table dash-history-table"
						aria-label="모든 패치의 종합 점수와 순위"
					>
						<thead>
							<tr>
								{["캐릭터", "전문화", "난이도", "지표", "패치", "종합 점수", "순위"].map(
									(label) => (
										<th
											key={label}
											scope="col"
											className={label === "종합 점수" || label === "순위" ? "dash-num" : undefined}
										>
											{label}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody>
							{entries.map(({ row, d, metric, star, index }) => (
								<tr key={`${row.key}-${d}-${star.partition}-${index}`}>
									<th scope="row" style={{ color: CLASS_COLORS[row.character.class] }}>
										{row.character.name}
									</th>
									<td data-label="전문화">
										<SpecChip character={row.character} specName={row.specName} />
									</td>
									<td data-label="난이도">{difficultyLabel(d)}</td>
									<td data-label="지표">{RAID_METRIC_LABELS[metric]}</td>
									<td data-label="패치">
										{raidPatchLabel(snapshot.raid?.id, star.partition, snapshot.raidPatchMetadata)}
									</td>
									<td className="dash-num" data-label="종합 점수">
										<StarPointsValue value={star.points} />
									</td>
									<td className="dash-num" data-label="순위">
										<StarRankValue
											rank={star.rank}
											rankPercent={star.rankPercent}
											total={star.total}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="dash-note">아직 수집된 종합 점수 기록이 없습니다.</p>
			)}
		</details>
	);
}

// ── Boss detail ──────────────────────────────────────────────

function BossCells({
	data,
	row,
	url,
}: {
	data: RaidDifficultyData;
	row: RaidPerformanceRow | undefined;
	url: URL;
}) {
	const d = data.difficulty;
	const label = difficultyLabel(d);
	const cls = `dash-num ${diffClass(d)}`;
	if (!row || row.state !== "recorded") {
		const text = row?.state === "no-kills" ? "미처치" : unavailableLabel(data);
		return (
			<>
				<td className={`${cls} dash-group-start`} data-label={`${label} 최고`}>
					<span className="dash-empty">{text}</span>
				</td>
				<td className={cls} data-label={`${label} 중앙`}>
					<span className="dash-empty">—</span>
				</td>
				<td className={cls} data-label={`${label} 처치`}>
					<span className="dash-empty">{row?.kills === 0 ? "0" : "—"}</span>
				</td>
				<td className={cls} data-label={`${label} ${rateLabel(data.metric)}`}>
					<span className="dash-empty">—</span>
				</td>
			</>
		);
	}
	const bossUrl = new URL(url);
	bossUrl.searchParams.set("difficulty", d === "Heroic" ? "4" : "5");
	if (row.encounterId > 0) bossUrl.searchParams.set("boss", String(row.encounterId));
	return (
		<>
			<td className={`${cls} dash-group-start`} data-label={`${label} 최고`}>
				{row.bestPercent === null ? (
					<span className="dash-empty">—</span>
				) : (
					<a
						className="dash-pct dash-pct-strong dash-pct-link"
						href={bossUrl.href}
						target="_blank"
						rel="noopener noreferrer"
					>
						<RaidPercent value={row.bestPercent} />
					</a>
				)}
			</td>
			<td className={cls} data-label={`${label} 중앙`}>
				{row.medianPercent === null ? (
					<span className="dash-empty">—</span>
				) : (
					<span className="dash-pct">
						<RaidPercent value={row.medianPercent} />
					</span>
				)}
			</td>
			<td className={cls} data-label={`${label} 처치`}>
				{row.kills === null ? <span className="dash-empty">—</span> : formatNumber(row.kills)}
			</td>
			<td className={`${cls} dash-amount`} data-label={`${label} ${rateLabel(data.metric)}`}>
				{amount(row.bestAmount) ?? <span className="dash-empty">—</span>}
			</td>
		</>
	);
}

function SpecBossCard({
	snapshot,
	row,
	damageMetric,
	encounters,
	onOpenCharacter,
}: {
	snapshot: Snapshot;
	row: SpecRow;
	damageMetric: DamageMetric;
	encounters: Array<{ id: number; name: string }>;
	onOpenCharacter: (character: CharacterData) => void;
}) {
	const spec = row.character.specs[row.slug];
	if (!spec) return null;
	const metric = row.metric(damageMetric);
	const sections = DIFFICULTIES.map((d) =>
		raidSection(spec, metric, d, encounters, snapshot.generatedAt),
	);
	const bossNames = [
		...new Set([
			...encounters.map((e) => e.name),
			...sections.flatMap((s) => s.rows.map((r) => r.bossName)),
		]),
	];
	const url = new URL(
		characterProfileUrl(
			"wcl",
			row.character.region,
			row.character.realmSlug ?? row.character.realm,
			row.character.name,
		),
	);
	url.searchParams.set("metric", metric);
	url.searchParams.set("spec", spec.specName);
	if (snapshot.raid?.id) url.searchParams.set("zone", String(snapshot.raid.id));
	const killed = (s: RaidDifficultyData) => s.rows.filter((r) => r.state === "recorded").length;

	return (
		<article
			className="dash-boss-card"
			aria-label={`${row.character.name} ${spec.specName} 보스별 기록`}
		>
			<header className="dash-boss-card-header">
				<CharacterCell
					character={row.character}
					onOpen={onOpenCharacter}
					sub={<SpecChip character={row.character} specName={row.specName} />}
				/>
				<div className="dash-boss-card-stats">
					{sections.map((s) => (
						<span key={s.difficulty} className={`dash-stat-pill ${diffClass(s.difficulty)}`}>
							{difficultyLabel(s.difficulty)}
							<strong>
								{killed(s)}/{bossNames.length}
							</strong>
							{s.summary.bestPerformanceAverage !== null && (
								<RaidPercent value={s.summary.bestPerformanceAverage} />
							)}
						</span>
					))}
					<span className="dash-stat-pill dash-metric-pill">{RAID_METRIC_LABELS[metric]}</span>
				</div>
				<div className="dash-boss-card-links">
					<a href={url.href} target="_blank" rel="noopener noreferrer">
						WCL ↗
					</a>
				</div>
			</header>
			{sections.some((s) => s.collection.state !== "ok" || s.collection.retainedAt) && (
				<div className="dash-collection">
					{sections.map((s) => (
						<CollectionNotice
							key={s.difficulty}
							label={`${difficultyLabel(s.difficulty)} ${RAID_METRIC_LABELS[metric]}`}
							status={s.collection}
						/>
					))}
				</div>
			)}
			<div className="dash-table-scroll">
				<table
					className="dash-table dash-boss-table"
					aria-label={`${row.character.name} ${spec.specName} ${RAID_METRIC_LABELS[metric]} 우두머리별 영웅·신화 기록`}
				>
					<colgroup>
						<col className="dash-w-boss" />
						{DIFFICULTIES.flatMap((d) =>
							["best", "median", "kills", "amount"].map((k) => (
								<col
									key={`${d}-${k}`}
									className={k === "amount" ? "dash-w-amount" : "dash-w-pct"}
								/>
							)),
						)}
					</colgroup>
					<thead>
						<tr>
							<th scope="col" rowSpan={2} className="dash-col-char">
								우두머리
							</th>
							{DIFFICULTIES.map((d) => (
								<th
									key={d}
									scope="colgroup"
									colSpan={4}
									className={`dash-group ${diffClass(d)} dash-group-start`}
								>
									{difficultyLabel(d)}
								</th>
							))}
						</tr>
						<tr className="dash-subhead">
							{DIFFICULTIES.flatMap((d) =>
								["최고", "중앙", "처치", rateLabel(metric)].map((label, i) => (
									<th
										key={`${d}-${label}`}
										scope="col"
										className={`dash-num ${diffClass(d)}${i === 0 ? " dash-group-start" : ""}`}
									>
										{label}
									</th>
								)),
							)}
						</tr>
					</thead>
					<tbody>
						{bossNames.map((name) => {
							const group = bossGroup(name);
							return (
								<tr key={name}>
									<th scope="row" className="dash-col-char">
										<span className="dash-boss-name">{gameName(name)}</span>
										{group && group !== "맹독 심연" && (
											<small className="dash-boss-group">{group}</small>
										)}
									</th>
									{sections.map((s) => (
										<BossCells
											key={s.difficulty}
											data={s}
											row={s.rows.find((r) => r.bossName === name)}
											url={url}
										/>
									))}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</article>
	);
}

// ── Tab ──────────────────────────────────────────────────────

export function RaidLogTab({
	snapshot,
	onOpenCharacter,
	mobile,
}: {
	snapshot: Snapshot;
	onOpenCharacter: (character: CharacterData) => void;
	mobile: boolean;
}) {
	const [damageMetric, setDamageMetric] = useState<DamageMetric>("dps");
	const patches = summaryPatchOptions(snapshot);
	const [patchId, setPatchId] = useState<number | null>(() => patches[0]?.id ?? null);
	const rows = useMemo(() => specRows(snapshot.characters), [snapshot.characters]);
	const encounters = raidEncounters(snapshot);

	return (
		<section className="dash-raid" aria-label="레이드 로그">
			{!mobile && <DesktopRaidToc characters={snapshot.characters} />}

			<div className="dash-toolbar" id="raid-summary">
				<h2>레이드 요약</h2>
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
							aria-label="요약 종합점수 패치"
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
				</div>
			</div>
			{!snapshot.raidMetricSchema?.supported.includes("bossdps") && (
				<p className="dash-callout">
					우두머리 피해 지표의 공식 지원 확인 대기 중입니다. 새 수집은 미조회로 표시하고, 이전
					데이터가 있으면 시각과 함께 보존합니다.
				</p>
			)}

			{ROLE_ORDER.map((role) => {
				const roleRows = rows.filter((row) => row.role === role);
				return roleRows.length ? (
					<SummaryTable
						key={role}
						snapshot={snapshot}
						rows={roleRows}
						role={role}
						damageMetric={damageMetric}
						patchId={patchId}
					/>
				) : null;
			})}
			<div className="dash-details-row">
				<PatchHistory snapshot={snapshot} damageMetric={damageMetric} />
				<AllStarsHelp />
			</div>

			<div className="dash-toolbar dash-section-gap">
				<h2>보스별 기록</h2>
				<span className="dash-toolbar-hint">
					최고 백분위를 누르면 해당 보스의 WCL 기록이 열립니다
				</span>
			</div>
			<nav className="dash-char-nav" aria-label="캐릭터 보스별 기록 바로가기">
				{snapshot.characters.map((character, index) => (
					<a
						key={character.name}
						href={`#raid-character-${index}`}
						style={{ color: CLASS_COLORS[character.class] }}
					>
						{character.name}
					</a>
				))}
			</nav>
			{snapshot.characters.map((character, index) => (
				<section
					key={character.name}
					id={`raid-character-${index}`}
					className="dash-raid-character"
					aria-label={`${character.name} 보스별 기록`}
				>
					{rows
						.filter((row) => row.characterIndex === index)
						.map((row) => (
							<SpecBossCard
								key={row.key}
								snapshot={snapshot}
								row={row}
								damageMetric={damageMetric}
								encounters={encounters}
								onOpenCharacter={onOpenCharacter}
							/>
						))}
				</section>
			))}
			<p className="dash-note">
				요약 값은 WCL 백분위 평균, 종합 점수·순위는 선택한 패치의 All Stars 값입니다. 보스 표의
				처치는 기록된 처치 횟수, 초당 피해량·치유량은 해당 보스의 최고 기록입니다.
				미처치·미조회·조회 실패는 서로 다른 상태입니다.
			</p>
		</section>
	);
}
