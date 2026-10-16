/** CI-only selector. Never logs or serializes credentials. */
export {};
const hasId = Boolean(process.env.WCL_CLIENT_ID);
const hasSecret = Boolean(process.env.WCL_CLIENT_SECRET);
if (process.env.REFRESH_META === "false") process.argv.push("--characters-only");

if (hasId !== hasSecret) {
	throw new Error("WCL configuration is incomplete. Configure both repository Secrets or neither.");
}

if (!hasId) {
	process.argv.push("--raiderio-only");
	console.log(
		"WCL is not configured: refreshing real public Raider.IO data only. Logs and meta remain explicitly unqueried.",
	);
}

const { main } = await import("./fetch-data.js");
await main();
