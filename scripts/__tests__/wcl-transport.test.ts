import { describe, expect, it, vi } from "vitest";
import { WclTransport, retryAfterMs } from "../wcl-transport.js";

function setup(responses: Array<Response | Error>) {
	let time = Date.parse("2026-10-16T23:00:00Z");
	const starts: number[] = [];
	const waits: number[] = [];
	const request = vi.fn(async () => {
		starts.push(time);
		const response = responses.shift();
		if (response instanceof Error) throw response;
		if (!response) throw new Error("Fixture exhausted");
		return response;
	});
	const transport = new WclTransport({
		fetch: request,
		now: () => time,
		random: () => 0,
		sleep: async (ms) => {
			waits.push(ms);
			time += ms;
		},
	});
	return { transport, request, starts, waits };
}

describe("WCL queue and server cooldown", () => {
	it("parses seconds and HTTP-date Retry-After values", () => {
		const now = Date.parse("2026-10-16T23:00:00Z");
		expect(retryAfterMs("120", now)).toBe(120_000);
		expect(retryAfterMs("Fri, 16 Oct 2026 23:02:00 GMT", now)).toBe(120_000);
		expect(retryAfterMs("invalid", now)).toBe(0);
		expect(retryAfterMs(null, now)).toBe(0);
	});
	it("serializes concurrent requests with at least 1.5s between starts", async () => {
		const s = setup([new Response("a"), new Response("b"), new Response("c")]);
		await Promise.all([
			s.transport.request("a"),
			s.transport.request("b"),
			s.transport.request("c"),
		]);
		expect(s.starts.map((t) => t - (s.starts[0] ?? 0))).toEqual([0, 1500, 3000]);
	});
	it("defers all queued requests immediately on server Retry-After", async () => {
		const s = setup([
			new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
			new Response(null, { status: 429 }),
			new Response("ok"),
			new Response("next"),
		]);
		const results = await Promise.allSettled([s.transport.request("a"), s.transport.request("b")]);
		expect(results.every((r) => r.status === "rejected")).toBe(true);
		expect(s.request).toHaveBeenCalledTimes(1);
		expect(s.waits).toEqual([]);
	});
	it("stops the run after exhausted 429 retries instead of retrying every queued query", async () => {
		const s = setup(Array.from({ length: 5 }, () => new Response(null, { status: 429 })));
		const results = await Promise.allSettled([
			s.transport.request("a"),
			s.transport.request("b"),
			s.transport.request("c"),
		]);
		expect(results.every((r) => r.status === "rejected")).toBe(true);
		expect(s.request).toHaveBeenCalledTimes(1);
		expect(s.waits).toEqual([]);
	});
	it("does not shorten a long server cooldown or block CI indefinitely", async () => {
		const s = setup([new Response(null, { status: 429, headers: { "Retry-After": "3600" } })]);
		await expect(s.transport.request("a")).rejects.toThrow("10. 17. 09:00 KST");
		await expect(s.transport.request("b")).rejects.toThrow("WCL 남은 조회 보류");
		expect(s.request).toHaveBeenCalledTimes(1);
		expect(s.waits).toEqual([]);
	});
	it("retries transient 503/network errors but never retries 401", async () => {
		const s = setup([
			new Error("offline"),
			new Response(null, { status: 503, headers: { "Retry-After": "10" } }),
			new Response("ok"),
		]);
		await s.transport.request("a");
		expect(s.waits).toEqual([2000, 10_000]);
		const denied = setup([new Response(null, { status: 401 })]);
		await expect(denied.transport.request("auth")).rejects.toThrow("WCL HTTP 401");
		expect(denied.request).toHaveBeenCalledTimes(1);
	});
});
