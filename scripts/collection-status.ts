import { AsyncLocalStorage } from "node:async_hooks";
import { collectionMessages } from "../src/lib/collection-messages.js";
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

export function recordDeferral(issue: string, until?: number): void {
	const status = scope.getStore();
	if (!status) return;
	status.deferred = true;
	status.deferredUntil = until ? new Date(until).toISOString() : undefined;
	recordIssue(issue);
}

export function recordCached(at: number): void {
	const status = scope.getStore();
	if (!status) return;
	status.cacheHits = (status.cacheHits ?? 0) + 1;
	const iso = new Date(at).toISOString();
	if (!status.retainedAt || iso < status.retainedAt) status.retainedAt = iso;
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
			recordIssue(collectionMessages.processingFailed);
		}
		const populated = hasData(data);
		status.state =
			status.deferred ||
			(!!status.cacheHits && status.attemptedRequests === 0 && !status.issues.length)
				? "skipped"
				: status.issues.length
					? populated || status.attemptedRequests > status.failedRequests
						? "partial"
						: "failed"
					: populated
						? "ok"
						: "empty";
		if (
			!status.issues.length &&
			!status.deferred &&
			(!status.cacheHits || status.attemptedRequests > 0)
		)
			status.lastSuccessAt = status.retainedAt ?? new Date().toISOString();
		return { data, status };
	});
}

export function failed(status?: CollectionStatus): boolean {
	return status?.state === "partial" || status?.state === "failed";
}

export function combineCollectionStatuses(statuses: CollectionStatus[]): CollectionStatus {
	const issues = [...new Set(statuses.flatMap((s) => s.issues))];
	const failedAny = statuses.some(failed);
	return {
		deferred: statuses.some((s) => s.deferred),
		deferredUntil: statuses.find((s) => s.deferredUntil)?.deferredUntil,
		state: statuses.every((s) => s.state === "skipped")
			? "skipped"
			: failedAny
				? statuses.some((s) => s.state === "ok" || s.state === "empty" || s.state === "partial")
					? "partial"
					: "failed"
				: statuses.some((s) => s.state === "ok")
					? "ok"
					: "empty",
		attemptedRequests: statuses.reduce((n, s) => n + s.attemptedRequests, 0),
		failedRequests: statuses.reduce((n, s) => n + s.failedRequests, 0),
		issues,
		retainedAt: statuses.find((s) => s.retainedAt)?.retainedAt,
		lastSuccessAt: !failedAny ? statuses.find((s) => s.lastSuccessAt)?.lastSuccessAt : undefined,
	};
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
	if (
		(failed(status) || status.deferred || status.cacheHits) &&
		previous !== undefined &&
		hasData(previous)
	) {
		status.retainedAt = previousStatus?.retainedAt ?? previousStatus?.lastSuccessAt ?? previousAt;
		// Keep the complete previous section; do not mix populations/usage denominators from two runs.
		return previous;
	}
	return data;
}
