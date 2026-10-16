/**
 * A single row of a damage-breakdown bar chart.
 * Uses a CSS-only horizontal bar (no JS chart library).
 */
export function MeterRow({
	label,
	value,
}: {
	label: string;
	value: number;
}) {
	const pct = Math.min(100, Math.max(0, value));
	return (
		<div className="meter-row" aria-label={`${label}: ${pct.toFixed(1)}%`}>
			<span className="meter-label">{label}</span>
			<div className="meter-bar-container" role="img" aria-hidden="true">
				<div className="meter-bar" style={{ width: `${pct}%` }} />
			</div>
			<span className="meter-value">{pct.toFixed(1)}%</span>
		</div>
	);
}
