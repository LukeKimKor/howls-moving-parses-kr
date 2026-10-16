import type { MetaItem } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { DataTable } from "../primitives/DataTable.js";
import { EmptyState } from "../primitives/EmptyState.js";

/**
 * Renders the Raid Meta Gear section: trinkets used by the top 10 EU Mythic raid
 * players for the selected spec, sourced from Raider.IO gear lookups.
 */
export function RaidMetaGearPanel({
	trinkets,
	region = "eu",
}: { trinkets: MetaItem[]; region?: "eu" | "kr" }) {
	return (
		<Card>
			<Card.Header>Raid Meta Trinkets (Top 10 {region.toUpperCase()})</Card.Header>
			<Card.Body>
				{trinkets.length === 0 ? (
					<EmptyState message="No trinket data available." />
				) : (
					<DataTable>
						<DataTable.Header columns={["Trinket", "Usage"]} />
						<DataTable.Body>
							{trinkets.map((item) => (
								<DataTable.Row key={item.name}>
									<DataTable.Cell>{item.name}</DataTable.Cell>
									<DataTable.Cell>{item.usagePercent}%</DataTable.Cell>
								</DataTable.Row>
							))}
						</DataTable.Body>
					</DataTable>
				)}
			</Card.Body>
		</Card>
	);
}
