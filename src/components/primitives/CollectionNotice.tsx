import { collectionTime } from "../../lib/collection-messages.js";
import type { CollectionStatus } from "../../types/snapshot.js";

/**
 * Failed, partial, deferred and not-yet-fetched results need attention; a successful lookup
 * (including "no public records" and reusing earlier data within the refresh interval) does not.
 */
export function collectionNeedsAttention(status: CollectionStatus): boolean {
	return (
		status.state === "failed" ||
		status.state === "partial" ||
		status.state === "skipped" ||
		Boolean(status.deferred) ||
		status.failedRequests > 0
	);
}

export function CollectionNotice({ label, status }: { label: string; status?: CollectionStatus }) {
	if (!status || (status.state === "ok" && !status.retainedAt)) return null;
	const text = {
		ok: "조회 완료",
		empty: "조회 완료 · 공개 기록 없음",
		partial: "일부 조회 실패 · 기록 없음과 다릅니다",
		failed: "조회 실패 · 기록 유무를 확인할 수 없습니다",
		skipped: "미조회",
	}[status.state];
	return (
		<output
			className={`collection-notice ${collectionNeedsAttention(status) ? "is-attention" : "is-neutral"}`}
		>
			<strong>
				{label}:{" "}
				{status.deferred
					? "갱신 보류 · 이전 데이터 또는 미확인 상태 유지"
					: status.cacheHits
						? "이전에 받은 데이터 사용"
						: text}
			</strong>
			{status.failedRequests > 0 && (
				<span>
					{" "}
					· 요청 {status.attemptedRequests}건 중 {status.failedRequests}건 실패 (재시도 후)
				</span>
			)}
			{status.retainedAt && <span> · 이전 데이터 표시 ({collectionTime(status.retainedAt)})</span>}
			{status.issues.length > 0 && <small>{status.issues.join(" · ")}</small>}
		</output>
	);
}
