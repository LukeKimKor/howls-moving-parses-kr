import { regionLabel, tierLabelKo } from "../../lib/ko.js";
import type { MythicPlusData } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { EmptyState } from "../primitives/EmptyState.js";

/**
 * Renders the Mythic+ Score panel.
 *
 * Layout:
 * - Header row: "Mythic+ Score" left, coloured score + tier right
 * - Cutoff row: distance from the 1% title cutoff with traffic-light colouring
 *   Green (≥ +300): comfortably ahead
 *   Orange (-300 to +299): near the cutoff
 *   Red (< -300): clearly behind
 */
export function MythicScorePanel({ data }: { data: MythicPlusData | null }) {
	if (!data) {
		return (
			<Card>
				<Card.Header>쐐기 점수</Card.Header>
				<Card.Body>
					<EmptyState message="쐐기 점수 데이터가 없습니다." />
				</Card.Body>
			</Card>
		);
	}

	const scoreDisplay = (
		<span className="header-score" style={{ color: data.scoreColor || undefined }}>
			{data.score.toLocaleString("en-GB")}
			<small className="header-score-tier"> {tierLabelKo(data.scoreTierLabel)}</small>
		</span>
	);

	const showCutoff = data.titleCutoff.score > 0;
	const diff = data.score - data.titleCutoff.score;
	const cutoffClass = diff >= 300 ? "cutoff-ahead" : diff >= -300 ? "cutoff-near" : "cutoff-behind";
	const arrow = diff >= 0 ? "▲" : "▼";

	return (
		<Card>
			<Card.Header right={scoreDisplay}>쐐기 점수</Card.Header>
			<Card.Body>
				<p>캐릭터 전체 시즌 점수{data.season ? ` · ${data.season}` : ""}</p>
				<dl className="rank-summary">
					<dt>서버 순위</dt>
					<dd>{data.realmRank > 0 ? `#${data.realmRank.toLocaleString()}` : "—"}</dd>
					<dt>{regionLabel(data.titleCutoff.region)} 순위</dt>
					<dd>{data.regionRank > 0 ? `#${data.regionRank.toLocaleString()}` : "—"}</dd>
					<dt>세계 순위</dt>
					<dd>{data.worldRank > 0 ? `#${data.worldRank.toLocaleString()}` : "—"}</dd>
				</dl>
				{showCutoff && (
					<div className={`cutoff-row ${cutoffClass}`}>
						<span className="cutoff-row-label">
							{regionLabel(data.titleCutoff.region)} 상위 {data.titleCutoff.percentile}% 점수 기준
						</span>
						<span className="cutoff-row-diff">
							{arrow} {Math.abs(diff).toFixed(1)}점
						</span>
					</div>
				)}
			</Card.Body>
		</Card>
	);
}
