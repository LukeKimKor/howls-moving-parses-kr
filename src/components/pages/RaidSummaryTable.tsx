import { ALL_SPECS } from "../../data/specs.js";
import { hasSummaryPercent } from "../../lib/ko.js";
import { RAID_METRIC_LABELS } from "../../lib/raid-overview.js";
import type { RaidMetric, Snapshot } from "../../types/snapshot.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
import { CLASS_COLORS, SpecIcon } from "../primitives/SpecIcon.js";

const columns = (["Heroic", "Mythic"] as const).flatMap((difficulty) =>
	(["dps", "bossdps", "hps"] as RaidMetric[]).map((metric) => ({ difficulty, metric })),
);
export function RaidSummaryTable({ snapshot }: { snapshot: Snapshot }) {
	return (
		<section id="raid-summary" className="raid-summary-scroll" aria-label="전체 캐릭터 성적 요약">
			<h2 className="raid-summary-heading">종합 요약</h2>
			<p>각 칸은 최고 / 중앙값 백분위입니다. 초당 피해량·치유량과 다른 수치입니다.</p>
			<table className="raid-roster-summary">
				<thead>
					<tr>
						<th scope="col" rowSpan={2}>
							캐릭터
						</th>
						<th scope="colgroup" colSpan={3}>
							영웅
						</th>
						<th scope="colgroup" colSpan={3}>
							신화
						</th>
					</tr>
					<tr>
						{columns.map(({ difficulty, metric }) => (
							<th key={`${difficulty}-${metric}`} scope="col">
								{RAID_METRIC_LABELS[metric]}
								<small>최고 / 중앙값</small>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{snapshot.characters.map((character, index) => (
						<tr key={character.name}>
							<th scope="row">
								<a
									href={`#raid-character-${index}`}
									style={{ color: CLASS_COLORS[character.class] }}
								>
									{character.name}
								</a>
							</th>
							{columns.map(({ difficulty, metric }) => (
								<td
									key={`${difficulty}-${metric}`}
									className={`summary-${difficulty.toLowerCase()}`}
								>
									{character.specOrder.map((slug) => {
										const spec = character.specs[slug];
										if (!spec) return null;
										const healer = ALL_SPECS.find((s) => s.specSlug === slug)?.role === "healer";
										const summary = (healer ? metric === "hps" : metric !== "hps")
											? spec.raidPerformance?.[metric]?.[difficulty]?.summary
											: undefined;
										return (
											<div className="roster-spec-value" key={slug}>
												{hasSummaryPercent(summary) && (
													<SpecIcon className={character.class} specName={spec.specName} />
												)}
												<span>
													{summary?.bestPerformanceAverage == null ? (
														"—"
													) : (
														<RaidPercent value={summary.bestPerformanceAverage} />
													)}{" "}
													/{" "}
													{summary?.medianPerformanceAverage == null ? (
														"—"
													) : (
														<RaidPercent value={summary.medianPerformanceAverage} />
													)}
												</span>
											</div>
										);
									})}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}
