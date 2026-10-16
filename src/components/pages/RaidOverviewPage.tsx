import { useEffect, useState } from "react";
import { ALL_SPECS } from "../../data/specs.js";
import { formatClearTime, formatDateUtc, formatNumber } from "../../lib/format.js";
import {
	RAID_METRIC_LABELS,
	SPEC_LABELS,
	raidEncounters,
	raidSection,
} from "../../lib/raid-overview.js";
import { characterProfileUrl } from "../../lib/regions.js";
import type {
	CharacterData,
	CharacterSpecData,
	RaidDifficultyData,
	RaidMetric,
	Snapshot,
} from "../../types/snapshot.js";
import { NewBuildBanner } from "../chrome/NewBuildBanner.js";
import { CollectionNotice } from "../primitives/CollectionNotice.js";
import { RaidPercent as PercentBadge } from "../primitives/RaidPercent.js";

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
			className="raid-metric-panel"
			aria-label={`${character.name} ${spec.specName} ${data.difficulty} ${RAID_METRIC_LABELS[data.metric]}`}
		>
			<div className="raid-metric-title">
				<h4>{RAID_METRIC_LABELS[data.metric]}</h4>
				<a href={url.href} target="_blank" rel="noopener noreferrer">
					WCL 원본 ↗
				</a>
			</div>
			<div className="raid-summary-stats">
				<div>
					<span>Best Perf. Avg</span>
					<strong>
						{data.summary.bestPerformanceAverage === null ? (
							"—"
						) : (
							<PercentBadge value={data.summary.bestPerformanceAverage} />
						)}
					</strong>
				</div>
				<div>
					<span>Median Perf. Avg</span>
					<strong>
						{data.summary.medianPerformanceAverage === null ? (
							"—"
						) : (
							<PercentBadge value={data.summary.medianPerformanceAverage} />
						)}
					</strong>
				</div>
				<div>
					<span>Kills Logged*</span>
					<strong>
						{data.summary.killsLogged === null ? "—" : formatNumber(data.summary.killsLogged)}
					</strong>
				</div>
			</div>
			{data.summary.allStars.length > 0 && (
				<div className="raid-all-stars">
					{data.summary.allStars.map((star) => (
						<span key={`${star.spec}-${star.partition}-${star.points}-${star.rank}`}>
							{SPEC_LABELS[star.spec] ?? star.spec} All Star Points{" "}
							<strong>{points(star.points)}</strong> · Rank{" "}
							{star.rank === null ? "—" : formatNumber(star.rank)}
							{data.summary.allStars.length > 1 &&
								star.partition !== null &&
								star.partition !== undefined &&
								` · 파티션 ${star.partition}`}
						</span>
					))}
				</div>
			)}
			<CollectionNotice label={RAID_METRIC_LABELS[data.metric]} status={data.collection} />
			<section
				className="raid-table-scroll"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: This overflow region must receive keyboard focus for horizontal scrolling.
				tabIndex={0}
				aria-label={`${character.name} ${data.difficulty} ${data.metric} 보스 표`}
			>
				<table className="raid-performance-table">
					<thead>
						<tr>
							<th scope="col" rowSpan={2}>
								Boss
							</th>
							<th scope="col" rowSpan={2}>
								Best %
							</th>
							<th scope="col" rowSpan={2}>
								Highest {data.metric === "hps" ? "HPS" : "DPS"}
							</th>
							<th scope="col" rowSpan={2}>
								Kills
							</th>
							<th scope="col" rowSpan={2}>
								Fastest
							</th>
							<th scope="col" rowSpan={2}>
								Med
							</th>
							<th scope="colgroup" colSpan={2}>
								All Stars
							</th>
						</tr>
						<tr>
							<th scope="col">Points</th>
							<th scope="col">Rank</th>
						</tr>
					</thead>
					<tbody>
						{data.rows.map((row) => {
							const bossUrl = new URL(url);
							if (row.encounterId > 0) bossUrl.searchParams.set("boss", String(row.encounterId));
							const image = snapshot.raid?.encounters.find(
								(e) => e.id === row.encounterId,
							)?.imageUrl;
							return (
								<tr key={row.bossName} className={`raid-row-${row.state}`}>
									<th scope="row">
										<a href={bossUrl.href} target="_blank" rel="noopener noreferrer">
											{image ? (
												<img src={image} alt="" width={26} height={26} loading="lazy" />
											) : (
												<span className="raid-boss-marker" aria-hidden="true">
													◆
												</span>
											)}
											{row.bossName}
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
											"—"
										) : (
											<>
												<PercentBadge value={row.bestPercent} />
												{row.specName && (
													<small className="raid-spec-label">
														{SPEC_LABELS[row.specName] ?? row.specName}
													</small>
												)}
											</>
										)}
									</td>
									<td>{amount(row.bestAmount)}</td>
									<td>{row.kills === null ? "—" : formatNumber(row.kills)}</td>
									<td>
										{row.fastestKillMs && row.fastestKillMs > 0
											? formatClearTime(row.fastestKillMs)
											: "—"}
									</td>
									<td>
										{row.medianPercent === null ? "—" : <PercentBadge value={row.medianPercent} />}
									</td>
									<td>{points(row.allStarPoints)}</td>
									<td>{row.allStarRank === null ? "—" : formatNumber(row.allStarRank)}</td>
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
}: { snapshot: Snapshot; onOpenCharacter: (character: CharacterData) => void }) {
	const encounters = raidEncounters(snapshot);
	const [newBuild, setNewBuild] = useState(false);
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		const handler = (event: MessageEvent) => {
			if (event.data?.type === "NEW_BUILD_AVAILABLE") setNewBuild(true);
		};
		navigator.serviceWorker.addEventListener("message", handler);
		return () => navigator.serviceWorker.removeEventListener("message", handler);
	}, []);
	return (
		<main className="raid-overview">
			<header className="raid-overview-header">
				<div>
					<p className="raid-eyebrow">HOWL&apos;S MOVING PARSES · KR 아즈샤라</p>
					<h1>전체 캐릭터 레이드 성적</h1>
					<p>
						{snapshot.raid?.name ?? "기존 레이드 로그"} · {snapshot.characters.length}개 캐릭터 ·
						영웅 &amp; 신화
					</p>
				</div>
				<small>수집 시각 {formatDateUtc(snapshot.generatedAt, "kr")}</small>
			</header>
			<NewBuildBanner
				visible={newBuild}
				onRefresh={() => window.location.reload()}
				onDismiss={() => setNewBuild(false)}
			/>
			{snapshot.warnings?.map((warning) => (
				<output className="data-notice" key={warning}>
					{warning}
				</output>
			))}
			{!snapshot.raidMetricSchema?.supported.includes("bossdps") && (
				<p className="raid-schema-notice">
					Damage to Bosses의 공식 스키마 지원 확인 대기 · 새 수집은 미조회로 표시하며, 이전 데이터가
					있으면 시각과 함께 보존합니다.
				</p>
			)}
			<nav className="raid-character-nav" aria-label="캐릭터 성적 바로가기">
				{snapshot.characters.map((character, index) => (
					<a key={character.name} href={`#raid-character-${index}`}>
						{character.name}
					</a>
				))}
			</nav>
			<p className="raid-reading-note">
				등록된 전문화 · 현재 WCL 기본 파티션 기준입니다. Best %와 Med는 WCL 순위 백분위이며 Highest
				DPS/HPS는 초당 수치입니다. 요약 백분위는 WCL 응답을 그대로 표시합니다. *Kills Logged는
				보스별 Kills의 합계입니다. —는 값이 제공되지 않았음을 뜻하며, 미처치는 Kills 0으로
				구분합니다.
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
							<h2 id={`raid-character-title-${index}`}>{character.name}</h2>
							<span>
								{character.realm} · {character.class}
							</span>
							{character.mainSpecPending && <small>주 전문화 미확정 · 파멸 / 포식 동시 추적</small>}
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
									{SPEC_LABELS[spec.specName] ?? spec.specName}{" "}
									<small>{healer ? "Healing" : "Damage · Damage to Bosses"}</small>
								</h3>
								<div className="raid-difficulty-grid">
									{(["Heroic", "Mythic"] as const).map((difficulty) => (
										<div className="raid-difficulty-column" key={difficulty}>
											<h3 className="raid-difficulty-title">
												{difficulty === "Heroic" ? "영웅" : "신화"}{" "}
												<small>{difficulty.toUpperCase()}</small>
											</h3>
											{metrics.map((metric) => (
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
											))}
										</div>
									))}
								</div>
							</div>
						);
					})}
				</section>
			))}
			<footer className="raid-overview-footer">
				실제 WCL 공개 로그 스냅샷 · 원본 기능 제작 howlsome · 메타 상세는 별도 갱신
			</footer>
		</main>
	);
}
