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
			<Card.Header>최근 쐐기 기록</Card.Header>
			<Card.Body>
				{recentRuns.length === 0 ? (
					<EmptyState message="최근 쐐기 기록이 없습니다." />
				) : (
					<>
						<h3>최근 {Math.min(10, recentRuns.length)}회</h3>
						<div style={{ overflowX: "auto" }}>
							<DataTable>
								<DataTable.Header columns={["던전", "단수", "소요 시간", "완료 상태", "점수"]} />
								<DataTable.Body>
									{recentRuns.slice(0, 10).map((run) => (
										<DataTable.Row key={`${run.completedAt}-${run.dungeon}-${run.keystoneLevel}`}>
											<DataTable.Cell>{run.dungeon}</DataTable.Cell>
											<DataTable.Cell>+{run.keystoneLevel}</DataTable.Cell>
											<DataTable.Cell>{formatClearTime(run.clearTimeMs)}</DataTable.Cell>
											<DataTable.Cell>
												{run.inTime ? (
													<span className="run-status-intimer" aria-label="시간 내 완료">
														시간 내 완료
													</span>
												) : (
													<span className="run-status-depleted" aria-label="시간 초과">
														시간 초과
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
						<h3>던전별 최고 기록</h3>
						<div style={{ overflowX: "auto" }}>
							<DataTable>
								<DataTable.Header columns={["던전", "단수", "점수"]} />
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
