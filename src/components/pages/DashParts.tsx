import type { CSSProperties, ReactNode } from "react";
import { starPoints, starRank } from "../../lib/all-stars.js";
import { classLabel, specLabel } from "../../lib/ko.js";
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
	onOpen,
	sub,
}: {
	character: CharacterData;
	onOpen?: (character: CharacterData) => void;
	sub?: ReactNode;
}) {
	const color = CLASS_COLORS[character.class];
	return (
		<div className="dash-char-cell">
			<span className="dash-class-bar" aria-hidden="true" style={{ background: color }} />
			<div className="dash-char-text">
				{onOpen ? (
					<button
						type="button"
						className="dash-char-name"
						style={{ color }}
						onClick={() => onOpen(character)}
						title="쐐기·장비·특성 상세 보기"
					>
						{character.name}
					</button>
				) : (
					<span className="dash-char-name" style={{ color }}>
						{character.name}
					</span>
				)}
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

/** All Stars points in WCL's fixed points colour. */
export function StarPointsValue({ value }: { value: number | null | undefined }) {
	const text = starPoints(value);
	return text === "—" ? (
		<span className="dash-empty">—</span>
	) : (
		<span className="wcl-points">{text}</span>
	);
}

/** All Stars rank coloured by WCL's rank percentile (same bands as parse percentiles). */
export function StarRankValue({
	rank,
	rankPercent,
	total,
}: {
	rank: number | null | undefined;
	rankPercent?: number | null;
	total?: number | null;
}) {
	const text = starRank(rank);
	if (text === "—") return <span className="dash-empty">—</span>;
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
