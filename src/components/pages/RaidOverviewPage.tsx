import { type CSSProperties, useEffect, useState } from "react";
import { ALL_SPECS } from "../../data/specs.js";
import { scopedAllStars } from "../../lib/all-stars.js";
import { formatClearTime, formatNumber } from "../../lib/format.js";
import {
	bossGroup,
	difficultyLabel,
	gameName,
	raidGroups,
	rateLabel,
	specLabel,
} from "../../lib/ko.js";
import { RAID_METRIC_LABELS, raidEncounters, raidSection } from "../../lib/raid-overview.js";
import { kstTime, nextScheduledAt, raidLastSuccess } from "../../lib/refresh-time.js";
import { characterProfileUrl } from "../../lib/regions.js";
import type {
	CharacterData,
	CharacterSpecData,
	RaidDifficultyData,
	RaidMetric,
	Snapshot,
} from "../../types/snapshot.js";
import { NewBuildBanner } from "../chrome/NewBuildBanner.js";
import { AllStarsSummary } from "../primitives/AllStarsSummary.js";
import { CollectionNotice } from "../primitives/CollectionNotice.js";
import { MissingValue, blankTablePlaceholders } from "../primitives/MissingValue.js";
import { RaidPercent as PercentBadge } from "../primitives/RaidPercent.js";
import { CLASS_COLORS, SpecIcon } from "../primitives/SpecIcon.js";
import { DesktopRaidToc } from "./DesktopRaidToc.js";
import { MobileRaidOverview } from "./MobileRaidOverview.js";
import { RaidSummaryTable } from "./RaidSummaryTable.js";

const amount = (value: number | null) =>
	value === null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const points = (value: number | null) =>
	value === null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

function RaidTable({
	data,
	character,
	spec,
	snapshot,
}: {
	data: RaidDifficultyData;
	character: CharacterData;
	spec: CharacterSpecData;
	snapshot: Snapshot;
}) {
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
	return (
		<section
			className={`raid-metric-panel raid-${data.difficulty.toLowerCase()}`}
			aria-label={`${character.name} ${specLabel(spec.specName, character.class)} ${difficultyLabel(data.difficulty)} ${RAID_METRIC_LABELS[data.metric]}`}
		>
			<div className="raid-metric-title">
				<h4>
					{data.difficulty === "Heroic" ? "영웅" : "신화"} · {RAID_METRIC_LABELS[data.metric]}
				</h4>
				<a href={url.href} target="_blank" rel="noopener noreferrer">
					WCL 원본 ↗
				</a>
			</div>
			<div className="raid-summary-stats">
				<div>
					<span>최고 백분위 평균</span>
					<strong>
						{data.summary.bestPerformanceAverage === null ? (
							"—"
						) : (
							<PercentBadge value={data.summary.bestPerformanceAverage} />
						)}
					</strong>
				</div>
				<div>
					<span>중앙값 백분위 평균</span>
					<strong>
						{data.summary.medianPerformanceAverage === null ? (
							"—"
						) : (
							<PercentBadge value={data.summary.medianPerformanceAverage} />
						)}
					</strong>
				</div>
				<div>
					<span>처치 기록 합계*</span>
					<strong>
						{data.summary.killsLogged === null ? "—" : formatNumber(data.summary.killsLogged)}
					</strong>
				</div>
			</div>
			<div className="raid-stars-slot">
				<AllStarsSummary
					data={data}
					specName={spec.specName}
					zoneId={snapshot.raid?.id}
					patchMetadata={snapshot.raidPatchMetadata}
				/>
			</div>
			<div className="raid-status-slot">
				<CollectionNotice label={RAID_METRIC_LABELS[data.metric]} status={data.collection} />
			</div>
			<section
				className="raid-table-scroll"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: This overflow region must receive keyboard focus for horizontal scrolling.
				tabIndex={0}
				aria-label={`${character.name} ${difficultyLabel(data.difficulty)} ${RAID_METRIC_LABELS[data.metric]} 우두머리 표`}
			>
				<table className="raid-performance-table">
					<thead>
						<tr>
							<th scope="col" rowSpan={2}>
								우두머리
							</th>
							<th scope="col" rowSpan={2}>
								최고 백분위
							</th>
							<th scope="col" rowSpan={2}>
								최고 {rateLabel(data.metric)}
							</th>
							<th scope="col" rowSpan={2}>
								처치 수
							</th>
							<th scope="col" rowSpan={2}>
								최단 시간
							</th>
							<th scope="col" rowSpan={2}>
								중앙값 백분위
							</th>
							<th scope="colgroup" colSpan={2}>
								보스 점수 · 순위
							</th>
						</tr>
						<tr>
							<th scope="col">점수</th>
							<th scope="col">순위</th>
						</tr>
					</thead>
					<tbody>
						{data.rows.map((row) => {
							const bossUrl = new URL(url);
							if (row.encounterId > 0) bossUrl.searchParams.set("boss", String(row.encounterId));
							return (
								<tr key={row.bossName} className={`raid-row-${row.state}`}>
									<th scope="row">
										<a href={bossUrl.href} target="_blank" rel="noopener noreferrer">
											<span className="raid-boss-name">
												{gameName(row.bossName)}
												{bossGroup(row.bossName) && bossGroup(row.bossName) !== "맹독 심연" && (
													<small className="boss-raid-origin">{bossGroup(row.bossName)}</small>
												)}
											</span>
										</a>
										{row.state === "unavailable" && (
											<small>
												{data.collection.state === "failed" || data.collection.state === "partial"
													? "조회 실패"
													: data.collection.state === "empty"
														? "공개 기록 없음"
														: "통계 미조회"}
											</small>
										)}
									</th>
									<td>
										{row.bestPercent === null ? (
											<MissingValue />
										) : (
											<>
												<PercentBadge value={row.bestPercent} />
												{row.specName && (
													<SpecIcon className={character.class} specName={row.specName} />
												)}
											</>
										)}
									</td>
									<td>{blankTablePlaceholders(amount(row.bestAmount))}</td>
									<td>{row.kills === null ? <MissingValue /> : formatNumber(row.kills)}</td>
									<td>
										{row.fastestKillMs && row.fastestKillMs > 0 ? (
											formatClearTime(row.fastestKillMs)
										) : (
											<MissingValue />
										)}
									</td>
									<td>
										{row.medianPercent === null ? (
											<MissingValue />
										) : (
											<PercentBadge value={row.medianPercent} />
										)}
									</td>
									<td className="boss-all-stars">
										{blankTablePlaceholders(points(row.allStarPoints))}
									</td>
									<td className="boss-all-stars">
										{row.allStarRank === null ? <MissingValue /> : formatNumber(row.allStarRank)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{!data.rows.length && (
					<p className="raid-no-bosses">보스 목록을 아직 조회하지 않았습니다.</p>
				)}
			</section>
		</section>
	);
}

export function RaidOverviewPage({
	snapshot,
	onOpenCharacter,
	initialCharacterName,
	embedded = false,
}: {
	snapshot: Snapshot;
	onOpenCharacter: (character: CharacterData) => void;
	initialCharacterName?: string;
	/** Inside the tabbed dashboard: the shell owns the header, notices and footer. */
	embedded?: boolean;
}) {
	const encounters = raidEncounters(snapshot);
	const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
	useEffect(() => {
		const media = window.matchMedia("(max-width: 767px)");
		const update = () => setMobile(media.matches);
		media.addEventListener("change", update);
		update();
		return () => media.removeEventListener("change", update);
	}, []);
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	const lastSuccess = raidLastSuccess(snapshot);
	const nextRun = snapshot.refreshSchedule?.enabled
		? nextScheduledAt(snapshot.refreshSchedule.utcHours, now)
		: undefined;
	const [newBuild, setNewBuild] = useState(false);
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		const handler = (event: MessageEvent) => {
			if (event.data?.type === "NEW_BUILD_AVAILABLE") setNewBuild(true);
		};
		navigator.serviceWorker.addEventListener("message", handler);
		return () => navigator.serviceWorker.removeEventListener("message", handler);
	}, []);
	const body = (
		<>
			{!snapshot.raidMetricSchema?.supported.includes("bossdps") && (
				<p className="raid-schema-notice">
					우두머리 피해 지표의 공식 지원 확인 대기 · 새 수집은 미조회로 표시하며, 이전 데이터가
					있으면 시각과 함께 보존합니다.
				</p>
			)}
			{mobile ? (
				<MobileRaidOverview
					snapshot={snapshot}
					onOpenCharacter={onOpenCharacter}
					initialCharacterName={initialCharacterName}
				/>
			) : (
				<>
					<nav className="raid-character-nav" aria-label="캐릭터 성적 바로가기">
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
					<RaidSummaryTable snapshot={snapshot} />
					<p className="raid-reading-note">
						등록된 전문화 · 현재 WCL 기본 집계 구간 기준입니다. 최고·중앙값은 순위 백분위이고, 최고
						초당 피해량·치유량은 실제 초당 수치입니다. 요약은 WCL의 백분위 평균을 그대로 표시합니다.
						*처치 기록 합계는 우두머리별 처치 수를 합친 값입니다. 표의 빈칸은 미확인, 0은 확인된 값
						0을 뜻합니다.
					</p>
					{snapshot.characters.map((character, index) => (
						<section
							id={`raid-character-${index}`}
							key={character.name}
							className="raid-character-section"
							aria-labelledby={`raid-character-title-${index}`}
						>
							<header className="raid-character-header">
								<div>
									<h2
										id={`raid-character-title-${index}`}
										style={{ color: CLASS_COLORS[character.class] }}
									>
										{character.name}
									</h2>
									<span>{character.realm}</span>
									{character.mainSpecPending && (
										<small>주 전문화 미확정 · 파멸 / 포식 동시 추적</small>
									)}
								</div>
								<button type="button" onClick={() => onOpenCharacter(character)}>
									쐐기·장비·특성·메타 상세 ↗
								</button>
							</header>
							{character.specOrder.map((slug) => {
								const spec = character.specs[slug];
								if (!spec) return null;
								const healer = ALL_SPECS.find((s) => s.specSlug === slug)?.role === "healer";
								const metrics: RaidMetric[] = healer ? ["hps"] : ["dps", "bossdps"];
								return (
									<div className="raid-spec-section" key={slug}>
										<h3>
											<SpecIcon className={character.class} specName={spec.specName} />{" "}
											<small>{healer ? "치유량" : "전체 피해 · 우두머리 피해"}</small>
										</h3>
										{metrics.map((metric) => (
											<div
												className="raid-difficulty-grid"
												key={metric}
												style={
													{
														"--all-stars-rows": Math.max(
															1,
															...(["Heroic", "Mythic"] as const).map((difficulty) =>
																Math.ceil(
																	scopedAllStars(
																		spec.raidPerformance?.[metric]?.[difficulty],
																		spec.specName,
																	).length / 2,
																),
															),
														),
													} as CSSProperties
												}
											>
												{(["Heroic", "Mythic"] as const).map((difficulty) => (
													<div className="raid-difficulty-column" key={difficulty}>
														<h3 className="raid-difficulty-title">
															{difficulty === "Heroic" ? "영웅" : "신화"}{" "}
														</h3>
														{
															<RaidTable
																key={metric}
																data={raidSection(
																	spec,
																	metric,
																	difficulty,
																	encounters,
																	snapshot.generatedAt,
																)}
																character={character}
																spec={spec}
																snapshot={snapshot}
															/>
														}
													</div>
												))}
											</div>
										))}
									</div>
								);
							})}
						</section>
					))}
				</>
			)}
		</>
	);
	if (embedded)
		return (
			<div className="raid-embedded">
				{!mobile && <DesktopRaidToc characters={snapshot.characters} />}
				{body}
			</div>
		);
	return (
		<main className="raid-overview" data-theme="dark">
			{!mobile && <DesktopRaidToc characters={snapshot.characters} />}
			<header className="raid-overview-header">
				<div>
					<p className="raid-eyebrow">내캐릭 로그관리 · 한국 아즈샤라</p>
					<h1>와우 대시보드</h1>
					<p>
						{raidGroups(encounters.map((e) => e.name)).length > 1
							? "시즌 통합 공격대"
							: gameName(snapshot.raid?.name ?? "기존 레이드 로그")}{" "}
						· {snapshot.characters.length}개 캐릭터 · 영웅 &amp; 신화
					</p>
					{raidGroups(encounters.map((e) => e.name)).length > 1 && (
						<p className="raid-scope-note">
							{raidGroups(encounters.map((e) => e.name)).join(" · ")}
						</p>
					)}
				</div>
				<details className="raid-refresh-details" open={!mobile}>
					<summary>수집 시각 · 갱신 일정</summary>
					<div className="raid-refresh-info">
						<small>
							레이드 최근 수집 성공 {lastSuccess ? `${kstTime(lastSuccess)} KST` : "미확인"}
						</small>
						<small>최근 실행 {kstTime(snapshot.generatedAt)} KST</small>
						<small>
							{snapshot.refreshSchedule?.enabled
								? `자동 갱신 하루 ${snapshot.refreshSchedule.utcHours.length}회 · ${snapshot.refreshSchedule.utcHours.map((h) => `${String((h + 9) % 24).padStart(2, "0")}:00`).join(" / ")} KST`
								: "자동 갱신 일정 확인 대기"}
						</small>
						<small>
							다음 실행 예정 {nextRun ? `${kstTime(nextRun)} KST` : "미확인"} · 완료 시각은 수집
							상황에 따라 달라집니다.
						</small>
						{snapshot.refreshRuntime?.nextEligibleAt && (
							<small>WCL 재시도 가능 {kstTime(snapshot.refreshRuntime.nextEligibleAt)} KST</small>
						)}
						<small>레이드 캐시 4시간 · 상세 12시간 · 메타/영역 정보 24시간</small>
					</div>
				</details>
			</header>
			<NewBuildBanner
				visible={newBuild}
				onRefresh={() => window.location.reload()}
				onDismiss={() => setNewBuild(false)}
			/>
			{mobile && !!snapshot.warnings?.length ? (
				<details className="mobile-data-notices">
					<summary>수집 알림 {snapshot.warnings.length}개</summary>
					{snapshot.warnings.map((warning) => (
						<output className="data-notice" key={warning}>
							{warning}
						</output>
					))}
				</details>
			) : (
				snapshot.warnings?.map((warning) => (
					<output className="data-notice" key={warning}>
						{warning}
					</output>
				))
			)}
			{body}
			<footer className="raid-overview-footer">
				실제 WCL 공개 로그 스냅샷 · 원본 기능 제작 howlsome · 메타 상세는 별도 갱신
			</footer>
		</main>
	);
}
