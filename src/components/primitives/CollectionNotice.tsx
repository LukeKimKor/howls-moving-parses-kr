import { collectionTime } from "../../lib/collection-messages.js";
import type { CollectionStatus } from "../../types/snapshot.js";

/**
 * A `skipped` section is either a TTL reuse of earlier data or a real "not fetched yet".
 * `hasData` (the section still holds real rows) tells them apart; without it a cache hit counts as reuse.
 */
function reusedEarlierData(status: CollectionStatus, hasData?: boolean): boolean {
	return hasData ?? Boolean(status.cacheHits);
}

/**
 * Failed, partial, deferred and not-yet-fetched results need attention; a successful lookup
 * (including "no public records" and reusing earlier data within the refresh interval) does not.
 */
export function collectionNeedsAttention(status: CollectionStatus, hasData?: boolean): boolean {
	return (
		status.state === "failed" ||
		status.state === "partial" ||
		Boolean(status.deferred) ||
		status.failedRequests > 0 ||
		(status.state === "skipped" && !reusedEarlierData(status, hasData))
	);
}

function noticeText(status: CollectionStatus, hasData?: boolean): string {
	if (status.deferred) return "갱신 보류 · 이전 데이터 또는 미확인 상태 유지";
	if (status.state === "failed") return "조회 실패 · 기록 유무를 확인할 수 없습니다";
	if (status.state === "partial") return "일부 조회 실패 · 기록 없음과 다릅니다";
	if (status.state === "skipped")
		return reusedEarlierData(status, hasData) ? "이전에 받은 데이터 사용" : "미조회";
	if (status.cacheHits) return "이전에 받은 데이터 사용";
	return status.state === "empty" ? "조회 완료 · 공개 기록 없음" : "조회 완료";
}

export function CollectionNotice({
	label,
	status,
	hasData,
}: {
	label: string;
	status?: CollectionStatus;
	/** The section still holds real rows (e.g. a TTL skip kept earlier boss rows). */
	hasData?: boolean;
}) {
	if (!status || (status.state === "ok" && !status.retainedAt)) return null;
	return (
		<output
			className={`collection-notice ${collectionNeedsAttention(status, hasData) ? "is-attention" : "is-neutral"}`}
		>
			<strong>
				{label}: {noticeText(status, hasData)}
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
