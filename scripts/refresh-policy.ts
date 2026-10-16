import { readFileSync } from "node:fs";
import { URL } from "node:url";

/** Read the same UTC cron hours Actions executes; fail closed for unsupported cron syntax. */
export function readRefreshSchedule(
	source = readFileSync(new URL("../.github/workflows/refresh.yml", import.meta.url), "utf8"),
) {
	const hours = [...source.matchAll(/cron:\s*['"]0 ([\d,]+) \* \* \*['"]/g)].flatMap((m) =>
		(m[1] ?? "").split(",").map(Number),
	);
	if (!hours.length || hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23))
		throw new Error("Unsupported refresh schedule");
	return {
		utcHours: [...new Set(hours)].sort((a, b) => a - b),
		enabled: process.env.SCHEDULED_REFRESH_ENABLED === "true",
	};
}
