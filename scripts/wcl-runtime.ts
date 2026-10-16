/** Application policies, not advertised WCL service limits. */
export const WCL_POLICY = {
	reserveRatio: 0.2,
	maxRunMs: 20 * 60_000,
	coreTtlMs: 4 * 60 * 60_000,
	detailTtlMs: 12 * 60 * 60_000,
	metaTtlMs: 24 * 60 * 60_000,
	metadataTtlMs: 24 * 60 * 60_000,
	unknownBudgetCharacters: 1,
};

export type WclStage = "bootstrap" | "raid" | "detail" | "meta";
export interface PointBudget {
	limitPerHour: number;
	pointsSpentThisHour: number;
	pointsResetIn: number;
	observedAt: number;
}
export interface WclRuntimeState {
	cooldownUntil?: number;
	cooldownReason?: string;
	nextCharacterKey?: string;
	maxQueryCost?: Partial<Record<WclStage, number>>;
	maxCostPerSelection?: number;
}
export class WclDeferredError extends Error {
	constructor(
		message: string,
		public readonly retryAt?: number,
		public readonly attempted = false,
	) {
		super(message);
		this.name = "WclDeferredError";
	}
}

export function readPointBudget(value: unknown, now: number): PointBudget | undefined {
	if (!value || typeof value !== "object") return;
	const v = value as Record<string, unknown>;
	if (
		![v.limitPerHour, v.pointsSpentThisHour, v.pointsResetIn].every(
			(n) => typeof n === "number" && Number.isFinite(n),
		)
	)
		return;
	if (
		(v.limitPerHour as number) <= 0 ||
		(v.pointsSpentThisHour as number) < 0 ||
		(v.pointsResetIn as number) < 0
	)
		return;
	return {
		limitPerHour: v.limitPerHour as number,
		pointsSpentThisHour: v.pointsSpentThisHour as number,
		pointsResetIn: v.pointsResetIn as number,
		observedAt: now,
	};
}

export class WclRuntime {
	active = false;
	stage: WclStage = "bootstrap";
	budget?: PointBudget;
	state: WclRuntimeState = {};
	readonly telemetry = {
		httpAttempts: 0,
		retries: 0,
		successes: 0,
		http429: 0,
		serverErrors: 0,
		networkErrors: 0,
		queueWaitMs: 0,
		retryAfterMs: 0,
		quotaSamples: 0,
		invalidQuotaSamples: 0,
		cacheHits: 0,
		deferred: 0,
		byStage: {} as Partial<Record<WclStage, number>>,
	};
	private startedAt = 0;
	private stopReason?: string;
	private selectionWeight = 1;
	private changed: () => void = () => undefined;
	constructor(private now: () => number = () => Date.now()) {}
	activate(state: WclRuntimeState = {}, changed: () => void = () => undefined) {
		this.active = true;
		this.state = state;
		if ((state.cooldownUntil ?? 0) <= this.now()) {
			state.cooldownUntil = undefined;
			state.cooldownReason = undefined;
		}
		this.changed = changed;
		this.startedAt = this.now();
		this.budget = undefined;
		this.stopReason = undefined;
	}
	setStage(stage: WclStage) {
		this.stage = stage;
	}
	defer(reason: string, until?: number) {
		this.stopReason = reason;
		if (until && until > this.now()) {
			this.state.cooldownUntil = Math.max(this.state.cooldownUntil ?? 0, until);
			this.state.cooldownReason = reason;
		}
		this.telemetry.deferred++;
		this.changed();
	}
	assertCooldown() {
		if (!this.active) return;
		if (this.stopReason || (this.state.cooldownUntil ?? 0) > this.now())
			throw new WclDeferredError(
				this.stopReason ?? this.state.cooldownReason ?? "WCL 서버 대기 시간 · 다음 실행으로 이월",
				this.state.cooldownUntil,
			);
		if (this.now() - this.startedAt > WCL_POLICY.maxRunMs) {
			this.defer("애플리케이션 실행 시간 예산 · 다음 실행으로 이월");
			throw new WclDeferredError(this.stopReason ?? "실행 시간 예산");
		}
	}
	currentBudget() {
		const b = this.budget;
		return b && this.now() < b.observedAt + b.pointsResetIn * 1000 ? b : undefined;
	}
	beforeQuery(selectionWeight = 1) {
		this.assertCooldown();
		if (!this.active) return;
		const b = this.currentBudget();
		if (!b) {
			if (this.stage === "detail" || this.stage === "meta")
				throw new WclDeferredError("포인트 예산 미확인 · 낮은 우선순위 수집 이월");
			return; // Bootstrap/core may obtain a fresh sample; the scheduler bounds unknown-budget characters.
		}
		const remaining = b.limitPerHour - b.pointsSpentThisHour;
		const reserve = b.limitPerHour * WCL_POLICY.reserveRatio;
		this.selectionWeight = Math.max(1, selectionWeight);
		const estimated = Math.max(0, this.state.maxCostPerSelection ?? 0) * this.selectionWeight;
		if (remaining <= reserve + estimated) {
			const until = b.observedAt + b.pointsResetIn * 1000;
			this.defer(
				`WCL 포인트 예산 보류 (${remaining.toFixed(2)} 남음; 20% 안전 여유는 앱 정책)`,
				until,
			);
			throw new WclDeferredError(this.stopReason ?? "포인트 예산 보류", until);
		}
	}
	observeBudget(value: unknown) {
		if (!this.active) return;
		const next = readPointBudget(value, this.now());
		if (!next) {
			this.telemetry.invalidQuotaSamples++;
			this.budget = undefined;
			return;
		}
		const old = this.currentBudget();
		if (
			old &&
			Math.abs(
				old.observedAt + old.pointsResetIn * 1000 - next.observedAt - next.pointsResetIn * 1000,
			) < 5000 &&
			next.pointsSpentThisHour >= old.pointsSpentThisHour
		) {
			this.state.maxQueryCost ??= {};
			this.state.maxQueryCost[this.stage] = Math.max(
				this.state.maxQueryCost[this.stage] ?? 0,
				next.pointsSpentThisHour - old.pointsSpentThisHour,
			);
			this.state.maxCostPerSelection = Math.max(
				this.state.maxCostPerSelection ?? 0,
				(next.pointsSpentThisHour - old.pointsSpentThisHour) / this.selectionWeight,
			);
		}
		this.budget = next;
		this.telemetry.quotaSamples++;
		this.changed();
	}
	observeHttp(status: number | undefined, attempt: number) {
		if (!this.active) return;
		this.telemetry.httpAttempts++;
		this.telemetry.byStage[this.stage] = (this.telemetry.byStage[this.stage] ?? 0) + 1;
		if (attempt > 0) this.telemetry.retries++;
		if (status === undefined) this.telemetry.networkErrors++;
		else if (status === 429) this.telemetry.http429++;
		else if (status >= 500) this.telemetry.serverErrors++;
		else if (status >= 200 && status < 300) this.telemetry.successes++;
		if (status === undefined || status === 429 || status >= 500) this.budget = undefined;
	}
	checkpointCharacter(nextKey: string) {
		this.state.nextCharacterKey = nextKey;
		this.changed();
	}
	get summary() {
		return {
			policy: WCL_POLICY,
			...this.telemetry,
			budget: this.currentBudget(),
			nextEligibleAt: this.state.cooldownUntil,
			deferredReason:
				this.stopReason ??
				((this.state.cooldownUntil ?? 0) > this.now() ? this.state.cooldownReason : undefined),
			nextCharacterKey: this.state.nextCharacterKey,
		};
	}
}

export const wclRuntime = new WclRuntime();

/** Append telemetry to an existing, single-operation query. No additional HTTP probe is made. */
export function withPointBudget(query: string): string {
	const end = query.lastIndexOf("}");
	if (end < 0) throw new Error("Invalid collector query");
	return `${query.slice(0, end)} collectorBudget: rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn } ${query.slice(end)}`;
}

/** Migrate cooldowns recorded by the previous collector; never interpret arbitrary snapshot dates as cooldowns. */
export function snapshotCooldown(snapshot: unknown, now = Date.now()): number | undefined {
	let until = 0;
	function visit(value: unknown, key = "") {
		if (key === "deferredUntil" && typeof value === "string") {
			const at = Date.parse(value);
			if (Number.isFinite(at)) until = Math.max(until, at);
		}
		if (key === "issues" && Array.isArray(value))
			for (const issue of value)
				if (typeof issue === "string") {
					const match = issue.match(/retry after\s+(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
					if (match?.[1]) until = Math.max(until, Date.parse(match[1]));
				}
		if (value && typeof value === "object")
			for (const [child, item] of Object.entries(value)) visit(item, child);
	}
	visit(snapshot);
	return until > now ? until : undefined;
}
