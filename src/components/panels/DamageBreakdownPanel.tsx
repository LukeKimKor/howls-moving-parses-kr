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
			<Card.Header>피해량 구성</Card.Header>
			<Card.Body>
				{breakdown.length === 0 ? (
					<EmptyState message="피해량 구성 데이터가 없습니다." />
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
