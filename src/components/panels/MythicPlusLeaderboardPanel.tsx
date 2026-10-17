import { formatDps } from "../../lib/format.js";
import { regionLabel } from "../../lib/ko.js";
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
	const metricLabel = metric === "hps" ? "초당 치유량" : "초당 피해량";

	return (
		<Card>
			<Card.Header>쐐기 순위 ({regionLabel(region)})</Card.Header>
			<Card.Body>
				{leaderboard.length === 0 ? (
					<EmptyState message="쐐기 순위 데이터가 없습니다." />
				) : (
					<div style={{ overflowX: "auto" }}>
						<DataTable>
							<DataTable.Header
								columns={["#", "이름", "쐐기 점수", `최고 ${metricLabel}`, "장신구"]}
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
											{Number.isFinite(entry.score) && entry.score >= 0 ? (
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
