import { WclDeferredError, wclRuntime } from "./wcl-runtime.js";
/** One queue for OAuth and GraphQL; server cooldowns defer the run instead of a retry storm. */
export class WclHttpError extends Error {
	constructor(public readonly status: number) {
		super(`WCL HTTP ${status}`);
	}
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
	if (!value) return 0;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

interface TransportOptions {
	fetch: typeof fetch;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	random: () => number;
	intervalMs: number;
	beforeRequest?: () => void;
	onAttempt?: (status: number | undefined, attempt: number) => void;
	onWait?: (ms: number) => void;
	onRetryAfter?: (ms: number) => void;
	onDeferred?: (reason: string, until: number) => void;
}
interface RequestHooks {
	beforeSend?: () => void;
	afterResponse?: (response: Response) => Promise<void>;
}

export class WclTransport {
	private queue: Promise<unknown> = Promise.resolve();
	private nextRequestAt = 0;
	private stoppedUntil = 0;
	private options: TransportOptions;

	constructor(options: Partial<TransportOptions> = {}) {
		this.options = {
			fetch: (...args) => fetch(...args),
			now: () => Date.now(),
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			random: () => Math.random(),
			intervalMs: 1500,
			...options,
		};
	}

	request(url: string, init?: RequestInit, hooks?: RequestHooks): Promise<Response> {
		const result = this.queue.then(() => this.perform(url, init, hooks));
		this.queue = result.catch(() => undefined);
		return result;
	}

	private async perform(url: string, init?: RequestInit, hooks?: RequestHooks): Promise<Response> {
		const { now, sleep, random, intervalMs } = this.options;
		// A deferred run must not start a fresh retry storm for the next queued query.
		if (this.stoppedUntil) {
			throw new WclDeferredError(
				`WCL remaining requests deferred; retry after ${new Date(this.stoppedUntil).toISOString()}`,
				this.stoppedUntil,
			);
		}
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				this.options.beforeRequest?.();
				hooks?.beforeSend?.();
			} catch (error) {
				if (error instanceof WclDeferredError && attempt > 0)
					throw new WclDeferredError(error.message, error.retryAt, true);
				throw error;
			}
			const wait = this.nextRequestAt - now();
			if (wait > 0) {
				this.options.onWait?.(wait);
				await sleep(wait);
			}
			this.nextRequestAt = now() + intervalMs;
			let response: Response | undefined;
			let networkError = false;
			try {
				response = await this.options.fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
				if (response.ok) {
					const body = response.body ? await response.arrayBuffer() : null;
					this.options.onAttempt?.(response.status, attempt);
					const buffered = new Response(body, {
						status: response.status,
						headers: response.headers,
					});
					await hooks?.afterResponse?.(buffered.clone());
					return buffered;
				}
			} catch {
				networkError = true;
				response = undefined;
			}
			const status = response?.status;
			this.options.onAttempt?.(status, attempt);
			const limited = status === 429;
			const retryable =
				networkError || (status !== undefined && [429, 500, 502, 503, 504].includes(status));
			const serverDelay = retryAfterMs(response?.headers.get("Retry-After") ?? null, now());
			if (serverDelay > 0) this.options.onRetryAfter?.(serverDelay);
			// HTTP-date and seconds are both supported. Never shorten a server cooldown.
			const exponential = (limited ? 30_000 : 2000) * 2 ** attempt;
			const delay = Math.max(serverDelay, exponential + Math.floor(random() * exponential * 0.1));
			await response?.body?.cancel();
			if (limited || (retryable && delay > 30_000)) {
				this.stoppedUntil = now() + delay;
				const reason = `WCL HTTP ${status ?? "network"}: 다음 실행으로 이월; retry after ${new Date(this.stoppedUntil).toISOString()}`;
				this.options.onDeferred?.(reason, this.stoppedUntil);
				throw new WclDeferredError(reason, this.stoppedUntil, true);
			}
			if (!retryable || attempt === 4) {
				if (status !== undefined) throw new WclHttpError(status);
				throw new Error("WCL network request failed after retries");
			}
			this.nextRequestAt = Math.max(this.nextRequestAt, now() + delay);
			console.warn(
				`  WCL ${status ?? "network"}: attempt ${attempt + 1}/5 failed; queue waits ${Math.ceil(delay / 1000)}s`,
			);
		}
		throw new Error("WCL request failed");
	}
}

export const wclTransport = new WclTransport({
	beforeRequest: () => wclRuntime.assertCooldown(),
	onAttempt: (status, attempt) => wclRuntime.observeHttp(status, attempt),
	onWait: (ms) => {
		if (wclRuntime.active) wclRuntime.telemetry.queueWaitMs += ms;
	},
	onRetryAfter: (ms) => {
		if (wclRuntime.active)
			wclRuntime.telemetry.retryAfterMs = Math.max(wclRuntime.telemetry.retryAfterMs, ms);
	},
	onDeferred: (reason, until) => {
		if (wclRuntime.active) wclRuntime.defer(reason, until);
	},
});
