/**
 * Service worker for Howl's Moving Parses.
 *
 * Polls /howls-moving-parses/build-hash.json every 5 minutes. If the hash changes
 * since the last known value, posts a NEW_BUILD_AVAILABLE message to all open
 * clients. App.tsx listens for this and shows the dismissible banner.
 *
 * The known hash is persisted to Cache Storage so it survives SW suspension
 * (the browser kills idle SWs after ~30s). On re-activation, checkForNewBuild()
 * reads the persisted hash and compares it against the live hash, catching any
 * build that landed while the SW was dormant.
 */

/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;

const BUILD_HASH_URL = new URL("build-hash.json", self.registration.scope).href;
const POLL_INTERVAL_MS = 300_000; // 5 minutes
const HASH_CACHE_NAME = `build-hash-v2-${self.registration.scope}`;
const HASH_CACHE_KEY = new Request("/__hash__");

async function getStoredHash(): Promise<string | null> {
	try {
		const cache = await caches.open(HASH_CACHE_NAME);
		const res = await cache.match(HASH_CACHE_KEY);
		if (!res) return null;
		const data = (await res.json()) as { hash: string };
		return data.hash ?? null;
	} catch {
		return null;
	}
}

async function storeHash(hash: string): Promise<void> {
	try {
		const cache = await caches.open(HASH_CACHE_NAME);
		await cache.put(HASH_CACHE_KEY, new Response(JSON.stringify({ hash })));
	} catch {
		// ignore storage errors
	}
}

async function fetchCurrentHash(): Promise<string | null> {
	try {
		const res = await fetch(BUILD_HASH_URL, { cache: "no-store" });
		if (!res.ok) return null;
		const data = (await res.json()) as { hash: string };
		return data.hash ?? null;
	} catch {
		return null;
	}
}

async function checkForNewBuild() {
	const currentHash = await fetchCurrentHash();
	if (!currentHash) return;

	const storedHash = await getStoredHash();

	if (storedHash === null) {
		await storeHash(currentHash);
		return;
	}

	if (currentHash !== storedHash) {
		await storeHash(currentHash);
		const clients = await self.clients.matchAll({ type: "window" });
		for (const client of clients) {
			client.postMessage({ type: "NEW_BUILD_AVAILABLE" });
		}
	}
}

self.addEventListener("activate", (event) => {
	event.waitUntil(
		self.clients
			.claim()
			.then(checkForNewBuild)
			.then(() => {
				setInterval(checkForNewBuild, POLL_INTERVAL_MS);
			}),
	);
});

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "CHECK_FOR_UPDATE") event.waitUntil(checkForNewBuild());
});
