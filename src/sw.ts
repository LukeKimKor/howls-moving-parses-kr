/**
 * Service worker for Howl's Moving Parses.
 *
 * Reads build-hash.json under the registration scope (the Pages base path, e.g.
 * /howls-moving-parses-kr/) and reports the deployed hash as a NEW_BUILD_AVAILABLE
 * message: to every open page on activation and every 5 minutes, and to the asking
 * page on each CHECK_FOR_UPDATE (sent by main.tsx on load, focus, visibility and
 * every 5 minutes). DashboardPage shows the dismissible banner only when that hash
 * differs from the build the page actually loaded (snapshot.buildHash), so the
 * worker keeps no "last known" hash and a missed broadcast is recovered by the
 * page's next check (src/lib/build-check.ts).
 */

/// <reference lib="webworker" />
import { type MessageTarget, createBuildCheck } from "./lib/build-check.js";

declare const self: ServiceWorkerGlobalScope;

const BUILD_HASH_URL = new URL("build-hash.json", self.registration.scope).href;
const POLL_INTERVAL_MS = 300_000; // 5 minutes
// Earlier workers persisted the last broadcast hash here; it is no longer used.
const LEGACY_HASH_CACHE = `build-hash-v2-${self.registration.scope}`;

async function fetchCurrentHash(): Promise<string | null> {
	try {
		const res = await fetch(BUILD_HASH_URL, { cache: "no-store" });
		if (!res.ok) return null;
		const data = (await res.json()) as { hash?: unknown };
		return typeof data.hash === "string" && data.hash ? data.hash : null;
	} catch {
		return null;
	}
}

const buildCheck = createBuildCheck(fetchCurrentHash, () =>
	self.clients.matchAll({ type: "window", includeUncontrolled: true }),
);

self.addEventListener("activate", (event) => {
	event.waitUntil(
		Promise.all([self.clients.claim(), caches.delete(LEGACY_HASH_CACHE).catch(() => false)])
			.then(() => buildCheck.broadcast())
			.then(() => {
				setInterval(() => void buildCheck.broadcast(), POLL_INTERVAL_MS);
			}),
	);
});

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "CHECK_FOR_UPDATE")
		event.waitUntil(buildCheck.reply(event.source as MessageTarget | null));
});
