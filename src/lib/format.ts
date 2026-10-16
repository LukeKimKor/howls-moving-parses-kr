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
 * Formats a DPS/HPS value as a compact string (e.g. 136447 → "136.4k").
 */
export function formatDps(dps: number): string {
	if (dps >= 1_000_000) return `${(dps / 1_000_000).toFixed(1)}M`;
	if (dps >= 1_000) return `${(dps / 1_000).toFixed(1)}k`;
	return String(Math.round(dps));
}

/**
 * Formats an ISO date string in Europe/London time (GMT in winter, BST in summer).
 * The timezone abbreviation is appended automatically so it self-documents DST.
 * e.g. "2026-05-03T20:13:00.000Z" → "Sun 3 May · 21:13 BST"
 */
export function formatDateUtc(iso: string, region: "eu" | "kr" = "eu"): string {
	const d = new Date(iso);
	if (region === "kr")
		return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)} KST`;
	const fmt = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/London",
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		timeZoneName: "short",
	});
	const parts = fmt.formatToParts(d);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("weekday")} ${get("day")} ${get("month")} · ${get("hour")}:${get("minute")} ${get("timeZoneName")}`;
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

/**
 * Returns a parse percentage CSS class name based on WoW log parse colour conventions.
 */
export function parseColorClass(percent: number): string {
	if (percent >= 99) return "parse-legendary";
	if (percent >= 95) return "parse-epic";
	if (percent >= 75) return "parse-rare";
	if (percent >= 50) return "parse-uncommon";
	if (percent >= 25) return "parse-common";
	return "parse-poor";
}
