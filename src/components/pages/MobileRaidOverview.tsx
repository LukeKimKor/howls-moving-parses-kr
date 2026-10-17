import { useRef, useState } from "react";
import { ALL_SPECS } from "../../data/specs.js";
import { formatClearTime, formatNumber } from "../../lib/format.js";
import {
	bossGroup,
	difficultyLabel,
	gameName,
	hasSummaryPercent,
	hasValue,
	rateLabel,
	specLabel,
} from "../../lib/ko.js";
import {
	RAID_METRIC_LABELS,
	SPEC_LABELS,
	raidEncounters,
	raidSection,
} from "../../lib/raid-overview.js";
import { kstTime } from "../../lib/refresh-time.js";
import { characterProfileUrl } from "../../lib/regions.js";
import type {
	CharacterData,
	CharacterSpecData,
	RaidDifficulty,
	RaidDifficultyData,
	RaidMetric,
	Snapshot,
} from "../../types/snapshot.js";
import { CollectionNotice } from "../primitives/CollectionNotice.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
import { CLASS_COLORS, SpecIcon } from "../primitives/SpecIcon.js";

const metricLabels: Record<RaidMetric, string> = {
	dps: "전체 피해",
	bossdps: "우두머리 피해",
	hps: "치유량",
};
const isHealer = (slug: string) => ALL_SPECS.find((s) => s.specSlug === slug)?.role === "healer";
const value = (n: number | null) =>
	n === null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const percent = (n: number | null | undefined) => (n == null ? "—" : <RaidPercent value={n} />);

function sourceUrl(
	character: CharacterData,
	spec: CharacterSpecData,
	data: RaidDifficultyData,
	snapshot: Snapshot,
) {
	const url = new URL(
		characterProfileUrl(
			"wcl",
			character.region,
			character.realmSlug ?? character.realm,
			character.name,
		),
	);
	url.searchParams.set("difficulty", data.difficulty === "Heroic" ? "4" : "5");
	url.searchParams.set("metric", data.metric);
	url.searchParams.set("spec", spec.specName);
	if (snapshot.raid?.id) url.searchParams.set("zone", String(snapshot.raid.id));
	return url;
}

function MobilePerformance({
	character,
	spec,
	data,
	snapshot,
}: {
	character: CharacterData;
	spec: CharacterSpecData;
	data: RaidDifficultyData;
	snapshot: Snapshot;
}) {
	const [expanded, setExpanded] = useState<Set<number>>(new Set());
	const allOpen = data.rows.length > 0 && expanded.size === data.rows.length;
	const url = sourceUrl(character, spec, data, snapshot);
	return (
		<section
			className={`mobile-performance raid-${data.difficulty.toLowerCase()}`}
			aria-label={`${character.name} ${specLabel(spec.specName, character.class)} ${difficultyLabel(data.difficulty)} ${RAID_METRIC_LABELS[data.metric]} 모바일 성적`}
		>
			<div className="mobile-performance-heading">
				<h3>
					{data.difficulty === "Heroic" ? "영웅" : "신화"} · {RAID_METRIC_LABELS[data.metric]}
				</h3>
				<a href={url.href} target="_blank" rel="noopener noreferrer">
					WCL 원본 ↗
				</a>
			</div>
			<dl className="mobile-score-summary">
				<div>
					<dt>최고 백분위 평균</dt>
					<dd>{percent(data.summary.bestPerformanceAverage)}</dd>
				</div>
				<div>
					<dt>중앙값 백분위 평균</dt>
					<dd>{percent(data.summary.medianPerformanceAverage)}</dd>
				</div>
				<div>
					<dt>처치 합계*</dt>
					<dd>{value(data.summary.killsLogged)}</dd>
				</div>
			</dl>
			{(data.collection.deferred ||
				data.collection.state === "failed" ||
				data.collection.state === "partial" ||
				data.collection.retainedAt) && (
				<p className="mobile-data-state">
					{data.collection.deferred
						? "갱신 보류"
						: data.collection.state === "failed" || data.collection.state === "partial"
							? "조회 실패"
							: "캐시 재사용"}
					{data.collection.retainedAt
						? ` · 이전 데이터 ${kstTime(data.collection.retainedAt)} KST`
						: " · 기록 유무 미확인"}
				</p>
			)}
			<details className="mobile-collection-details">
				<summary>종합 순위 · 수집 상태</summary>
				<CollectionNotice label={RAID_METRIC_LABELS[data.metric]} status={data.collection} />
				{data.collection.state === "ok" && !data.collection.retainedAt && <p>조회 완료</p>}
				{data.summary.allStars.length ? (
					data.summary.allStars.map((star, index) => (
						<p key={`${star.spec}-${star.partition}-${index}`}>
							{(hasValue(star.points) || hasValue(star.rank)) && (
								<SpecIcon className={character.class} specName={star.spec} />
							)}{" "}
							점수 {value(star.points)} · 순위 {value(star.rank)}
							{star.partition != null ? ` · 파티션 ${star.partition}` : ""}
						</p>
					))
				) : (
					<p>종합 순위 값 미제공</p>
				)}
			</details>
			<div className="mobile-boss-toolbar">
				<span>보스를 누르면 상세 수치가 펼쳐집니다.</span>
				<button
					type="button"
					onClick={() => setExpanded(allOpen ? new Set() : new Set(data.rows.map((_, i) => i)))}
				>
					{allOpen ? "모두 접기" : "모두 펼치기"}
				</button>
			</div>
			<div className="mobile-boss-list">
				{data.rows.map((row, index) => {
					const open = expanded.has(index);
					const bossUrl = new URL(url);
					if (row.encounterId > 0) bossUrl.searchParams.set("boss", String(row.encounterId));
					const id = `mobile-boss-${index}`;
					const state =
						row.state === "no-kills"
							? "미처치 · 처치 수 0"
							: row.state === "unavailable"
								? data.collection.deferred
									? "갱신 보류"
									: data.collection.state === "failed" || data.collection.state === "partial"
										? "조회 실패"
										: data.collection.state === "empty"
											? "공개 기록 없음"
											: "통계 미조회"
								: undefined;
					return (
						<article className={`mobile-boss-card mobile-row-${row.state}`} key={row.bossName}>
							<button
								type="button"
								className="mobile-boss-toggle"
								aria-expanded={open}
								aria-controls={id}
								onClick={() =>
									setExpanded((previous) => {
										const next = new Set(previous);
										if (next.has(index)) next.delete(index);
										else next.add(index);
										return next;
									})
								}
							>
								<span className="mobile-boss-name">
									{gameName(row.bossName)}
									{bossGroup(row.bossName) && bossGroup(row.bossName) !== "맹독 심연" && (
										<small>{bossGroup(row.bossName)}</small>
									)}
									<small>{state ?? ""}</small>
								</span>
								<span className="mobile-boss-percent">
									<span>
										<small>최고</small>
										{percent(row.bestPercent)}
									</span>
									<span>
										<small>중앙값</small>
										{percent(row.medianPercent)}
									</span>
								</span>
								<span aria-hidden="true" className="mobile-expand-mark">
									{open ? "−" : "+"}
								</span>
							</button>
							<div id={id} className="mobile-boss-extra" hidden={!open}>
								<dl>
									<div>
										<dt>최고 {rateLabel(data.metric)}</dt>
										<dd>{value(row.bestAmount)}</dd>
									</div>
									<div>
										<dt>처치 수</dt>
										<dd>{value(row.kills)}</dd>
									</div>
									<div>
										<dt>최단 시간</dt>
										<dd>
											{row.fastestKillMs && row.fastestKillMs > 0
												? formatClearTime(row.fastestKillMs)
												: "—"}
										</dd>
									</div>
									<div>
										<dt>종합 점수</dt>
										<dd>{value(row.allStarPoints)}</dd>
									</div>
									<div>
										<dt>종합 순위</dt>
										<dd>{row.allStarRank === null ? "—" : formatNumber(row.allStarRank)}</dd>
									</div>
									<div>
										<dt>전문화</dt>
										<dd>
											{row.specName &&
											(hasValue(row.bestPercent) || hasValue(row.medianPercent)) ? (
												<SpecIcon className={character.class} specName={row.specName} />
											) : (
												"—"
											)}
										</dd>
									</div>
								</dl>
								<a href={bossUrl.href} target="_blank" rel="noopener noreferrer">
									이 보스 WCL 원본 ↗
								</a>
							</div>
						</article>
					);
				})}
			</div>
			{!data.rows.length && <p>보스 목록 미조회</p>}
			<p className="mobile-reading-note">
				최고 / 중앙값은 순위 백분위 · —는 미확인, 0은 확인된 값 · *처치는 우두머리별 합계
			</p>
		</section>
	);
}

export function MobileRaidOverview({
	snapshot,
	onOpenCharacter,
	initialCharacterName,
}: {
	snapshot: Snapshot;
	onOpenCharacter: (character: CharacterData) => void;
	initialCharacterName?: string;
}) {
	const [characterIndex, setCharacterIndex] = useState(() =>
		Math.max(
			0,
			snapshot.characters.findIndex((c) =>
				initialCharacterName ? c.name === initialCharacterName : c.isDefault,
			),
		),
	);
	const [chosenSpec, setChosenSpec] = useState("");
	const [difficulty, setDifficulty] = useState<RaidDifficulty>("Heroic");
	const [damageMetric, setDamageMetric] = useState<"dps" | "bossdps">("dps");
	const [view, setView] = useState<"character" | "roster">("character");
	const controlsRef = useRef<HTMLDivElement>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const showResults = () =>
		requestAnimationFrame(() => {
			const target = resultsRef.current;
			if (!target) return;
			target.style.scrollMarginTop = `${(controlsRef.current?.getBoundingClientRect().height ?? 260) + 8}px`;
			target.scrollIntoView?.({ block: "start" });
		});
	const character = snapshot.characters[characterIndex] ?? snapshot.characters[0];
	if (!character) return <p>등록된 캐릭터가 없습니다.</p>;
	const slug = character.specOrder.includes(chosenSpec)
		? chosenSpec
		: (character.specOrder[0] ?? "");
	const spec = character.specs[slug];
	if (!spec) return <p>전문화 설정을 확인해주세요.</p>;
	const metric: RaidMetric = isHealer(slug) ? "hps" : damageMetric;
	const encounters = raidEncounters(snapshot);
	const selectCharacter = (index: number) => {
		setCharacterIndex(index);
		setChosenSpec("");
		setView("character");
		showResults();
	};
	return (
		<div className="mobile-raid-overview">
			<div className="mobile-raid-controls" ref={controlsRef}>
				<fieldset className="mobile-view-tabs" aria-label="모바일 보기">
					<button
						type="button"
						aria-pressed={view === "character"}
						onClick={() => {
							setView("character");
							showResults();
						}}
					>
						캐릭터 성적
					</button>
					<button
						type="button"
						aria-pressed={view === "roster"}
						onClick={() => {
							setView("roster");
							showResults();
						}}
					>
						전체 요약 {snapshot.characters.length}
					</button>
				</fieldset>
				<div className="mobile-character-picker">
					<button
						type="button"
						aria-label="이전 캐릭터"
						disabled={characterIndex === 0}
						onClick={() => selectCharacter(characterIndex - 1)}
					>
						‹
					</button>
					<label>
						캐릭터{" "}
						<small>
							{characterIndex + 1}/{snapshot.characters.length}
						</small>
						<select
							value={characterIndex}
							onChange={(event) => selectCharacter(Number(event.target.value))}
						>
							{snapshot.characters.map((c, index) => (
								<option key={c.name} value={index}>
									{c.name}
								</option>
							))}
						</select>
					</label>
					<button
						type="button"
						aria-label="다음 캐릭터"
						disabled={characterIndex >= snapshot.characters.length - 1}
						onClick={() => selectCharacter(characterIndex + 1)}
					>
						›
					</button>
				</div>
				<fieldset className="mobile-difficulty-tabs" aria-label="난이도">
					{(["Heroic", "Mythic"] as const).map((d) => (
						<button
							type="button"
							key={d}
							aria-pressed={difficulty === d}
							onClick={() => {
								setDifficulty(d);
								showResults();
							}}
						>
							{d === "Heroic" ? "영웅" : "신화"}
						</button>
					))}
				</fieldset>
				<fieldset className="mobile-metric-tabs" aria-label="성적 지표">
					{view === "character" && isHealer(slug) ? (
						<span className="mobile-healing-label">치유량</span>
					) : (
						(["dps", "bossdps"] as const).map((m) => (
							<button
								type="button"
								key={m}
								aria-pressed={damageMetric === m}
								onClick={() => {
									setDamageMetric(m);
									showResults();
								}}
							>
								{metricLabels[m]}
							</button>
						))
					)}
				</fieldset>
			</div>
			<div className="mobile-results" ref={resultsRef}>
				{view === "roster" ? (
					<section className="mobile-roster" aria-label="모바일 전체 요약">
						<p>
							{difficulty === "Heroic" ? "영웅" : "신화"} · {metricLabels[damageMetric]} · 힐러는
							치유로 표시
						</p>
						<div className="mobile-roster-labels">
							<span>캐릭터 / 전문화</span>
							<span>최고 / 중앙값 백분위</span>
						</div>
						{snapshot.characters.map((c, index) => (
							<article className="mobile-roster-card" key={c.name}>
								<button
									type="button"
									style={{ color: CLASS_COLORS[c.class] }}
									onClick={() => selectCharacter(index)}
								>
									{c.name}
									<span aria-hidden="true">→</span>
								</button>
								{c.specOrder.map((s) => {
									const entry = c.specs[s];
									if (!entry) return null;
									const m: RaidMetric = isHealer(s) ? "hps" : damageMetric;
									const section = raidSection(
										entry,
										m,
										difficulty,
										encounters,
										snapshot.generatedAt,
									);
									return (
										<div className="mobile-roster-spec" key={s}>
											<span>
												{hasSummaryPercent(section.summary) && (
													<SpecIcon className={c.class} specName={entry.specName} />
												)}
												<small>{metricLabels[m]}</small>
											</span>
											<span>
												{percent(section.summary.bestPerformanceAverage)} /{" "}
												{percent(section.summary.medianPerformanceAverage)}
											</span>
										</div>
									);
								})}
							</article>
						))}
					</section>
				) : (
					<>
						<header className="mobile-character-heading">
							<h2 style={{ color: CLASS_COLORS[character.class] }}>{character.name}</h2>
							<span>
								{character.realm} ·{" "}
								<SpecIcon className={character.class} specName={spec.specName} />
							</span>
							{character.mainSpecPending && <p>주 전문화 미확정 · 두 전문화 동시 추적</p>}
						</header>
						{character.specOrder.length > 1 && (
							<fieldset className="mobile-spec-tabs" aria-label="전문화 선택">
								{character.specOrder.map((s) => {
									const entry = character.specs[s];
									return (
										entry && (
											<button
												type="button"
												key={s}
												aria-pressed={slug === s}
												onClick={() => {
													setChosenSpec(s);
													showResults();
												}}
											>
												<SpecIcon className={character.class} specName={entry.specName} />
												{SPEC_LABELS[entry.specName] ?? entry.specName}
											</button>
										)
									);
								})}
							</fieldset>
						)}
						<MobilePerformance
							key={`${character.name}-${slug}-${difficulty}-${metric}`}
							character={character}
							spec={spec}
							data={raidSection(spec, metric, difficulty, encounters, snapshot.generatedAt)}
							snapshot={snapshot}
						/>
						<button
							type="button"
							className="mobile-open-detail"
							onClick={() => onOpenCharacter(character)}
						>
							쐐기·장비·특성·메타 상세 ↗
						</button>
					</>
				)}
			</div>
		</div>
	);
}
