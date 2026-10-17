import { classLabel, specLabel } from "../../lib/ko.js";
import type { CharacterData } from "../../types/snapshot.js";
import { DataTable } from "../primitives/DataTable.js";

/**
 * "All Characters" summary panel using the Popover API + CSS Anchor Positioning.
 *
 * - `popover="auto"` gives light-dismiss and top-layer rendering.
 * - `position-anchor` + `position-area: bottom` places the panel directly below
 *   the trigger button via CSS Anchor Positioning (Chrome 125+).
 * - Horizontal span matches the page-wrap boundary via `anchor(--page-wrap, *)`.
 */
export function CharactersSummaryPanel({
	characters,
	generatedAt,
	onSelectCharacter,
}: {
	characters: CharacterData[];
	generatedAt: string;
	onSelectCharacter: (name: string) => void;
}) {
	const dungeonSet = new Set<string>();
	const dungeonShortNames = new Map<string, string>();

	for (const char of characters) {
		const mainSpecData = char.specs[char.mainSpecSlug];
		if (mainSpecData?.mythicPlus?.bestRuns) {
			for (const run of mainSpecData.mythicPlus.bestRuns) {
				dungeonSet.add(run.dungeon);
				dungeonShortNames.set(run.dungeon, run.shortName);
			}
		}
	}

	const dungeons = [...dungeonSet].sort((a, b) =>
		(dungeonShortNames.get(a) ?? a).localeCompare(dungeonShortNames.get(b) ?? b),
	);
	const popoverId = "characters-summary-popover";

	return (
		<div className="characters-summary-anchor">
			<button
				type="button"
				// @ts-expect-error — popovertarget is in HTML spec, types lag slightly
				popovertarget={popoverId}
				className="summary-trigger-btn"
			>
				전체 캐릭터 ({characters.length})
			</button>

			{/* @ts-expect-error — popover attribute is in HTML spec */}
			<div id={popoverId} popover="auto" className="characters-summary-popover">
				<div style={{ overflowX: "auto" }}>
					<DataTable>
						<DataTable.Header
							columns={[
								"캐릭터",
								"쐐기 점수",
								...dungeons.map((d) => dungeonShortNames.get(d) ?? d),
							]}
						/>
						<DataTable.Body>
							{characters.map((char) => {
								const mainSpec = char.specs[char.mainSpecSlug];
								const score = mainSpec?.mythicPlus?.score;
								const scoreColor = mainSpec?.mythicPlus?.scoreColor ?? "";
								const bestRuns = mainSpec?.mythicPlus?.bestRuns ?? [];
								const hasFailure = Object.values(char.specs).some((s) =>
									Object.values(s.collection ?? {}).some(
										(status) => status.state === "failed" || status.state === "partial",
									),
								);

								const bestByDungeon = new Map<string, number>();
								for (const run of bestRuns) {
									bestByDungeon.set(run.dungeon, run.keystoneLevel);
								}

								return (
									<DataTable.Row key={char.name} onClick={() => onSelectCharacter(char.name)}>
										<DataTable.Cell scope="row">
											{char.name} ·{" "}
											{char.mainSpecPending
												? "주 전문화 미확정"
												: specLabel(mainSpec?.specName ?? "", char.class)}{" "}
											· {classLabel(char.class)}
											{hasFailure && <small> · 일부 조회 실패</small>}
										</DataTable.Cell>
										<DataTable.Cell>
											<span style={{ color: scoreColor }}>{score ?? "—"}</span>
										</DataTable.Cell>
										{dungeons.map((d) => (
											<DataTable.Cell key={d}>
												{bestByDungeon.has(d) ? `+${bestByDungeon.get(d)}` : "—"}
											</DataTable.Cell>
										))}
									</DataTable.Row>
								);
							})}
						</DataTable.Body>
					</DataTable>
				</div>
			</div>
		</div>
	);
}
