import type { Snapshot } from "../types/snapshot.js";

export function nextScheduledAt(hours: number[], now = Date.now()): string | undefined {
	const next = hours
		.flatMap((h) =>
			[0, 1].map((day) => {
				const date = new Date(now);
				date.setUTCDate(date.getUTCDate() + day);
				date.setUTCHours(h, 0, 0, 0);
				return date.getTime();
			}),
		)
		.filter((at) => at > now)
		.sort((a, b) => a - b)[0];
	return next === undefined ? undefined : new Date(next).toISOString();
}
export function raidLastSuccess(snapshot: Snapshot): string | undefined {
	const dates = snapshot.characters
		.flatMap((c) =>
			Object.values(c.specs).flatMap((s) =>
				Object.values(s.raidPerformance ?? {}).flatMap((m) =>
					Object.values(m).map((d) => d.collection.lastSuccessAt ?? d.collection.retainedAt),
				),
			),
		)
		.filter((d): d is string => !!d && Number.isFinite(Date.parse(d)))
		.sort((a, b) => Date.parse(b) - Date.parse(a));
	return dates[0];
}
export const kstTime = (date: string | number) =>
	new Intl.DateTimeFormat("ko-KR", {
		timeZone: "Asia/Seoul",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(date));
