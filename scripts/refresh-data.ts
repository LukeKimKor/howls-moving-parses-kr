/** CI-only selector. Never logs or serializes credentials. */
export {};
// Legacy meta/all scopes safely refresh characters; regional meta is retired.
const requested = process.env.REFRESH_SCOPE || "characters";
const scope = ["meta", "all"].includes(requested) ? "characters" : requested;
if (!["characters", "cache", "patches"].includes(scope)) throw new Error("Unknown refresh scope");
if (scope === "cache") process.argv.push("--cache-only");
else if (scope === "patches") process.argv.push("--patch-metadata-only");
else if (scope === "characters") process.argv.push("--characters-only");
if (process.env.FORCE_REFRESH === "true") process.argv.push("--force-refresh");
// Cache builds do not inspect credentials and cannot make provider requests.
if (scope !== "cache") {
	const hasId = Boolean(process.env.WCL_CLIENT_ID);
	const hasSecret = Boolean(process.env.WCL_CLIENT_SECRET);

	if (hasId !== hasSecret) {
		throw new Error(
			"WCL configuration is incomplete. Configure both repository Secrets or neither.",
		);
	}

	if (!hasId) {
		if (scope === "patches")
			throw new Error(
				"Patch metadata requires existing repository WCL Secrets; no public-provider fallback is requested.",
			);
		process.argv.push("--raiderio-only");
		console.log(
			"WCL is not configured: refreshing real public Raider.IO data only. Raid logs remain explicitly unqueried.",
		);
	}
}

const { main } = await import("./fetch-data.js");
await main();
