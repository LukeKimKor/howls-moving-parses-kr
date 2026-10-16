import { AsyncLocalStorage } from "node:async_hooks";
import type { CollectionCounts, CollectionStatus } from "../src/types/snapshot.js";

const scope = new AsyncLocalStorage<CollectionStatus>();

export function recordRequest(failed = false, issue?: string): void {
	const status = scope.getStore();
	if (!status) return;
	status.attemptedRequests++;
	if (failed) status.failedRequests++;
	if (issue && !status.issues.includes(issue)) status.issues.push(issue);
}

export function recordIssue(issue: string): void {
	const status = scope.getStore();
	if (status && !status.issues.includes(issue)) status.issues.push(issue);
}

export async function collect<T>(
	fn: () => Promise<T>,
	hasData: (data: T) => boolean,
	fallback: T,
	enabled = true,
): Promise<{ data: T; status: CollectionStatus }> {
	const status: CollectionStatus = {
		state: "skipped",
		attemptedRequests: 0,
		failedRequests: 0,
		issues: [],
	};
	if (!enabled) return { data: fallback, status };
	return scope.run(status, async () => {
		let data = fallback;
		try {
			data = await fn();
		} catch {
			recordIssue("조회 처리 실패");
		}
		const populated = hasData(data);
		status.state = status.issues.length
			? populated || status.attemptedRequests > status.failedRequests
				? "partial"
				: "failed"
			: populated
				? "ok"
				: "empty";
		if (!status.issues.length) status.lastSuccessAt = new Date().toISOString();
		return { data, status };
	});
}

export function failed(status?: CollectionStatus): boolean {
	return status?.state === "partial" || status?.state === "failed";
}

export function countCollections(
	groups: Array<Array<CollectionStatus | undefined>>,
): CollectionCounts {
	const counts: CollectionCounts = {
		tracked: groups.length,
		complete: 0,
		partial: 0,
		failed: 0,
		skipped: 0,
	};
	for (const group of groups) {
		const statuses = group.filter((s): s is CollectionStatus => !!s);
		if (!statuses.length || statuses.every((s) => s.state === "skipped")) counts.skipped++;
		else if (statuses.every((s) => s.state === "failed")) counts.failed++;
		else if (statuses.some((s) => failed(s))) counts.partial++;
		else counts.complete++;
	}
	return counts;
}

export function retain<T>(
	data: T,
	status: CollectionStatus,
	previous: T | undefined,
	previousStatus: CollectionStatus | undefined,
	previousAt: string | undefined,
	hasData: (value: T) => boolean,
): T {
	if (failed(status) && previous !== undefined && hasData(previous)) {
		status.retainedAt = previousStatus?.retainedAt ?? previousStatus?.lastSuccessAt ?? previousAt;
		// Keep the complete previous section; do not mix populations/usage denominators from two runs.
		return previous;
	}
	return data;
}
