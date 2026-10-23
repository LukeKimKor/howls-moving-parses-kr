import type { CSSProperties, ReactNode } from "react";
import { starPoints, starRank } from "../../lib/all-stars.js";
import { collectionTime } from "../../lib/collection-messages.js";
import { classLabel, difficultyLabel, specLabel } from "../../lib/ko.js";
import type { KillProgress } from "../../lib/raid-overview.js";
import {
	ILVL_TIERS,
	ROLE_LABELS,
	type SpecRaidValue,
	type SpecRole,
	ilvlTier,
	missingRaidLabel,
} from "../../lib/roster.js";
import type { CharacterData } from "../../types/snapshot.js";
import { RaidPercent, wclBand } from "../primitives/RaidPercent.js";
import { CLASS_COLORS, SpecIcon } from "../primitives/SpecIcon.js";

/** Shared building blocks so every dashboard tab renders tables the same way. */

export function CharacterCell({
	character,
	sub,
}: {
	character: CharacterData;
	sub?: ReactNode;
}) {
	const color = CLASS_COLORS[character.class];
	return (
		<div className="dash-char-cell">
			<span className="dash-class-bar" aria-hidden="true" style={{ background: color }} />
			<div className="dash-char-text">
				<span className="dash-char-name" style={{ color }}>
					{character.name}
				</span>
				<span className="dash-char-sub">{sub ?? classLabel(character.class)}</span>
			</div>
		</div>
	);
}

export function SpecChip({ character, specName }: { character: CharacterData; specName: string }) {
	return (
		<span className="dash-spec-chip">
			{/* The visible label already names the spec; the icon is decorative here. */}
			<span aria-hidden="true" className="dash-spec-icon">
				<SpecIcon className={character.class} specName={specName} />
			</span>
			{specLabel(specName, character.class)}
		</span>
	);
}

/** One percentile in its own cell; missing values say why they are missing. */
export function PctValue({
	value,
	state,
	emphasis = false,
}: {
	value: number | null;
	state: SpecRaidValue["state"];
	emphasis?: boolean;
}) {
	if (value === null) return <span className="dash-empty">{missingRaidLabel(state)}</span>;
	return (
		<span className={emphasis ? "dash-pct dash-pct-strong" : "dash-pct"}>
			<RaidPercent value={value} />
		</span>
	);
}

/**
 * Bosses killed with this spec at one difficulty ("6/10") plus a one-segment-per-boss bar.
 * Sits first in each difficulty group so the percentiles beside it read with their sample size.
 * A zero count is shown only when boss rows carry real data; otherwise the cell says why it is missing.
 */
export function KillValue({ progress }: { progress: KillProgress | undefined }) {
	if (!progress || progress.total === 0) return <span className="dash-empty">—</span>;
	const { killed, total, state, difficulty, known } = progress;
	if (!known) return <span className="dash-empty">{missingRaidLabel(state)}</span>;
	const partial = state === "partial" || state === "failed";
	// Kept after a failed/partial/deferred refresh: say so on screen, not only in the tooltip.
	const mark = !progress.retained ? null : state === "partial" ? "일부 실패" : "이전 기록";
	const markTitle =
		state === "partial"
			? "최근 조회가 일부 실패해 실제보다 적을 수 있음"
			: `최근 조회 실패·보류로 이전 기록 표시${progress.retainedAt ? ` (${collectionTime(progress.retainedAt)})` : ""}`;
	const title = `${difficultyLabel(difficulty)} 우두머리 ${total}개 중 ${killed}개 처치${partial ? " · 일부 조회 실패로 실제보다 적을 수 있음" : ""}${mark ? ` · ${markTitle}` : ""}`;
	const tone = killed === total ? " dash-kills-full" : killed === 0 ? " dash-kills-none" : "";
	return (
		<span className={`dash-kills${tone}`} title={title}>
			<span className="dash-kills-count">
				<strong>{killed}</strong>
				<span className="dash-kills-total">/{total}</span>
			</span>
			<span className="dash-kills-bar" aria-hidden="true">
				{Array.from({ length: total }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative segments
					<span key={i} className={i < killed ? "is-killed" : undefined} />
				))}
			</span>
			{mark && (
				<span className="dash-stale-mark" title={markTitle}>
					{mark}
				</span>
			)}
		</span>
	);
}

export function SortHeader<K extends string>({
	sortKey,
	current,
	onSort,
	children,
	className,
	rowSpan,
}: {
	rowSpan?: number;
	sortKey: K;
	current: K;
	onSort: (key: K) => void;
	children: ReactNode;
	className?: string;
}) {
	const active = current === sortKey;
	return (
		<th
			scope="col"
			rowSpan={rowSpan}
			className={className}
			aria-sort={active ? "descending" : "none"}
		>
			<button
				type="button"
				className="dash-sort"
				aria-pressed={active}
				onClick={() => onSort(sortKey)}
			>
				{children}
				<span aria-hidden="true" className="dash-sort-mark">
					{active ? "▼" : ""}
				</span>
			</button>
		</th>
	);
}

export function RoleHeading({
	role,
	count,
	note,
}: { role: SpecRole; count: number; note?: ReactNode }) {
	return (
		<div className="dash-role-heading">
			<span className={`dash-role-badge dash-role-${role}`}>{ROLE_LABELS[role]}</span>
			<span className="dash-role-count">{count}개 전문화</span>
			{note && <span className="dash-role-note">{note}</span>}
		</div>
	);
}

export function Segment<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: Array<{ value: T; label: string }>;
	onChange: (value: T) => void;
}) {
	return (
		<fieldset className="dash-segment" aria-label={label}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</fieldset>
	);
}

/**
 * "—" for a missing All Stars value, with the reason (e.g. no entry for the selected patch)
 * as a tooltip and for screen readers, so it is not mistaken for a failed collection.
 */
function StarMissing({ note }: { note?: string }) {
	if (!note) return <span className="dash-empty">—</span>;
	return (
		<span className="dash-empty" title={note}>
			<span aria-hidden="true">—</span>
			<span className="dash-sr-only">{note}</span>
		</span>
	);
}

/** All Stars points in WCL's fixed points colour. */
export function StarPointsValue({
	value,
	missingNote,
}: { value: number | null | undefined; missingNote?: string }) {
	const text = starPoints(value);
	return text === "—" ? (
		<StarMissing note={missingNote} />
	) : (
		<span className="wcl-points">{text}</span>
	);
}

/** All Stars rank coloured by WCL's rank percentile (same bands as parse percentiles). */
export function StarRankValue({
	rank,
	rankPercent,
	total,
	missingNote,
}: {
	rank: number | null | undefined;
	rankPercent?: number | null;
	total?: number | null;
	missingNote?: string;
}) {
	const text = starRank(rank);
	if (text === "—") return <StarMissing note={missingNote} />;
	if (rankPercent == null || !Number.isFinite(rankPercent))
		return (
			<span className="dash-rank-plain" title="다음 WCL 수집 후 색상이 표시됩니다">
				{text}
			</span>
		);
	const title = `상위 ${Math.max(0, 100 - rankPercent).toFixed(1)}%${total ? ` · 전체 ${total.toLocaleString("ko-KR")}명` : ""}`;
	return (
		<span className={`raid-percent wcl-${wclBand(rankPercent)}`} title={title}>
			{text}
		</span>
	);
}

/** Equipped item level coloured by Mistcrest graduation band. */
export function IlvlValue({ value }: { value: number | null }) {
	if (value === null) return <span className="dash-empty">—</span>;
	const tier = ilvlTier(value);
	return (
		<span className={`raid-percent wcl-${tier.band} dash-ilvl`} title={tier.label}>
			{value.toFixed(1)}
		</span>
	);
}

export function IlvlLegend() {
	return (
		<p className="dash-legend" aria-label="아이템 레벨 색상 기준">
			<span>템렙 색상</span>
			{ILVL_TIERS.map((tier) => (
				<span key={tier.min}>
					<span className={`raid-percent wcl-${tier.band}`}>{tier.min}+</span> {tier.label}
				</span>
			))}
			<span>· All Stars 순위 색은 WCL 상위 비율 기준</span>
		</p>
	);
}

/** Row props that tint a character's row with its class colour (strength is set in dashboard.css). */
export function classRow(character: CharacterData): { className: string; style: CSSProperties } {
	return {
		className: "dash-class-row",
		style: { "--class-color": CLASS_COLORS[character.class] ?? "#8e9bb0" } as CSSProperties,
	};
}
