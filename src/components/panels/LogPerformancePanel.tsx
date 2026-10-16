import { useState } from "react";
import { formatDps } from "../../lib/format.js";
import type { LogData } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { DataTable } from "../primitives/DataTable.js";
import { EmptyState } from "../primitives/EmptyState.js";
import { PercentBadge } from "../primitives/PercentBadge.js";

/**
 * Renders the Log Performance section.
 *
 * Raid: difficulty dropdown (defaults to Mythic if parses exist, else Heroic).
 *       Columns: Boss | Best % | Best DPS/HPS
 *
 * M+: sorted by date descending.
 *     Columns: Dungeon | Rank % | DPS/HPS | Date
 *
 * Both tables share the same visual format.
 */
export function LogPerformancePanel({
	data,
	metric,
	unavailableReason,
	raidUnavailableReason,
	mplusUnavailableReason,
}: {
	data: LogData | null;
	metric: "dps" | "hps";
	unavailableReason?: string;
	raidUnavailableReason?: string;
	mplusUnavailableReason?: string;
}) {
	const perfLabel = metric === "hps" ? "HPS" : "DPS";

	const hasMythic = data?.raidParses.some((p) => p.difficulty === "Mythic") ?? false;
	const hasHeroic = data?.raidParses.some((p) => p.difficulty === "Heroic") ?? false;

	const [difficulty, setDifficulty] = useState<"Heroic" | "Mythic">(
		hasMythic ? "Mythic" : "Heroic",
	);

	if (!data) {
		return (
			<Card>
				<Card.Header>Log Performance</Card.Header>
				<Card.Body>
					<EmptyState message={unavailableReason ?? "No public logs found for this character."} />
				</Card.Body>
			</Card>
		);
	}

	const filteredRaidParses = data.raidParses.filter((p) => p.difficulty === difficulty);

	return (
		<Card>
			<Card.Header>Log Performance</Card.Header>
			<Card.Body>
				<div className="log-section-header">
					<h3>Raid</h3>
					{(hasMythic || hasHeroic) && (
						<select
							value={difficulty}
							onChange={(e) => setDifficulty(e.target.value as "Heroic" | "Mythic")}
							aria-label="Select difficulty"
							className="difficulty-select"
						>
							{hasHeroic && <option value="Heroic">Heroic</option>}
							{hasMythic && <option value="Mythic">Mythic</option>}
						</select>
					)}
				</div>

				{filteredRaidParses.length === 0 ? (
					<EmptyState message={raidUnavailableReason ?? "No raid parses found."} />
				) : (
					<div style={{ overflowX: "auto" }}>
						<DataTable>
							<DataTable.Header columns={["Boss", "Best %", `Best ${perfLabel}`, "Date"]} />
							<DataTable.Body>
								{filteredRaidParses.map((parse) => (
									<DataTable.Row key={parse.bossName}>
										<DataTable.Cell>{parse.bossName}</DataTable.Cell>
										<DataTable.Cell>
											<PercentBadge value={parse.bestPercent} />
										</DataTable.Cell>
										<DataTable.Cell>
											{parse.bestAmount > 0 ? formatDps(parse.bestAmount) : "—"}
										</DataTable.Cell>
										<DataTable.Cell>
											{parse.date ? new Date(parse.date).toLocaleDateString("en-GB") : "—"}
										</DataTable.Cell>
									</DataTable.Row>
								))}
							</DataTable.Body>
						</DataTable>
					</div>
				)}

				<h3>Mythic+</h3>
				{data.recentDungeonLogs.length === 0 ? (
					<EmptyState message={mplusUnavailableReason ?? "No recent dungeon logs found."} />
				) : (
					<div style={{ overflowX: "auto" }}>
						<DataTable>
							<DataTable.Header columns={["Dungeon", "Rank %", perfLabel, "Date"]} />
							<DataTable.Body>
								{[...data.recentDungeonLogs]
									.sort((a, b) => {
										if (!a.date && !b.date) return 0;
										if (!a.date) return 1;
										if (!b.date) return -1;
										return new Date(b.date).getTime() - new Date(a.date).getTime();
									})
									.map((log) => (
										<DataTable.Row key={`${log.dungeon}-${log.date}`}>
											<DataTable.Cell>{log.dungeon}</DataTable.Cell>
											<DataTable.Cell>
												<PercentBadge value={log.rankPercent} />
											</DataTable.Cell>
											<DataTable.Cell>{formatDps(log.dps)}</DataTable.Cell>
											<DataTable.Cell>
												{log.date ? new Date(log.date).toLocaleDateString("en-GB") : "—"}
											</DataTable.Cell>
										</DataTable.Row>
									))}
							</DataTable.Body>
						</DataTable>
					</div>
				)}
			</Card.Body>
		</Card>
	);
}
