import { useState } from "react";
import { formatDps } from "../../lib/format.js";
import { gameName } from "../../lib/ko.js";
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
	const perfLabel = metric === "hps" ? "초당 치유량" : "초당 피해량";

	const hasMythic = data?.raidParses.some((p) => p.difficulty === "Mythic") ?? false;
	const hasHeroic = data?.raidParses.some((p) => p.difficulty === "Heroic") ?? false;

	const [difficulty, setDifficulty] = useState<"Heroic" | "Mythic">(
		hasMythic ? "Mythic" : "Heroic",
	);

	if (!data) {
		return (
			<Card>
				<Card.Header>로그 성적</Card.Header>
				<Card.Body>
					<EmptyState message={unavailableReason ?? "이 캐릭터의 공개 로그가 없습니다."} />
				</Card.Body>
			</Card>
		);
	}

	const filteredRaidParses = data.raidParses.filter((p) => p.difficulty === difficulty);

	return (
		<Card>
			<Card.Header>로그 성적</Card.Header>
			<Card.Body>
				<div className="log-section-header">
					<h3>공격대</h3>
					{(hasMythic || hasHeroic) && (
						<select
							value={difficulty}
							onChange={(e) => setDifficulty(e.target.value as "Heroic" | "Mythic")}
							aria-label="난이도 선택"
							className="difficulty-select"
						>
							{hasHeroic && <option value="Heroic">영웅</option>}
							{hasMythic && <option value="Mythic">신화</option>}
						</select>
					)}
				</div>

				{filteredRaidParses.length === 0 ? (
					<EmptyState message={raidUnavailableReason ?? "공격대 로그 기록이 없습니다."} />
				) : (
					<div style={{ overflowX: "auto" }}>
						<DataTable>
							<DataTable.Header
								columns={["우두머리", "최고 백분위", `최고 ${perfLabel}`, "날짜"]}
							/>
							<DataTable.Body>
								{filteredRaidParses.map((parse) => (
									<DataTable.Row key={gameName(parse.bossName)}>
										<DataTable.Cell>{gameName(parse.bossName)}</DataTable.Cell>
										<DataTable.Cell>
											<PercentBadge value={parse.bestPercent} />
										</DataTable.Cell>
										<DataTable.Cell>
											{parse.bestAmount > 0 ? formatDps(parse.bestAmount) : "—"}
										</DataTable.Cell>
										<DataTable.Cell>
											{parse.date ? new Date(parse.date).toLocaleDateString("ko-KR") : "—"}
										</DataTable.Cell>
									</DataTable.Row>
								))}
							</DataTable.Body>
						</DataTable>
					</div>
				)}

				<h3>쐐기</h3>
				{data.recentDungeonLogs.length === 0 ? (
					<EmptyState message={mplusUnavailableReason ?? "최근 쐐기 로그 기록이 없습니다."} />
				) : (
					<div style={{ overflowX: "auto" }}>
						<DataTable>
							<DataTable.Header columns={["던전", "순위 백분위", perfLabel, "날짜"]} />
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
												{log.date ? new Date(log.date).toLocaleDateString("ko-KR") : "—"}
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
