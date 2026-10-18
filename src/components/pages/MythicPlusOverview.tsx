import { useMemo, useState } from "react";
import { formatClearTime } from "../../lib/format.js";
import { tierLabelKo } from "../../lib/ko.js";
import { characterProfileUrl } from "../../lib/regions.js";
import {
	bestRunByDungeon,
	characterIlvl,
	characterMythicPlus,
	dungeonColumns,
	readableOnDark,
	sortRoster,
} from "../../lib/roster.js";
import type { CharacterData, MythicPlusRun, Snapshot } from "../../types/snapshot.js";
import { MissingValue } from "../primitives/MissingValue.js";
import { CLASS_COLORS } from "../primitives/SpecIcon.js";

function RunCell({ run }: { run: MythicPlusRun | undefined }) {
	if (!run) return <span className="dash-run dash-run-none">—</span>;
	const delta = run.keystoneTimeMs - run.clearTimeMs;
	const title = `${run.dungeon} +${run.keystoneLevel} · ${formatClearTime(run.clearTimeMs)} / ${formatClearTime(run.keystoneTimeMs)} · ${run.inTime ? "시간 내" : "시간 초과"}`;
	const content = (
		<>
			<strong>+{run.keystoneLevel}</strong>
			<small>{run.inTime ? `${formatClearTime(delta)} 여유` : "초과"}</small>
		</>
	);
	return run.url ? (
		<a
			className={`dash-run ${run.inTime ? "dash-run-timed" : "dash-run-depleted"}`}
			href={run.url}
			target="_blank"
			rel="noopener noreferrer"
			title={title}
		>
			{content}
		</a>
	) : (
		<span
			className={`dash-run ${run.inTime ? "dash-run-timed" : "dash-run-depleted"}`}
			title={title}
		>
			{content}
		</span>
	);
}

export function MythicPlusOverview({
	snapshot,
	onOpenCharacter,
}: {
	snapshot: Snapshot;
	onOpenCharacter: (character: CharacterData) => void;
}) {
	const [byScore, setByScore] = useState(true);
	const rows = useMemo(
		() => sortRoster(snapshot.characters, byScore ? "score" : "config", "dps"),
		[snapshot.characters, byScore],
	);
	const dungeons = dungeonColumns(snapshot);
	const cutoff = snapshot.characters
		.map((c) => characterMythicPlus(c)?.titleCutoff?.score)
		.find((v): v is number => typeof v === "number" && v > 0);

	return (
		<section className="dash-mplus" aria-label="전체 캐릭터 쐐기 현황">
			<div className="dash-toolbar">
				<h2>쐐기 현황</h2>
				<div className="dash-toolbar-controls">
					{cutoff && (
						<span className="dash-chip">
							상위 1% 칭호 컷 <strong>{Math.round(cutoff).toLocaleString("ko-KR")}</strong>
						</span>
					)}
					<fieldset className="dash-segment" aria-label="쐐기 현황 정렬">
						<button type="button" aria-pressed={byScore} onClick={() => setByScore(true)}>
							점수 순
						</button>
						<button type="button" aria-pressed={!byScore} onClick={() => setByScore(false)}>
							등록 순
						</button>
					</fieldset>
				</div>
			</div>
			<div className="dash-table-scroll">
				<table
					className="dash-table dash-mplus-table"
					aria-label="캐릭터별 쐐기 점수와 던전 최고 단수"
				>
					<thead>
						<tr>
							<th scope="col" className="dash-col-char">
								캐릭터
							</th>
							<th scope="col" className="dash-col-score">
								점수
							</th>
							<th scope="col" className="dash-num">
								순위 (서버 / 한국)
							</th>
							<th scope="col" className="dash-num">
								템렙
							</th>
							{dungeons.map((d) => (
								<th scope="col" key={d.key} className="dash-col-dungeon" title={d.name}>
									{d.shortName || d.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((character) => {
							const mplus = characterMythicPlus(character);
							const runs = bestRunByDungeon(character);
							const ilvl = characterIlvl(character);
							return (
								<tr key={character.name} data-mplus-character={character.name}>
									<th scope="row" className="dash-col-char">
										<div className="dash-char-cell">
											<span
												className="dash-class-bar"
												aria-hidden="true"
												style={{ background: CLASS_COLORS[character.class] }}
											/>
											<div className="dash-char-text">
												<button
													type="button"
													className="dash-char-name"
													style={{ color: CLASS_COLORS[character.class] }}
													onClick={() => onOpenCharacter(character)}
												>
													{character.name}
												</button>
												<a
													className="dash-char-sub"
													href={characterProfileUrl(
														"rio",
														character.region,
														character.realmSlug ?? character.realm,
														character.name,
													)}
													target="_blank"
													rel="noopener noreferrer"
												>
													Raider.IO ↗
												</a>
											</div>
										</div>
									</th>
									<td className="dash-col-score" data-label="점수">
										{mplus ? (
											<div className="dash-score">
												<strong style={{ color: readableOnDark(mplus.scoreColor) }}>
													{Math.round(mplus.score).toLocaleString("ko-KR")}
												</strong>
												{mplus.scoreTierLabel && <small>{tierLabelKo(mplus.scoreTierLabel)}</small>}
											</div>
										) : (
											<MissingValue label="쐐기 점수 미확인" />
										)}
									</td>
									<td className="dash-num dash-mplus-rank" data-label="서버 / 한국 순위">
										{mplus ? (
											<span className="dash-rank">
												{mplus.realmRank.toLocaleString("ko-KR")}
												<small> / {mplus.regionRank.toLocaleString("ko-KR")}</small>
											</span>
										) : (
											<MissingValue />
										)}
									</td>
									<td className="dash-num dash-mplus-ilvl" data-label="템렙">
										{ilvl === null ? <MissingValue /> : ilvl.toFixed(1)}
									</td>
									{dungeons.map((d) => (
										<td key={d.key} className="dash-col-dungeon" data-label={d.shortName || d.name}>
											<RunCell run={runs.get(d.key)} />
										</td>
									))}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{!dungeons.length && <p className="dash-note">아직 수집된 쐐기 기록이 없습니다.</p>}
			<p className="dash-note">
				던전 칸은 이번 시즌 최고 단수입니다. 밝은 칸은 시간 내 완료, 흐린 칸은 시간 초과이며 칸을
				누르면 Raider.IO 기록이 열립니다. 점수·순위는 Raider.IO 캐릭터 전체 값입니다.
			</p>
		</section>
	);
}
