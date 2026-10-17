import { raidPatchLabel, scopedAllStars, starPoints, starRank } from "../../lib/all-stars.js";
import { RAID_METRIC_LABELS } from "../../lib/raid-overview.js";
import type { RaidDifficultyData } from "../../types/snapshot.js";
import { blankTablePlaceholders } from "./MissingValue.js";

export function AllStarsSummary({
	data,
	specName,
	zoneId,
}: {
	data: RaidDifficultyData;
	specName: string;
	zoneId?: number;
}) {
	const entries = scopedAllStars(data, specName);
	return (
		<div
			className="raid-all-stars"
			aria-label={`${RAID_METRIC_LABELS[data.metric]} 공격대 종합 점수와 순위`}
		>
			<div className="all-stars-heading">공격대 종합 · All Stars</div>
			{entries.length ? (
				entries.map((star, index) => (
					<div
						className="all-stars-entry"
						data-partition={star.partition}
						key={`${star.spec}-${star.partition}-${index}`}
					>
						<span className="all-stars-patch">{raidPatchLabel(zoneId, star.partition)}</span>
						<dl>
							<div>
								<dt>종합 점수</dt>
								<dd>{blankTablePlaceholders(starPoints(star.points))}</dd>
							</div>
							<div>
								<dt>WCL 순위</dt>
								<dd>{blankTablePlaceholders(starRank(star.rank))}</dd>
							</div>
						</dl>
					</div>
				))
			) : (
				<p className="all-stars-empty">종합 점수·순위 미제공</p>
			)}
		</div>
	);
}

export function AllStarsHelp() {
	return (
		<details className="all-stars-help">
			<summary>종합 점수 · 순위 · 패치 기준 안내</summary>
			<p>
				All Stars는 WCL이 계산한 공격대 종합 점수입니다. 백분위나 초당 피해량·치유량과는 다릅니다.
				점수와 순위는 같은 전문화·난이도·지표·패치의 한 쌍으로 표시하며 서로 합산하지 않습니다.
			</p>
			<p>
				밸런스 변경으로 비교 기준이 달라지면 WCL이 집계 구간을 나눕니다. 확인된 패치명만 표시하며,
				현재 캐시에 패치 이름이 없는 기록은 ‘패치명 미확인’으로 표시합니다. 보스별 점수의 패치
				범위도 캐시에서 확인되지 않았습니다.
			</p>
			<p>
				상단 요약의 종합 점수·순위는 공격 전문화의 전체 피해, 치유 전문화의 치유량 기준입니다.
				우두머리 피해 기준 종합 점수와 보스별 점수는 아래 각 성적표에서 확인할 수 있습니다. 표의
				빈칸은 미확인, 0은 확인된 값 0입니다.
			</p>
			<a
				href="https://www.archon.gg/wow/articles/help/rankings-and-parses"
				target="_blank"
				rel="noopener noreferrer"
			>
				WCL 점수·순위 안내 ↗
			</a>
		</details>
	);
}
