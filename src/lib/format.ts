/**
 * Formats a clear time in milliseconds as "mm:ss" (e.g. 1800000 → "30:00").
 */
export function formatClearTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Formats a number with thousands separators (e.g. 3142 → "3,142").
 */
export function formatNumber(n: number): string {
	return n.toLocaleString("en-GB");
}

/**
 * Returns a score tier colour CSS class name based on the WoW M+ tier labels.
 */
export function tierColorClass(tierLabel: string): string {
	switch (tierLabel) {
		case "Myth":
			return "tier-myth";
		case "Legend":
			return "tier-legend";
		case "Celestial":
			return "tier-celestial";
		case "Ethereal":
			return "tier-ethereal";
		case "Immortal":
			return "tier-immortal";
		case "Awakened":
			return "tier-awakened";
		case "Keystone Master":
			return "tier-master";
		case "Keystone Hero":
			return "tier-hero";
		case "Keystone Conqueror":
			return "tier-conqueror";
		case "Keystone Challenger":
			return "tier-challenger";
		default:
			return "tier-default";
	}
}
