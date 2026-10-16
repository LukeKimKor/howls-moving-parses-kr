import { formatClearTime } from "../../lib/format.js";
import type { MythicPlusRun } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { DataTable } from "../primitives/DataTable.js";
import { EmptyState } from "../primitives/EmptyState.js";

/**
 * Renders the Recent M+ Runs section: last 10 runs and best run per dungeon.
 */
export function RecentRunsPanel({
	recentRuns,
	bestRuns,
}: {
	recentRuns: MythicPlusRun[];
	bestRuns: MythicPlusRun[];
}) {
	return (
		<Card>
			<Card.Header>Recent M+ Runs</Card.Header>
			<Card.Body>
				{recentRuns.length === 0 ? (
					<EmptyState message="No recent runs found." />
				) : (
					<>
						<h3>Last {Math.min(10, recentRuns.length)} Runs</h3>
						<div style={{ overflowX: "auto" }}>
							<DataTable>
								<DataTable.Header columns={["Dungeon", "+Level", "Time", "Status", "Score"]} />
								<DataTable.Body>
									{recentRuns.slice(0, 10).map((run) => (
										<DataTable.Row key={`${run.completedAt}-${run.dungeon}-${run.keystoneLevel}`}>
											<DataTable.Cell>{run.dungeon}</DataTable.Cell>
											<DataTable.Cell>+{run.keystoneLevel}</DataTable.Cell>
											<DataTable.Cell>{formatClearTime(run.clearTimeMs)}</DataTable.Cell>
											<DataTable.Cell>
												{run.inTime ? (
													<span className="run-status-intimer" aria-label="In time">
														In time
													</span>
												) : (
													<span className="run-status-depleted" aria-label="Depleted">
														Depleted
													</span>
												)}
											</DataTable.Cell>
											<DataTable.Cell>{run.score.toFixed(1)}</DataTable.Cell>
										</DataTable.Row>
									))}
								</DataTable.Body>
							</DataTable>
						</div>
					</>
				)}

				{bestRuns.length > 0 && (
					<>
						<h3>Best Run Per Dungeon</h3>
						<div style={{ overflowX: "auto" }}>
							<DataTable>
								<DataTable.Header columns={["Dungeon", "+Level", "Score"]} />
								<DataTable.Body>
									{bestRuns.map((run) => (
										<DataTable.Row key={run.dungeon}>
											<DataTable.Cell>{run.dungeon}</DataTable.Cell>
											<DataTable.Cell>+{run.keystoneLevel}</DataTable.Cell>
											<DataTable.Cell>{run.score.toFixed(1)}</DataTable.Cell>
										</DataTable.Row>
									))}
								</DataTable.Body>
							</DataTable>
						</div>
					</>
				)}
			</Card.Body>
		</Card>
	);
}
