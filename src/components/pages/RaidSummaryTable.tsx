import { ALL_SPECS } from "../../data/specs.js";
import {
	primaryRaidMetric,
	raidPatchLabel,
	scopedAllStars,
	starPoints,
	starRank,
} from "../../lib/all-stars.js";
import { hasSummaryPercent } from "../../lib/ko.js";
import { RAID_METRIC_LABELS } from "../../lib/raid-overview.js";
import type { RaidMetric, Snapshot } from "../../types/snapshot.js";
import { AllStarsHelp } from "../primitives/AllStarsSummary.js";
import { MissingValue, blankTablePlaceholders } from "../primitives/MissingValue.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
import { CLASS_COLORS, SpecIcon } from "../primitives/SpecIcon.js";

export function RaidSummaryTable({ snapshot }: { snapshot: Snapshot }) {
	return (
		<section id="raid-summary" className="raid-summary-scroll" aria-label="전체 캐릭터 성적 요약">
			<h2 className="raid-summary-heading">종합 요약</h2>
			<p>
				피해·치유 칸은 최고 / 중앙값 백분위입니다. 종합 점수·순위는 공격 전문화의 전체 피해, 치유
				전문화의 치유량 기준입니다.
			</p>
			<AllStarsHelp />
			{(["Heroic", "Mythic"] as const).map((difficulty) => (
				<div className="raid-summary-difficulty" key={difficulty}>
					<h3>{difficulty === "Heroic" ? "영웅" : "신화"}</h3>
					<div className="raid-summary-table-scroll">
						<table
							className="raid-roster-summary"
							aria-label={`${difficulty === "Heroic" ? "영웅" : "신화"} 전체 캐릭터 요약`}
						>
							<colgroup>
								<col className="summary-character-col" />
								<col />
								<col />
								<col />
								<col className="summary-stars-col" />
								<col className="summary-stars-col" />
							</colgroup>
							<thead>
								<tr>
									<th scope="col">캐릭터</th>
									{(["dps", "bossdps", "hps"] as RaidMetric[]).map((metric) => (
										<th key={metric} scope="col">
											{RAID_METRIC_LABELS[metric]}
											<small>최고 / 중앙값</small>
										</th>
									))}
									<th scope="col" className="summary-stars-header">
										종합 점수<small>All Stars · 패치별</small>
									</th>
									<th scope="col" className="summary-stars-header">
										순위<small>WCL · 패치별</small>
									</th>
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
										{(["dps", "bossdps", "hps"] as RaidMetric[]).map((metric) => (
											<td key={metric} className={`summary-${difficulty.toLowerCase()}`}>
												{character.specOrder.map((slug) => {
													const spec = character.specs[slug];
													if (!spec) return null;
													const healer =
														ALL_SPECS.find((s) => s.specSlug === slug)?.role === "healer";
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
																	<MissingValue label="최고 백분위 미확인" />
																) : (
																	<RaidPercent value={summary.bestPerformanceAverage} />
																)}
																{summary?.bestPerformanceAverage != null &&
																summary?.medianPerformanceAverage != null
																	? " / "
																	: null}
																{summary?.medianPerformanceAverage == null ? (
																	<MissingValue label="중앙값 백분위 미확인" />
																) : (
																	<RaidPercent value={summary.medianPerformanceAverage} />
																)}
															</span>
														</div>
													);
												})}
											</td>
										))}
										{(["points", "rank"] as const).map((field) => (
											<td
												key={field}
												className={`summary-${difficulty.toLowerCase()} summary-all-stars`}
											>
												{character.specOrder.map((slug) => {
													const spec = character.specs[slug];
													if (!spec) return null;
													const metric = primaryRaidMetric(slug);
													const entries = scopedAllStars(
														spec.raidPerformance?.[metric]?.[difficulty],
														spec.specName,
													);
													return (
														<div
															className="summary-star-spec"
															data-spec={slug}
															data-metric={metric}
															key={slug}
														>
															{entries.length ? (
																entries.map((star, i) => (
																	<div
																		className="summary-star-value"
																		data-partition={star.partition}
																		key={`${star.partition}-${i}`}
																	>
																		<span>
																			<SpecIcon
																				className={character.class}
																				specName={spec.specName}
																			/>
																			<strong>
																				{blankTablePlaceholders(
																					field === "points"
																						? starPoints(star.points)
																						: starRank(star.rank),
																				)}
																			</strong>
																		</span>
																		<small>
																			{raidPatchLabel(
																				snapshot.raid?.id,
																				star.partition,
																				snapshot.raidPatchMetadata,
																			)}
																		</small>
																	</div>
																))
															) : (
																<MissingValue />
															)}
														</div>
													);
												})}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			))}
		</section>
	);
}
