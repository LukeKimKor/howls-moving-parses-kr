/**
 * Build-hash check shared by the service worker (src/sw.ts) and its tests.
 *
 * The worker does not decide whether a page is out of date: it only reports the deployed
 * hash, and each page compares it with the build it loaded (isNewerBuild in DashboardPage).
 * So a page that missed one broadcast (listener attached late, not yet controlled) still
 * recovers on its next focus or 5-minute CHECK_FOR_UPDATE, which is always answered.
 */

export const BUILD_HASH_MESSAGE = "NEW_BUILD_AVAILABLE";

export interface BuildHashMessage {
	type: typeof BUILD_HASH_MESSAGE;
	hash: string;
}

export interface MessageTarget {
	postMessage(message: BuildHashMessage): void;
}

export function createBuildCheck(
	fetchHash: () => Promise<string | null>,
	windows: () => Promise<readonly MessageTarget[]>,
) {
	const message = (hash: string): BuildHashMessage => ({ type: BUILD_HASH_MESSAGE, hash });
	return {
		/** Tell every open page the deployed hash (activation and the worker's own polling). */
		async broadcast(): Promise<void> {
			const hash = await fetchHash();
			if (!hash) return;
			for (const client of await windows()) client.postMessage(message(hash));
		},
		/** Answer one page's CHECK_FOR_UPDATE with the deployed hash, changed or not. */
		async reply(source: MessageTarget | null | undefined): Promise<void> {
			if (!source) return;
			const hash = await fetchHash();
			if (hash) source.postMessage(message(hash));
		},
	};
}
