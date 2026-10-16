import type { CollectionStatus } from "../../types/snapshot.js";

export function collectionFailureMessage(status?: CollectionStatus): string | undefined {
	if (status?.deferred) return "갱신 보류 · 아직 기록 유무를 확인하지 못했습니다.";
	if (status?.state !== "partial" && status?.state !== "failed") return undefined;
	return "조회에 실패한 항목이 있습니다. 공개 기록 없음으로 판단할 수 없습니다.";
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
		<output className="collection-notice">
			<strong>
				{label}:{" "}
				{status.deferred
					? "갱신 보류 · 이전 데이터 또는 미확인 상태 유지"
					: status.cacheHits
						? "캐시 재사용"
						: text}
			</strong>
			{status.failedRequests > 0 && (
				<span>
					{" "}
					· 요청 {status.attemptedRequests}건 중 {status.failedRequests}건 실패 (재시도 후)
				</span>
			)}
			{status.retainedAt && (
				<span>
					{" "}
					· 이전 데이터 표시 (
					{new Date(status.retainedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST)
				</span>
			)}
			{status.issues.length > 0 && <small>{status.issues.join(" · ")}</small>}
		</output>
	);
}
