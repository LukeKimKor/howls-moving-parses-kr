import type { ReactNode } from "react";
import { classLabel, specLabel } from "../../lib/ko.js";
import {
	ROLE_LABELS,
	type SpecRaidValue,
	type SpecRole,
	missingRaidLabel,
} from "../../lib/roster.js";
import type { CharacterData } from "../../types/snapshot.js";
import { RaidPercent } from "../primitives/RaidPercent.js";
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
