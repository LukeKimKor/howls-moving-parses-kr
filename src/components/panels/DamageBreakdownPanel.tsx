import type { DamageSource } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { EmptyState } from "../primitives/EmptyState.js";
import { MeterRow } from "../primitives/MeterRow.js";

/**
 * Renders the Damage Breakdown section: top 5 abilities as a CSS-only bar chart.
 */
export function DamageBreakdownPanel({
	breakdown,
}: {
	breakdown: DamageSource[];
}) {
	return (
		<Card>
			<Card.Header>Damage Breakdown</Card.Header>
			<Card.Body>
				{breakdown.length === 0 ? (
					<EmptyState message="No damage breakdown data available." />
				) : (
					<div className="meter-chart">
						{breakdown.slice(0, 5).map((source) => (
							<MeterRow key={source.name} label={source.name} value={source.percentOfTotal} />
						))}
					</div>
				)}
			</Card.Body>
		</Card>
	);
}
