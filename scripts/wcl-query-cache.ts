import { createHash } from "node:crypto";
import { WCL_POLICY, type WclStage } from "./wcl-runtime.js";

interface CacheEntry {
	at: number;
	data: Record<string, unknown>;
}

function metadataResponse(data: Record<string, unknown> | undefined) {
	const world = data?.worldData as
		| { zones?: unknown[]; zone?: { encounters?: unknown[] } }
		| undefined;
	const schema = data?.__type as { enumValues?: unknown[] } | undefined;
	return (
		Array.isArray(world?.zones) ||
		Array.isArray(world?.zone?.encounters) ||
		Array.isArray(schema?.enumValues)
	);
}

export class WclQueryCache {
	bypass = false;
	entries: Record<string, CacheEntry> = {};
	private changed: () => void = () => undefined;
	activate(entries: Record<string, CacheEntry>, changed: () => void) {
		// Hashed keys from retired detail/meta queries are not carried into new caches.
		this.entries = Object.fromEntries(
			Object.entries(entries).filter(([, entry]) => metadataResponse(entry?.data)),
		);
		this.changed = changed;
	}
	key(query: string, variables?: Record<string, unknown>) {
		return createHash("sha256")
			.update(query)
			.update(JSON.stringify(variables ?? {}))
			.digest("hex");
	}
	get(
		query: string,
		variables: Record<string, unknown> | undefined,
		stage: WclStage,
		now = Date.now(),
	) {
		if (this.bypass || stage === "raid" || query.includes("RefreshZoneBudget")) return;
		const entry = this.entries[this.key(query, variables)];
		const ttl = stage === "detail" ? WCL_POLICY.detailTtlMs : WCL_POLICY.metadataTtlMs;
		if (
			!entry ||
			!Number.isFinite(entry.at) ||
			now < entry.at ||
			now - entry.at >= ttl ||
			!entry.data ||
			typeof entry.data !== "object"
		)
			return;
		return { data: structuredClone(entry.data), at: entry.at };
	}
	put(
		query: string,
		variables: Record<string, unknown> | undefined,
		stage: WclStage,
		input: Record<string, unknown>,
		now = Date.now(),
	) {
		if (stage === "raid" || query.includes("RefreshZoneBudget")) return;
		const data = structuredClone(
			Object.fromEntries(Object.entries(input).filter(([key]) => key !== "collectorBudget")),
		);
		// Cache only known valid response shapes, never null character/encounter failures or OAuth responses.
		if (!metadataResponse(data)) return;
		this.entries[this.key(query, variables)] = { at: now, data };
		for (const [key, entry] of Object.entries(this.entries))
			if (now - entry.at >= WCL_POLICY.metadataTtlMs) delete this.entries[key];
		this.changed();
	}
}
export const wclQueryCache = new WclQueryCache();
