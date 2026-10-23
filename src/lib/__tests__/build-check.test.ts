import { describe, expect, it, vi } from "vitest";
import { isNewerBuild } from "../../components/pages/DashboardPage.js";
import { type MessageTarget, createBuildCheck } from "../build-check.js";

const page = (loaded: string) => {
	const received: unknown[] = [];
	const target: MessageTarget = { postMessage: (m) => received.push(m) };
	// What DashboardPage does with each message: compare with the build it loaded.
	const banner = () =>
		received.some(
			(m) =>
				(m as { type?: string }).type === "NEW_BUILD_AVAILABLE" &&
				isNewerBuild((m as { hash?: unknown }).hash, loaded),
		);
	return { target, received, banner };
};

describe("service worker build check", () => {
	it("answers every CHECK_FOR_UPDATE with the deployed hash, so a missed broadcast recovers", async () => {
		let live = "A";
		const old = page("A");
		const check = createBuildCheck(
			async () => live,
			async () => [],
		);
		await check.reply(old.target);
		expect(old.received).toEqual([{ type: "NEW_BUILD_AVAILABLE", hash: "A" }]);
		expect(old.banner()).toBe(false);
		// B is deployed; the broadcast reached no listener (windows() was empty).
		live = "B";
		await check.broadcast();
		expect(old.banner()).toBe(false);
		// The next focus/5-minute check still learns about B — and again on the one after.
		await check.reply(old.target);
		await check.reply(old.target);
		expect(old.received.slice(1)).toEqual([
			{ type: "NEW_BUILD_AVAILABLE", hash: "B" },
			{ type: "NEW_BUILD_AVAILABLE", hash: "B" },
		]);
		expect(old.banner()).toBe(true);
	});

	it("broadcasts the deployed hash to every window; only pages on another build show the banner", async () => {
		const stale = page("A");
		const fresh = page("B");
		const check = createBuildCheck(
			async () => "B",
			async () => [stale.target, fresh.target],
		);
		await check.broadcast();
		await check.broadcast();
		expect(stale.received).toHaveLength(2);
		expect(stale.banner()).toBe(true);
		expect(fresh.banner()).toBe(false);
	});

	it("stays silent when the hash cannot be read or there is no one to answer", async () => {
		const target = { postMessage: vi.fn() };
		const check = createBuildCheck(
			async () => null,
			async () => [target],
		);
		await check.broadcast();
		await check.reply(target);
		await createBuildCheck(
			async () => "B",
			async () => [],
		).reply(null);
		expect(target.postMessage).not.toHaveBeenCalled();
	});
});
