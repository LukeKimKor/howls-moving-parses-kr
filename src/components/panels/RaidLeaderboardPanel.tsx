import { useState } from "react";
import { rankLabelKo, regionLabel } from "../../lib/ko.js";
import type { RaidLeaderboardEntry } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { DataTable } from "../primitives/DataTable.js";
import { EmptyState } from "../primitives/EmptyState.js";
import { ExternalLink } from "../primitives/ExternalLink.js";
import { PercentBadge } from "../primitives/PercentBadge.js";

/**
 * Renders the Raid Leaderboard section: top 10 EU players aggregated across all encounters.
 * Source: WarcraftLogs characterRankings. Defaults to Mythic; toggles to Heroic.
 */
export function RaidLeaderboardPanel({
	mythicLeaderboard,
	heroicLeaderboard,
	region = "eu",
}: {
	mythicLeaderboard: RaidLeaderboardEntry[];
	heroicLeaderboard: RaidLeaderboardEntry[];
	region?: "eu" | "kr";
}) {
	const [difficulty, setDifficulty] = useState<"Mythic" | "Heroic">("Mythic");
	const leaderboard = difficulty === "Mythic" ? mythicLeaderboard : heroicLeaderboard;

	return (
		<Card>
			<Card.Header>공격대 순위 ({regionLabel(region)})</Card.Header>
			<Card.Body>
				<fieldset className="difficulty-toggle" aria-label="난이도 선택">
					<legend className="sr-only">난이도</legend>
					<button
						type="button"
						aria-pressed={difficulty === "Mythic"}
						onClick={() => setDifficulty("Mythic")}
					>
						신화
					</button>
					<button
						type="button"
						aria-pressed={difficulty === "Heroic"}
						onClick={() => setDifficulty("Heroic")}
					>
						영웅
					</button>
				</fieldset>

				{leaderboard.length === 0 ? (
					<EmptyState message="공격대 순위 데이터가 없습니다." />
				) : (
					<div style={{ overflowX: "auto" }}>
						<DataTable>
							<DataTable.Header columns={["순위", "이름", "서버", "최고 백분위", "등급"]} />
							<DataTable.Body>
								{leaderboard.map((entry) => (
									<DataTable.Row key={`${entry.name}-${entry.realm}`}>
										<DataTable.Cell>{entry.rank}</DataTable.Cell>
										<DataTable.Cell>
											<ExternalLink href={entry.wclProfileUrl} label={entry.name} />
										</DataTable.Cell>
										<DataTable.Cell>{entry.realm}</DataTable.Cell>
										<DataTable.Cell>
											<PercentBadge value={entry.bestPercent} />
										</DataTable.Cell>
										<DataTable.Cell>{rankLabelKo(entry.rankLabel)}</DataTable.Cell>
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
