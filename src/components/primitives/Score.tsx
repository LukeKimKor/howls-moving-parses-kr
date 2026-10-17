import { tierLabelKo } from "../../lib/ko.js";
/**
 * Displays a single coloured numeric score with a tier label.
 * Color is never the sole indicator — the tier label is always shown.
 */
export function Score({
	value,
	tier,
	color,
}: {
	value: number;
	tier: string;
	color: string;
}) {
	return (
		<div className="score-display">
			<span className="score-value" style={{ color }} aria-label={`점수: ${value}`}>
				{value.toLocaleString("en-GB")}
			</span>
			<span className="score-tier">{tierLabelKo(tier)}</span>
		</div>
	);
}
