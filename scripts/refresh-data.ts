/** CI-only selector. Never logs or serializes credentials. */
export {};
const scope =
	process.env.REFRESH_SCOPE || (process.env.REFRESH_META === "true" ? "all" : "characters");
if (!["characters", "meta", "all", "cache", "patches"].includes(scope))
	throw new Error("Unknown refresh scope");
if (scope === "cache") process.argv.push("--cache-only");
else if (scope === "patches") process.argv.push("--patch-metadata-only");
else if (scope === "meta") process.argv.push("--meta-only");
else if (scope === "characters" && process.env.REFRESH_META !== "true")
	process.argv.push("--characters-only");
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
			"WCL is not configured: refreshing real public Raider.IO data only. Logs and meta remain explicitly unqueried.",
		);
	}
}

const { main } = await import("./fetch-data.js");
await main();
