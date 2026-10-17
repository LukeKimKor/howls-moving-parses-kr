import { slotLabel, specLabel } from "../../lib/ko.js";
import type { GearData } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { DataTable } from "../primitives/DataTable.js";
import { EmptyState } from "../primitives/EmptyState.js";

/**
 * Renders the Gear Snapshot section: equipped ilvl headline and item-by-slot table.
 */
export function GearSnapshotPanel({ data }: { data: GearData | null }) {
	if (!data) {
		return (
			<Card>
				<Card.Header>착용 장비</Card.Header>
				<Card.Body>
					<EmptyState message="착용 장비 데이터가 없습니다." />
				</Card.Body>
			</Card>
		);
	}

	return (
		<Card>
			<Card.Header>착용 장비</Card.Header>
			<Card.Body>
				<p>
					현재 착용 장비{data.activeSpecName ? ` · ${specLabel(data.activeSpecName)}` : ""} ·
					전문화별 과거 장비가 아닙니다.
				</p>
				<p className="equipped-ilvl">
					<strong>{data.equippedIlvl}</strong> 착용 아이템 레벨
				</p>
				<div style={{ overflowX: "auto" }}>
					<DataTable>
						<DataTable.Header columns={["부위", "아이템 이름", "아이템 레벨"]} />
						<DataTable.Body>
							{data.items.map((item) => (
								<DataTable.Row key={slotLabel(item.slot)}>
									<DataTable.Cell scope="row">{slotLabel(item.slot)}</DataTable.Cell>
									<DataTable.Cell>{item.name}</DataTable.Cell>
									<DataTable.Cell>{item.ilvl}</DataTable.Cell>
								</DataTable.Row>
							))}
						</DataTable.Body>
					</DataTable>
				</div>
			</Card.Body>
		</Card>
	);
}
