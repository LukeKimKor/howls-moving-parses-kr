import { useState } from "react";
import { raidPatchLabel, scopedAllStars, starPoints, starRank } from "../../lib/all-stars.js";
import { difficultyLabel, hasSummaryPercent, specLabel } from "../../lib/ko.js";
import { RAID_METRIC_LABELS } from "../../lib/raid-overview.js";
import { selectedSummaryStar, summaryMetric, summaryPatchOptions } from "../../lib/raid-summary.js";
import type { Snapshot } from "../../types/snapshot.js";
import { AllStarsHelp } from "../primitives/AllStarsSummary.js";
import { MissingValue, blankTablePlaceholders } from "../primitives/MissingValue.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
import { CLASS_COLORS, SpecIcon } from "../primitives/SpecIcon.js";

export function SummaryPatchSelect({
	snapshot,
	value,
	onChange,
}: { snapshot: Snapshot; value: number | null; onChange: (id: number) => void }) {
	const patches = summaryPatchOptions(snapshot);
	return (
		<label className="summary-patch-select">
			점수 패치
			<select
				aria-label="요약 종합점수 패치"
				value={value ?? ""}
				disabled={!patches.length}
				onChange={(event) => onChange(Number(event.target.value))}
			>
				{patches.length ? (
					patches.map((patch) => (
						<option key={patch.id} value={patch.id}>
							{patch.name}
						</option>
					))
				) : (
					<option value="">패치명 미확인</option>
				)}
			</select>
		</label>
	);
}

export function RaidSummaryHistory({
	snapshot,
	damageMetric,
}: { snapshot: Snapshot; damageMetric: "dps" | "bossdps" }) {
	return (
		<details className="summary-patch-history">
			<summary>전체 패치 기록</summary>
			<div className="summary-history-scroll">
				<table className="summary-history-table" aria-label="모든 패치의 종합 점수와 순위">
					<thead>
						<tr>
							{["캐릭터", "전문화", "난이도", "지표", "패치", "종합 점수", "순위"].map((label) => (
								<th key={label} scope="col">
									{label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{snapshot.characters.flatMap((character) =>
							character.specOrder.flatMap((slug) => {
								const spec = character.specs[slug];
								if (!spec) return [];
								const metric = summaryMetric(slug, damageMetric);
								return (["Heroic", "Mythic"] as const).flatMap((difficulty) =>
									scopedAllStars(spec.raidPerformance?.[metric]?.[difficulty], spec.specName).map(
										(star, index) => (
											<tr
												data-summary-history-row=""
												key={`${character.name}-${slug}-${difficulty}-${star.partition}-${index}`}
											>
												<th scope="row">{character.name}</th>
												<td>{specLabel(spec.specName, character.class)}</td>
												<td>{difficultyLabel(difficulty)}</td>
												<td>{RAID_METRIC_LABELS[metric]}</td>
												<td>
													{raidPatchLabel(
														snapshot.raid?.id,
														star.partition,
														snapshot.raidPatchMetadata,
													)}
												</td>
												<td>{blankTablePlaceholders(starPoints(star.points))}</td>
												<td>{blankTablePlaceholders(starRank(star.rank))}</td>
											</tr>
										),
									),
								);
							}),
						)}
					</tbody>
				</table>
			</div>
		</details>
	);
}

export function RaidSummaryTable({ snapshot }: { snapshot: Snapshot }) {
	const [damageMetric, setDamageMetric] = useState<"dps" | "bossdps">("dps");
	const [patchId, setPatchId] = useState<number | null>(
		() => summaryPatchOptions(snapshot)[0]?.id ?? null,
	);
	return (
		<section
			id="raid-summary"
			className="raid-summary-scroll raid-compact-summary"
			aria-label="전체 캐릭터 성적 요약"
		>
			<div className="summary-toolbar">
				<h2 className="raid-summary-heading">종합 요약</h2>
				<fieldset className="summary-metric-tabs" aria-label="요약 피해 지표">
					{(["dps", "bossdps"] as const).map((metric) => (
						<button
							key={metric}
							type="button"
							aria-pressed={damageMetric === metric}
							onClick={() => setDamageMetric(metric)}
						>
							{RAID_METRIC_LABELS[metric]}
						</button>
					))}
				</fieldset>
				<SummaryPatchSelect snapshot={snapshot} value={patchId} onChange={setPatchId} />
			</div>
			<p className="summary-scope-note">
				백분위: 최고 / 중앙값 WCL 요약 · 힐러는 치유량 · 종합 점수·순위: 선택한 패치
			</p>
			<div className="raid-summary-table-scroll">
				<table className="raid-roster-summary" aria-label="영웅과 신화 전체 캐릭터 비교">
					<colgroup>
						<col className="compact-character-col" />
						{["Heroic", "Mythic"].flatMap((difficulty) => [
							<col className="compact-percent-col" key={`${difficulty}-percent`} />,
							<col className="compact-points-col" key={`${difficulty}-points`} />,
							<col className="compact-rank-col" key={`${difficulty}-rank`} />,
						])}
					</colgroup>
					<thead>
						<tr>
							<th scope="col" rowSpan={2}>
								캐릭터
							</th>
							<th scope="colgroup" colSpan={3} className="summary-heroic">
								영웅
							</th>
							<th scope="colgroup" colSpan={3} className="summary-mythic">
								신화
							</th>
						</tr>
						<tr>
							{["Heroic", "Mythic"].flatMap((difficulty) =>
								["최고 / 중앙값", "종합 점수", "순위"].map((label) => (
									<th
										scope="col"
										key={`${difficulty}-${label}`}
										className={`summary-${difficulty.toLowerCase()}`}
									>
										{label}
									</th>
								)),
							)}
						</tr>
					</thead>
					<tbody>
						{snapshot.characters.map((character, index) => (
							<tr key={character.name} data-summary-character={character.name}>
								<th scope="row">
									<a
										href={`#raid-character-${index}`}
										style={{ color: CLASS_COLORS[character.class] }}
									>
										{character.name}
									</a>
									{character.specOrder.length > 1 && (
										<small className="summary-multi-spec">
											{character.specOrder
												.map((slug) =>
													specLabel(character.specs[slug]?.specName ?? "", character.class),
												)
												.join(" · ")}
										</small>
									)}
								</th>
								{(["Heroic", "Mythic"] as const).map((difficulty) => (
									<DifficultyCells
										key={difficulty}
										snapshot={snapshot}
										characterIndex={index}
										difficulty={difficulty}
										damageMetric={damageMetric}
										patchId={patchId}
									/>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="summary-secondary">
				<RaidSummaryHistory snapshot={snapshot} damageMetric={damageMetric} />
				<AllStarsHelp />
			</div>
		</section>
	);
}

function DifficultyCells({
	snapshot,
	characterIndex,
	difficulty,
	damageMetric,
	patchId,
}: {
	snapshot: Snapshot;
	characterIndex: number;
	difficulty: "Heroic" | "Mythic";
	damageMetric: "dps" | "bossdps";
	patchId: number | null;
}) {
	const character = snapshot.characters[characterIndex];
	if (!character) return null;
	return (
		<>
			<td className={`summary-${difficulty.toLowerCase()} summary-percent-cell`}>
				{character.specOrder.map((slug) => {
					const spec = character.specs[slug];
					if (!spec) return null;
					const metric = summaryMetric(slug, damageMetric);
					const summary = spec.raidPerformance?.[metric]?.[difficulty]?.summary;
					return (
						<div
							className="roster-spec-value"
							data-spec={slug}
							data-metric={metric}
							data-difficulty={difficulty}
							key={slug}
						>
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
			{(["points", "rank"] as const).map((field) => (
				<td
					key={field}
					className={`summary-${difficulty.toLowerCase()} summary-all-stars`}
					data-summary-field={field}
				>
					{character.specOrder.map((slug) => {
						const spec = character.specs[slug];
						if (!spec) return null;
						const metric = summaryMetric(slug, damageMetric);
						const star = selectedSummaryStar(
							snapshot,
							characterIndex,
							slug,
							metric,
							difficulty,
							patchId,
						);
						return (
							<div
								className="compact-spec-value"
								data-spec={slug}
								data-metric={metric}
								data-difficulty={difficulty}
								data-partition={patchId}
								key={slug}
								aria-label={`${specLabel(spec.specName, character.class)} ${RAID_METRIC_LABELS[metric]} ${field === "points" ? "종합 점수" : "순위"}`}
							>
								<strong>
									{blankTablePlaceholders(
										field === "points" ? starPoints(star?.points) : starRank(star?.rank),
									)}
								</strong>
							</div>
						);
					})}
				</td>
			))}
		</>
	);
}
