import { formatDps } from "../../lib/format.js";
import type { MythicPlusLeaderboardEntry } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { DataTable } from "../primitives/DataTable.js";
import { EmptyState } from "../primitives/EmptyState.js";
import { ExternalLink } from "../primitives/ExternalLink.js";

/**
 * Renders the M+ Leaderboard section: top 10 EU players for the selected spec.
 *
 * Source: WarcraftLogs characterRankings across all M+ season dungeons (EU only),
 * enriched with M+ score, colour, and equipped trinkets from Raider.IO.
 *
 * Columns: Rank | Name (Realm) [RIO] [WCL] | M+ Score | Best DPS/HPS | Trinkets
 */
export function MythicPlusLeaderboardPanel({
	leaderboard,
	metric,
	region = "eu",
}: {
	leaderboard: MythicPlusLeaderboardEntry[];
	metric: "dps" | "hps";
	region?: "eu" | "kr";
}) {
	const metricLabel = metric === "hps" ? "HPS" : "DPS";

	return (
		<Card>
			<Card.Header>M+ Leaderboard ({region.toUpperCase()})</Card.Header>
			<Card.Body>
				{leaderboard.length === 0 ? (
					<EmptyState message="No M+ leaderboard data available." />
				) : (
					<div style={{ overflowX: "auto" }}>
						<DataTable>
							<DataTable.Header
								columns={["#", "Name", "M+ Score", `Best ${metricLabel}`, "Trinkets"]}
							/>
							<DataTable.Body>
								{leaderboard.map((entry) => (
									<DataTable.Row key={`${entry.name}-${entry.realm}`}>
										<DataTable.Cell>{entry.rank}</DataTable.Cell>
										<DataTable.Cell>
											<span>
												{entry.name} ({entry.realm})
											</span>{" "}
											<ExternalLink href={entry.rioProfileUrl} label="RIO" />{" "}
											<ExternalLink href={entry.profileUrl} label="WCL" />
										</DataTable.Cell>
										<DataTable.Cell>
											{entry.score > 0 ? (
												<strong>{entry.score.toLocaleString("en-GB")}</strong>
											) : (
												<span className="empty-state">—</span>
											)}
										</DataTable.Cell>
										<DataTable.Cell>{formatDps(entry.bestPerformance)}</DataTable.Cell>
										<DataTable.Cell>
											{entry.trinkets.length > 0 ? (
												entry.trinkets.join(", ")
											) : (
												<span style={{ opacity: 0.4 }}>—</span>
											)}
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
