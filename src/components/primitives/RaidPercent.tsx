/** WCL percentile bands: 0 grey, 25 green, 50 blue, 75 purple, 95 orange, 99 pink, 100 gold. */
export function wclBand(value: number) {
	return value >= 100
		? "gold"
		: value >= 99
			? "pink"
			: value >= 95
				? "orange"
				: value >= 75
					? "purple"
					: value >= 50
						? "blue"
						: value >= 25
							? "green"
							: "grey";
}

export function RaidPercent({ value }: { value: number }) {
	const band = wclBand(value);
	return <span className={`raid-percent wcl-${band}`}>{value.toFixed(1)}%</span>;
}
