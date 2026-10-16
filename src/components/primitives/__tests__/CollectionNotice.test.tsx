import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CollectionNotice } from "../CollectionNotice.js";

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
});
