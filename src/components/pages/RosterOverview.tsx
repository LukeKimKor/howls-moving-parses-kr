import { type ReactNode, useMemo, useState } from "react";
import { classLabel, specLabel } from "../../lib/ko.js";
import { RAID_METRIC_LABELS } from "../../lib/raid-overview.js";
import { characterProfileUrl } from "../../lib/regions.js";
import {
	type DamageMetric,
	type RosterSortKey,
	type SpecRaidValue,
	average,
	characterIlvl,
	characterMythicPlus,
	maxBest,
	missingRaidLabel,
	readableOnDark,
	sortRoster,
	specRaidValues,
} from "../../lib/roster.js";
import type { CharacterData, Snapshot } from "../../types/snapshot.js";
import { MissingValue } from "../primitives/MissingValue.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
import { CLASS_COLORS, SpecIcon } from "../primitives/SpecIcon.js";

const SORT_LABELS: Record<RosterSortKey, string> = {
	config: "등록 순",
	score: "쐐기 점수",
	ilvl: "아이템 레벨",
	heroic: "영웅 최고 %",
	mythic: "신화 최고 %",
};

function RaidCell({ values }: { values: SpecRaidValue[] }) {
	return (
		<>
			{values.map((v) => (
				<div className="dash-spec-line" key={v.slug} data-spec={v.slug}>
					{v.best === null && v.median === null ? (
						<span className="dash-empty">{missingRaidLabel(v.state)}</span>
					) : (
						<span className="dash-pct-pair">
							{v.best === null ? <MissingValue /> : <RaidPercent value={v.best} />}
							<span className="dash-sep">/</span>
							{v.median === null ? <MissingValue /> : <RaidPercent value={v.median} />}
						</span>
					)}
				</div>
			))}
		</>
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

export function RosterOverview({
	snapshot,
	onOpenCharacter,
}: {
	snapshot: Snapshot;
	onOpenCharacter: (character: CharacterData) => void;
}) {
	const [damageMetric, setDamageMetric] = useState<DamageMetric>("dps");
	const [sortKey, setSortKey] = useState<RosterSortKey>("config");
	const rows = useMemo(
		() => sortRoster(snapshot.characters, sortKey, damageMetric),
		[snapshot.characters, sortKey, damageMetric],
	);

	const scores = snapshot.characters.map((c) => characterMythicPlus(c)?.score ?? null);
	const ilvls = snapshot.characters.map(characterIlvl);
	const topScoreIndex = scores.reduce<number>(
		(best, s, i) => (s !== null && (best < 0 || s > (scores[best] ?? 0)) ? i : best),
		-1,
	);
	const topScoreChar = topScoreIndex >= 0 ? snapshot.characters[topScoreIndex] : undefined;
	const maxScore = Math.max(0, ...scores.filter((s): s is number => s !== null));
	const avgIlvl = average(ilvls);
	const heroicAvg = average(
		snapshot.characters.map((c) => maxBest(specRaidValues(c, "Heroic", damageMetric))),
	);
	const mythicLogged = snapshot.characters.filter(
		(c) => maxBest(specRaidValues(c, "Mythic", damageMetric)) !== null,
	).length;

	const sortHeader = (key: RosterSortKey, label: string, className?: string) => (
		<th scope="col" className={className} aria-sort={sortKey === key ? "descending" : "none"}>
			<button
				type="button"
				className="dash-sort"
				aria-pressed={sortKey === key}
				onClick={() => setSortKey(sortKey === key ? "config" : key)}
			>
				{label}
				<span aria-hidden="true">{sortKey === key ? " ▼" : ""}</span>
			</button>
		</th>
	);

	return (
		<section className="dash-roster" aria-label="전체 캐릭터 종합 현황">
			<div className="dash-kpis">
				<Kpi label="캐릭터" value={`${snapshot.characters.length}개`} sub="한국 아즈샤라" />
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
					sub={RAID_METRIC_LABELS[damageMetric]}
				/>
				<Kpi
					label="신화 기록 보유"
					value={`${mythicLogged} / ${snapshot.characters.length}`}
					sub="WCL 신화 백분위 있음"
				/>
			</div>

			<div className="dash-toolbar">
				<h2>캐릭터별 현황</h2>
				<div className="dash-toolbar-controls">
					<fieldset className="dash-segment" aria-label="레이드 피해 지표">
						{(["dps", "bossdps"] as const).map((metric) => (
							<button
								key={metric}
								type="button"
								aria-pressed={damageMetric === metric}
								onClick={() => setDamageMetric(metric)}
							>
								{RAID_METRIC_LABELS[metric]}
							</button>
						))}
					</fieldset>
					<label className="dash-sort-select">
						정렬
						<select
							aria-label="종합 현황 정렬"
							value={sortKey}
							onChange={(event) => setSortKey(event.target.value as RosterSortKey)}
						>
							{(Object.keys(SORT_LABELS) as RosterSortKey[]).map((key) => (
								<option key={key} value={key}>
									{SORT_LABELS[key]}
								</option>
							))}
						</select>
					</label>
				</div>
			</div>

			<div className="dash-table-scroll">
				<table className="dash-table" aria-label="캐릭터별 아이템 레벨, 쐐기 점수, 레이드 백분위">
					<thead>
						<tr>
							<th scope="col" className="dash-col-char">
								캐릭터
							</th>
							{sortHeader("ilvl", "템렙", "dash-num")}
							{sortHeader("score", "쐐기 점수", "dash-col-score")}
							{sortHeader("heroic", "영웅 최고 / 중앙", "dash-col-raid dash-heroic")}
							{sortHeader("mythic", "신화 최고 / 중앙", "dash-col-raid dash-mythic")}
							<th scope="col" className="dash-col-links">
								<span className="sr-only">바로가기</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((character) => {
							const mplus = characterMythicPlus(character);
							const ilvl = characterIlvl(character);
							const realm = character.realmSlug ?? character.realm;
							return (
								<tr key={character.name} data-roster-character={character.name}>
									<th scope="row" className="dash-col-char">
										<div className="dash-char-cell">
											<span
												className="dash-class-bar"
												aria-hidden="true"
												style={{ background: CLASS_COLORS[character.class] }}
											/>
											<div className="dash-char-text">
												<button
													type="button"
													className="dash-char-name"
													style={{ color: CLASS_COLORS[character.class] }}
													onClick={() => onOpenCharacter(character)}
													title="쐐기·장비·특성 상세 보기"
												>
													{character.name}
												</button>
												<span className="dash-char-specs">
													{character.specOrder.map((slug) => {
														const spec = character.specs[slug];
														if (!spec) return null;
														return (
															<span key={slug} className="dash-spec-chip">
																<SpecIcon className={character.class} specName={spec.specName} />
																{specLabel(spec.specName, character.class)}
															</span>
														);
													})}
													<span className="dash-class-label">{classLabel(character.class)}</span>
												</span>
											</div>
										</div>
									</th>
									<td className="dash-num" data-label="템렙">
										{ilvl === null ? <MissingValue label="아이템 레벨 미확인" /> : ilvl.toFixed(1)}
									</td>
									<td className="dash-col-score" data-label="쐐기 점수">
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
												<small>서버 {mplus.realmRank.toLocaleString("ko-KR")}위</small>
											</div>
										) : (
											<MissingValue label="쐐기 점수 미확인" />
										)}
									</td>
									<td className="dash-col-raid dash-heroic" data-label="영웅 최고 / 중앙">
										<RaidCell values={specRaidValues(character, "Heroic", damageMetric)} />
									</td>
									<td className="dash-col-raid dash-mythic" data-label="신화 최고 / 중앙">
										<RaidCell values={specRaidValues(character, "Mythic", damageMetric)} />
									</td>
									<td className="dash-col-links">
										<a
											href={characterProfileUrl("wcl", character.region, realm, character.name)}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={`${character.name} WarcraftLogs`}
										>
											WCL
										</a>
										<a
											href={characterProfileUrl("rio", character.region, realm, character.name)}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={`${character.name} Raider.IO`}
										>
											RIO
										</a>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="dash-note">
				백분위는 WCL 요약(최고 / 중앙값)이며 힐러는 치유량 기준입니다. 쐐기 점수·템렙은 캐릭터 전체
				값(Raider.IO)입니다. 두 전문화를 추적하는 캐릭터는 전문화별로 나란히 표시합니다. 캐릭터
				이름을 누르면 쐐기·장비·특성 상세로 이동합니다.
			</p>
		</section>
	);
}
