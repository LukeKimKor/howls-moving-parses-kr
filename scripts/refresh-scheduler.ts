import type { CollectionStatus } from "../src/types/snapshot.js";
import { WCL_POLICY, type WclRuntime } from "./wcl-runtime.js";

export function freshStatus(
	status: CollectionStatus | undefined,
	ttlMs: number,
	now = Date.now(),
): boolean {
	const at = status?.lastSuccessAt ?? status?.retainedAt;
	if (!at || status?.state === "failed" || status?.state === "partial") return false;
	const age = now - Date.parse(at);
	return Number.isFinite(age) && age >= 0 && age < ttlMs;
}

/** One character at a time. Checkpoints always contain every configured entry. */
export async function runCharacterBatches<T>(options: {
	items: T[];
	key: (item: T) => string;
	fresh: (item: T) => boolean;
	refresh: (item: T) => Promise<T>;
	defer: (item: T, reason: string) => T;
	checkpoint: (items: T[]) => void;
	runtime: WclRuntime;
}): Promise<T[]> {
	const items = [...options.items];
	const cursor = items.findIndex(
		(item) => options.key(item) === options.runtime.state.nextCharacterKey,
	);
	const order = items.map((_, i) => (i + Math.max(0, cursor)) % items.length);
	let unknownBudgetCompleted = 0;
	const attempted = new Set<string>();
	let reason: string | undefined;
	for (const index of order) {
		const item = items[index];
		if (item === undefined || options.fresh(item)) continue;
		try {
			options.runtime.assertCooldown();
			if (
				!options.runtime.currentBudget() &&
				unknownBudgetCompleted >= WCL_POLICY.unknownBudgetCharacters
			) {
				reason = "포인트 예산 미확인 · 작은 묶음 완료, 나머지는 다음 실행으로 이월";
				options.runtime.defer(reason);
				break;
			}
			options.runtime.beforeQuery();
		} catch (err) {
			reason = err instanceof Error ? err.message : "WCL 갱신 보류";
			break;
		}
		items[index] = await options.refresh(item);
		attempted.add(options.key(item));
		unknownBudgetCompleted++;
		const next = items[(index + 1) % items.length];
		if (next !== undefined) options.runtime.checkpointCharacter(options.key(next));
		options.checkpoint([...items]);
	}
	if (reason) {
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item !== undefined && !attempted.has(options.key(item)) && !options.fresh(item))
				items[i] = options.defer(item, reason);
		}
		options.checkpoint([...items]);
	}
	return items;
}
