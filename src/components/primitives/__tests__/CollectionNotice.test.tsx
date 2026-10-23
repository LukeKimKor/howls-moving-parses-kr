import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CollectionStatus } from "../../../types/snapshot.js";
import { CollectionNotice, collectionNeedsAttention } from "../CollectionNotice.js";

const base = { attemptedRequests: 0, failedRequests: 0, issues: [] };
const ttl: CollectionStatus = {
	...base,
	state: "skipped",
	cacheHits: 1,
	retainedAt: "2026-10-18T00:00:00Z",
};

function tone(status: CollectionStatus, hasData?: boolean) {
	const { container } = render(
		<CollectionNotice label="영웅 전체 피해" status={status} hasData={hasData} />,
	);
	const notice = container.querySelector(".collection-notice") as HTMLElement;
	return { notice, attention: notice.classList.contains("is-attention") };
}

describe("collection notices", () => {
	it("shows a failure as unknown records, with rate limit and retained date", () => {
		render(
			<CollectionNotice
				label="Arms 쐐기 메타"
				status={{
					state: "failed",
					attemptedRequests: 8,
					failedRequests: 8,
					issues: ["WCL HTTP 429"],
					retainedAt: "2026-10-16T22:01:39.083Z",
				}}
			/>,
		);
		expect(screen.getByText(/기록 유무를 확인할 수 없습니다/)).toBeInTheDocument();
		expect(screen.getByText(/WCL HTTP 429/)).toBeInTheDocument();
		expect(screen.getByText(/이전 데이터 표시/)).toBeInTheDocument();
	});
	it("shows real empty records only after a successful query", () => {
		render(
			<CollectionNotice
				label="레이드 로그"
				status={{ state: "empty", attemptedRequests: 2, failedRequests: 0, issues: [] }}
			/>,
		);
		expect(screen.getByText(/조회 완료 · 공개 기록 없음/)).toBeInTheDocument();
	});

	it("treats a TTL reuse that kept no-kill rows as neutral reused data", () => {
		expect(collectionNeedsAttention(ttl, true)).toBe(false);
		const { notice, attention } = tone(ttl, true);
		expect(attention).toBe(false);
		expect(notice).toHaveTextContent("이전에 받은 데이터 사용");
		expect(notice).not.toHaveTextContent("미조회");
	});
	it("treats a TTL reuse with recorded rows as neutral even without a cache-hit count", () => {
		const restored: CollectionStatus = { ...base, state: "skipped" };
		expect(collectionNeedsAttention(restored, true)).toBe(false);
		expect(tone(restored, true).notice).toHaveTextContent("이전에 받은 데이터 사용");
	});
	it("keeps a skipped section whose rows are all unavailable as a warning 미조회", () => {
		expect(collectionNeedsAttention(ttl, false)).toBe(true);
		const { notice, attention } = tone(ttl, false);
		expect(attention).toBe(true);
		expect(notice).toHaveTextContent("미조회");
		expect(collectionNeedsAttention({ ...base, state: "skipped" })).toBe(true);
	});
	it("lets failures, deferrals and failed requests win over kept rows", () => {
		const failed: CollectionStatus = { ...base, state: "failed", cacheHits: 1 };
		expect(collectionNeedsAttention(failed, true)).toBe(true);
		expect(tone(failed, true).notice).toHaveTextContent(
			"조회 실패 · 기록 유무를 확인할 수 없습니다",
		);
		const deferred: CollectionStatus = { ...ttl, deferred: true };
		expect(collectionNeedsAttention(deferred, true)).toBe(true);
		expect(tone(deferred, true).notice).toHaveTextContent("갱신 보류");
		expect(collectionNeedsAttention({ ...ttl, failedRequests: 1 }, true)).toBe(true);
	});
});
