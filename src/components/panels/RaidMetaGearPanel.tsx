import { regionLabel } from "../../lib/ko.js";
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
			<Card.Header>공격대 장신구 표본 (상위 10명 {regionLabel(region)})</Card.Header>
			<Card.Body>
				{trinkets.length === 0 ? (
					<EmptyState message="장신구 표본 데이터가 없습니다." />
				) : (
					<DataTable>
						<DataTable.Header columns={["장신구", "사용 비율"]} />
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
