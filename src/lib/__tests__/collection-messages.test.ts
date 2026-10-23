import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	collectionMessages,
	collectionTime,
	deferredCollectionWarning,
	displayWarning,
	retainedCooldownReason,
} from "../collection-messages.js";

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
		const transport = collectionMessages.transportDeferred(
			429,
			Date.parse("2026-10-23T04:10:05.751Z"),
		);
		expect(
			deferredCollectionWarning(transport, Date.parse("2026-10-23T04:10:05.751Z")).split(
				"재시도 가능 시각",
			),
		).toHaveLength(2);
		expect(retainedCooldownReason(collectionMessages.transportDeferred(503, 0), 1)).toBe(
			collectionMessages.transportDeferred(503, 1),
		);
	});
	it("shows warnings saved by older collectors in the current wording", () => {
		const until = Date.parse("2026-10-23T04:10:05.751Z");
		expect(
			displayWarning(
				"갱신 보류: WCL 포인트 예산 보류 (776.79 남음; 20% 안전 여유는 앱 정책) · 재시도 가능 시각 2026-10-23T04:10:05.751Z. 완료된 성적과 캐시는 보존했습니다.",
			),
		).toBe(deferredCollectionWarning(collectionMessages.pointBudgetDeferred(776.79), until));
		expect(
			displayWarning("갱신 보류: WCL 미조회 · 캐시 보존. 완료된 성적과 캐시는 보존했습니다."),
		).toBe(deferredCollectionWarning(collectionMessages.wclRetained));
		expect(
			displayWarning(
				"일부 항목 수집 실패: 캐릭터 1/13, 메타 2/14. 이전 데이터 시각과 각 조회 상태를 확인하세요.",
			),
		).toBe(collectionMessages.partialWarning(1, 13, 2, 14));
		expect(displayWarning("실제 Raider.IO 공개 데이터입니다. WCL은 미조회 상태입니다.")).toBe(
			collectionMessages.publicOnly,
		);
		const current = deferredCollectionWarning(collectionMessages.wclDeferred, until);
		expect(displayWarning(current)).toBe(current);
	});
	it("converts the current public budget warning to the new wording with a KST retry time", () => {
		const shown = displayWarning(
			"갱신 보류: WCL 포인트 예산 보류 (776.79 남음; 20% 안전 여유는 앱 정책) · 재시도 가능 시각 2026-10-23T04:10:05.751Z. 완료된 성적과 캐시는 보존했습니다.",
		);
		expect(shown).toContain(collectionMessages.pointBudgetDeferred(776.79));
		expect(shown).toContain("재시도 가능 시각 10. 23. 13:10 KST");
		expect(shown).not.toContain("2026-10-23T");
	});
	it("keeps warnings it cannot fully recognize verbatim", () => {
		for (const warning of [
			"알 수 없는 형식의 경고",
			"갱신 보류: WCL unfamiliar reason. 완료된 성적과 캐시는 보존했습니다.",
			"갱신 보류: WCL HTTP 503. 완료된 성적과 캐시는 보존했습니다.",
			"갱신 보류: WCL 포인트 예산 보류 (776.79 남음; 20% 안전 여유는 앱 정책) · 재시도 가능 시각 2026-99-23T04:10:05.751Z. 완료된 성적과 캐시는 보존했습니다.",
			deferredCollectionWarning(collectionMessages.pointBudgetDeferred(776.79), 1),
			collectionMessages.publicOnly,
		])
			expect(displayWarning(warning)).toBe(warning);
	});
	it("keeps the collector fallback for unrecognized retained reasons", () => {
		expect(retainedCooldownReason("WCL unfamiliar reason", 1, collectionMessages.wclDeferred)).toBe(
			collectionMessages.wclDeferred,
		);
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
			collectionMessages.transportDeferred(503, 0),
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
