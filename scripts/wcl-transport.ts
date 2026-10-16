/** One queue for OAuth and GraphQL: retries hold the queue, so no request bypasses a cooldown. */
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

	request(url: string, init?: RequestInit): Promise<Response> {
		const result = this.queue.then(() => this.perform(url, init));
		this.queue = result.catch(() => undefined);
		return result;
	}

	private async perform(url: string, init?: RequestInit): Promise<Response> {
		const { now, sleep, random, intervalMs } = this.options;
		// Stop this run after exhausted 429 retries. A new queued query must not start a fresh retry storm.
		if (this.stoppedUntil) {
			throw new Error(
				`WCL rate limit: remaining requests skipped; retry after ${new Date(this.stoppedUntil).toISOString()}`,
			);
		}
		for (let attempt = 0; attempt < 5; attempt++) {
			const wait = this.nextRequestAt - now();
			if (wait > 0) await sleep(wait);
			this.nextRequestAt = now() + intervalMs;
			let response: Response | undefined;
			let networkError = false;
			try {
				response = await this.options.fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
				if (response.ok) {
					const body = response.body ? await response.arrayBuffer() : null;
					return new Response(body, { status: response.status, headers: response.headers });
				}
			} catch {
				networkError = true;
				response = undefined;
			}
			const status = response?.status;
			const limited = status === 429;
			const retryable =
				networkError || (status !== undefined && [429, 500, 502, 503, 504].includes(status));
			const serverDelay = retryAfterMs(response?.headers.get("Retry-After") ?? null, now());
			// HTTP-date and seconds are both supported. Never shorten a server cooldown.
			const exponential = (limited ? 30_000 : 2000) * 2 ** attempt;
			const delay = Math.max(serverDelay, exponential + Math.floor(random() * exponential * 0.1));
			await response?.body?.cancel();
			if (limited && (attempt === 4 || delay > 15 * 60_000)) {
				this.stoppedUntil = now() + delay;
				throw new Error(
					`WCL HTTP 429: collection paused; retry after ${new Date(this.stoppedUntil).toISOString()}`,
				);
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

export const wclTransport = new WclTransport();
