import { formatNumber } from "../../lib/format.js";
import { regionLabel } from "../../lib/ko.js";

/**
 * Shows the character's M+ score vs the EU Keystone Hero 1% title cutoff.
 * Displays both numbers and a clear above/below indicator.
 */
export function TitleCutoffIndicator({
	yourScore,
	cutoff,
	region = "eu",
}: {
	yourScore: number;
	cutoff: number;
	region?: "eu" | "kr";
}) {
	const isAbove = yourScore >= cutoff;
	const diff = Math.abs(yourScore - cutoff);
	const indicator = isAbove ? "▲ 기준보다 높음" : "▼ 기준보다 낮음";

	return (
		<div className="title-cutoff">
			<span className="cutoff-label">점수 / 칭호 기준 비교 · {regionLabel(region)} 상위 1%</span>
			<span className="cutoff-scores">
				{formatNumber(yourScore)} / {formatNumber(cutoff)}
			</span>
			<span
				className={`cutoff-indicator ${isAbove ? "above" : "below"}`}
				aria-label={`${indicator} ${formatNumber(diff)}점`}
			>
				{indicator} {formatNumber(diff)}점
			</span>
		</div>
	);
}
