import type { GearData } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { DataTable } from "../primitives/DataTable.js";
import { EmptyState } from "../primitives/EmptyState.js";

/**
 * Renders the two equipped trinkets extracted from Raider.IO gear data.
 * Shows item name and item level for trinket1 and trinket2 slots.
 */
export function TrinketsPanel({ data }: { data: GearData | null }) {
	if (!data) {
		return (
			<Card>
				<Card.Header>장신구</Card.Header>
				<Card.Body>
					<EmptyState message="착용 장비 데이터가 없습니다." />
				</Card.Body>
			</Card>
		);
	}

	const trinkets = data.items.filter(
		(item) => item.slot === "trinket1" || item.slot === "trinket2",
	);

	if (trinkets.length === 0) {
		return (
			<Card>
				<Card.Header>장신구</Card.Header>
				<Card.Body>
					<EmptyState message="장신구 데이터가 없습니다." />
				</Card.Body>
			</Card>
		);
	}

	return (
		<Card>
			<Card.Header>장신구</Card.Header>
			<Card.Body>
				<DataTable>
					<DataTable.Header columns={["부위", "아이템", "아이템 레벨"]} />
					<DataTable.Body>
						{trinkets.map((item) => (
							<DataTable.Row key={item.slot}>
								<DataTable.Cell scope="row">
									{item.slot === "trinket1" ? "장신구 1" : "장신구 2"}
								</DataTable.Cell>
								<DataTable.Cell>{item.name}</DataTable.Cell>
								<DataTable.Cell>{item.ilvl}</DataTable.Cell>
							</DataTable.Row>
						))}
					</DataTable.Body>
				</DataTable>
			</Card.Body>
		</Card>
	);
}
