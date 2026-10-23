import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	collectionMessages,
	collectionTime,
	deferredCollectionWarning,
	retainedCooldownReason,
} from "./collection-messages.js";

describe("collector display messages", () => {
	it("normalizes retained budget and server reasons without leaking old errors or UTC text", () => {
		const until = Date.parse("2026-10-23T04:10:05.751Z");
		expect(
			retainedCooldownReason("WCL 포인트 예산 보류 (776.79 남음; 20% 안전 여유는 앱 정책)", until),
		).toBe(collectionMessages.pointBudgetDeferred(776.79));
		expect(retainedCooldownReason(collectionMessages.pointBudgetDeferred(776.79), until)).toBe(
			collectionMessages.pointBudgetDeferred(776.79),
		);
		expect(
			retainedCooldownReason("WCL HTTP 429: retry after 2026-10-23T04:10:05.751Z", until),
		).toBe(collectionMessages.transportDeferred(429, until));
		expect(retainedCooldownReason("unpredictable provider error", until)).toBe(
			collectionMessages.previousCooldown,
		);
	});
	it("formats display times in KST, including date and year boundaries", () => {
		expect(collectionTime("2026-10-23T04:10:05.751Z")).toBe("10. 23. 13:10 KST");
		expect(collectionTime(Date.parse("2026-12-31T15:01:00Z"))).toBe("01. 01. 00:01 KST");
	});
	it("shows a KST retry time and preserves the reason and data-retention notice", () => {
		const reason = collectionMessages.pointBudgetDeferred(776.79);
		const warning = deferredCollectionWarning(reason, Date.parse("2026-10-23T04:10:05.751Z"));
		expect(warning).toContain(reason);
		expect(warning).toContain("재시도 가능 시각 10. 23. 13:10 KST");
		expect(warning).toContain("완료된 성적과 이전 데이터는 유지했습니다");
		expect(warning).not.toContain("2026-10-23T");
		expect(deferredCollectionWarning(reason)).not.toContain("재시도 가능 시각");
	});
	it("covers every Korean glyph in representative messages with the committed core font", () => {
		const manifest = JSON.parse(readFileSync("public/fonts/core-manifest.json", "utf8")) as {
			unicodes: number[];
		};
		const glyphs = new Set(manifest.unicodes);
		const samples = [
			...Object.values(collectionMessages).filter((v): v is string => typeof v === "string"),
			collectionMessages.raidDifficultyFailed(4),
			collectionMessages.encounterFailed(1),
			collectionMessages.pointBudgetDeferred(776.79),
			collectionMessages.transportDeferred(429, 0),
			collectionMessages.transportDeferred(undefined, 0),
			collectionMessages.queuedDeferred(0),
			collectionMessages.partialWarning(1, 13, 2, 14),
			deferredCollectionWarning(collectionMessages.wclDeferred, 1),
		];
		const missing = [...new Set(samples.join("").match(/[가-힣]/gu))]
			.filter((c) => !glyphs.has(c.codePointAt(0) as number))
			.sort();
		expect(missing, `Missing core font glyphs: ${missing.join(" · ")}`).toEqual([]);
	});
});
