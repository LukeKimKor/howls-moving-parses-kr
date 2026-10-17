import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("patch-only CLI (isolated synthetic cache; no network)", () => {
	it("makes only schema/patch requests and preserves original records and timestamps", () => {
		const temporaryBase = resolve(tmpdir());
		const folder = mkdtempSync(join(temporaryBase, "hmp-patches-"));
		// Resolve and verify the target before recursive cleanup on Windows and other hosts.
		const verifiedFolder = resolve(folder);
		if (
			dirname(verifiedFolder) !== temporaryBase ||
			!basename(verifiedFolder).startsWith("hmp-patches-")
		)
			throw new Error("Unsafe synthetic test cleanup target");
		const previous = {
			generatedAt: "2026-10-17T00:00:00Z",
			buildHash: "synthetic-before",
			region: "kr",
			raid: { id: 53, name: "Synthetic Raid", encounters: [] },
			characters: [{ name: "Synthetic Character", untouchedLog: { value: 0 } }],
			specs: { untouchedMeta: { value: 123 } },
			warnings: ["Existing collection warning"],
		};
		const schema = {
			zoneType: {
				name: "Zone",
				fields: [
					{
						name: "partitions",
						type: { kind: "LIST", name: null, ofType: { kind: "OBJECT", name: "Partition" } },
					},
				],
			},
			partitionType: {
				name: "Partition",
				fields: [
					{ name: "id", type: { kind: "SCALAR", name: "Int" } },
					{ name: "name", type: { kind: "SCALAR", name: "String" } },
				],
			},
			characterType: {
				name: "Character",
				fields: [
					{
						name: "zoneRankings",
						args: [
							{
								name: "partition",
								description: "Synthetic argument description",
								defaultValue: null,
							},
						],
					},
				],
			},
		};
		try {
			mkdirSync(join(folder, "cache"));
			writeFileSync(join(folder, "cache/last-snapshot.json"), JSON.stringify(previous));
			const script = `import fs from 'node:fs';
process.env.WCL_CLIENT_ID='synthetic-id';process.env.WCL_CLIENT_SECRET='synthetic-secret';process.env.GITHUB_STEP_SUMMARY='';
const calls=[];
globalThis.fetch=async(url,init)=>{
 if(url==='https://www.warcraftlogs.com/oauth/token'){calls.push('token');return new Response(JSON.stringify({access_token:'synthetic-token'}));}
 if(url!=='https://www.warcraftlogs.com/api/v2/client')throw Error('Synthetic test refused unexpected network target');
 const q=JSON.parse(init.body).query;
 const budget={limitPerHour:100,pointsSpentThisHour:1,pointsResetIn:300};
 if(!q.includes('collectorBudget: rateLimitData'))throw Error('Missing point telemetry');
 if(q.includes('RaidPatchSchema')){calls.push('schema');return new Response(JSON.stringify({data:{...${JSON.stringify(schema)},collectorBudget:budget}}));}
 if(q.includes('RaidPatchNames')){calls.push('metadata');return new Response(JSON.stringify({data:{worldData:{zone:{id:53,name:'Synthetic Raid',partitions:[{id:1,name:'Synthetic patch A'}]}},collectorBudget:budget}}));}
 throw Error('Synthetic test refused character/spec collection');
};
process.argv.push('--patch-metadata-only');
const {main}=await import(${JSON.stringify(pathToFileURL(resolve("scripts/fetch-data.ts")).href)});
await main();fs.writeFileSync('calls.json',JSON.stringify(calls));`;
			writeFileSync(join(folder, "probe.mjs"), script);
			const require = createRequire(resolve("package.json"));
			const result = spawnSync(
				process.execPath,
				["--import", pathToFileURL(require.resolve("tsx")).href, join(folder, "probe.mjs")],
				{ cwd: folder, encoding: "utf8", timeout: 12000 },
			);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).not.toContain("synthetic-secret");
			expect(result.stdout).not.toContain("synthetic-token");
			expect(JSON.parse(readFileSync(join(folder, "calls.json"), "utf8"))).toEqual([
				"token",
				"schema",
				"metadata",
			]);
			const next = JSON.parse(readFileSync(join(folder, "cache/last-snapshot.json"), "utf8"));
			expect(next.characters).toEqual(previous.characters);
			expect(next.specs).toEqual(previous.specs);
			expect(next.generatedAt).toBe(previous.generatedAt);
			expect(next.warnings).toEqual(previous.warnings);
			expect(next.raidPatchMetadata.partitions).toEqual([{ id: 1, name: "Synthetic patch A" }]);
			expect(JSON.parse(readFileSync(join(folder, "public/snapshot.json"), "utf8"))).toEqual(next);
		} finally {
			rmSync(verifiedFolder, { recursive: true, force: true });
		}
	}, 15000);
});
