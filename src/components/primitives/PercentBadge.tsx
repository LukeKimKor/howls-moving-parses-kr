import { parseColorClass } from "../../lib/format.js";

/**
 * Renders a parse percentile as a coloured number only (e.g. "94.1%").
 * The colour tier communicates rank — no text label needed.
 * Colours match WarcraftLogs: orange (≥99%), purple (≥95%), blue (≥75%),
 * green (≥50%), grey (≥25%), dark grey (<25%).
 */
export function PercentBadge({ value }: { value: number }) {
	const colorClass = parseColorClass(value);
	return <span className={`percent-badge ${colorClass}`}>{value.toFixed(1)}%</span>;
}
