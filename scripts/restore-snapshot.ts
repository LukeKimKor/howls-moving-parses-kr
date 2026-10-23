import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { Snapshot } from "../src/types/snapshot.js";
import type { CharactersConfig } from "./config-validation.js";
import { toRealmSlug } from "./realm-slug.js";

/** Bootstrap older deployments that embedded the public snapshot only in JS. Never execute bundle code. */
export function extractPublishedSnapshot(source: string): Snapshot {
	const file = ts.createSourceFile(
		"published.js",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	const declarations = new Map<string, ts.Expression>();
	let candidate: ts.ObjectLiteralExpression | undefined;
	function visit(node: ts.Node) {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
			declarations.set(node.name.text, node.initializer);
		if (ts.isObjectLiteralExpression(node)) {
			const names = node.properties.map((p) =>
				p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))
					? p.name.text
					: p.name?.getText(file),
			);
			if (["characters", "generatedAt"].every((k) => names.includes(k))) candidate = node;
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	function literal(node: ts.Expression, depth = 0): unknown {
		if (depth > 50) throw new Error("Snapshot expression is too deep");
		if (ts.isStringLiteralLike(node)) return node.text;
		if (ts.isNumericLiteral(node)) return Number(node.text);
		if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
		if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
		if (node.kind === ts.SyntaxKind.NullKeyword) return null;
		if (ts.isIdentifier(node)) {
			const value = declarations.get(node.text);
			if (value) return literal(value, depth + 1);
		}
		if (ts.isArrayLiteralExpression(node))
			return node.elements.map((n) => literal(n as ts.Expression, depth + 1));
		if (ts.isObjectLiteralExpression(node))
			return Object.fromEntries(
				node.properties.map((p) => {
					if (!ts.isPropertyAssignment(p) || !p.name || ts.isComputedPropertyName(p.name))
						throw new Error("Non-literal property");
					const name =
						ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)
							? p.name.text
							: p.name.getText(file);
					return [name, literal(p.initializer, depth + 1)];
				}),
			);
		if (
			ts.isCallExpression(node) &&
			node.expression.getText(file) === "JSON.parse" &&
			node.arguments.length === 1
		) {
			const arg = node.arguments[0];
			if (arg && ts.isStringLiteralLike(arg)) return JSON.parse(arg.text);
		}
		throw new Error("Snapshot is not a literal JSON expression");
	}
	if (!candidate) throw new Error("No public snapshot expression found");
	return literal(candidate) as Snapshot;
}

export async function restoreSnapshot(): Promise<void> {
	let cached: Snapshot | undefined;
	if (existsSync("cache/last-snapshot.json")) {
		try {
			cached = JSON.parse(readFileSync("cache/last-snapshot.json", "utf8")) as Snapshot;
		} catch {
			/* Read published fallback. */
		}
	}
	const address = process.env.PREVIOUS_SITE_URL;
	if (!address) return;
	const base = new URL(address);
	if (base.protocol !== "https:") throw new Error("Previous site must use HTTPS");
	const get = async (url: URL) => {
		if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
			throw new Error("Cross-site snapshot fetch refused");
		return fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
	};
	try {
		let snapshot: Snapshot;
		const response = await get(new URL("snapshot.json", base));
		if (response.ok) snapshot = (await response.json()) as Snapshot;
		else {
			const html = await get(base);
			if (!html.ok) throw new Error(`Published site HTTP ${html.status}`);
			const src = (await html.text()).match(/<script[^>]+src="([^"]*assets\/main-[^"]+\.js)"/)?.[1];
			if (!src) throw new Error("Published bundle unavailable");
			const bundle = await get(new URL(src, base));
			if (!bundle.ok) throw new Error(`Published bundle HTTP ${bundle.status}`);
			snapshot = extractPublishedSnapshot(await bundle.text());
			if (!snapshot.dataMode)
				snapshot.dataMode = snapshot.characters.some((c) =>
					Object.values(c.specs).some((s) => s.logs),
				)
					? "full"
					: "raiderio-only";
		}
		const config = JSON.parse(readFileSync("characters.config.json", "utf8")) as CharactersConfig;
		if (
			!Array.isArray(snapshot.characters) ||
			!Number.isFinite(Date.parse(snapshot.generatedAt)) ||
			typeof snapshot.buildHash !== "string" ||
			(snapshot.region !== undefined &&
				!config.characters.every((c) => c.region === snapshot.region)) ||
			!snapshot.characters.every(
				(c) =>
					c &&
					typeof c.name === "string" &&
					typeof c.region === "string" &&
					typeof c.realm === "string" &&
					(c.realmSlug === undefined || typeof c.realmSlug === "string") &&
					Array.isArray(c.specOrder) &&
					c.specOrder.every((slug) => typeof slug === "string") &&
					c.specs &&
					typeof c.specs === "object" &&
					!Array.isArray(c.specs) &&
					Object.values(c.specs).every((spec) => spec && typeof spec === "object"),
			)
		)
			throw new Error("Published snapshot identity/shape mismatch");
		// A renamed or newly configured character must not discard the other
		// characters' retained records, nor be guessed from an old name.
		snapshot = {
			...snapshot,
			characters: snapshot.characters.filter((p) =>
				config.characters.some(
					(c) =>
						p.name === c.name &&
						p.region === c.region &&
						(p.realmSlug ?? toRealmSlug(p.realm)) === (c.realmSlug ?? toRealmSlug(c.realm)),
				),
			),
		};
		if (!snapshot.characters.length)
			throw new Error("Published snapshot has no matching characters");
		mkdirSync("cache", { recursive: true });
		if (cached && Date.parse(cached.generatedAt) >= Date.parse(snapshot.generatedAt)) return;
		writeFileSync("cache/last-snapshot.json", JSON.stringify(snapshot));
		console.log(`✓ Previous public snapshot restored (${snapshot.generatedAt})`);
	} catch (err) {
		console.warn(
			`Previous snapshot unavailable; continuing without retained data: ${err instanceof Error ? err.message : "read failed"}`,
		);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	await restoreSnapshot();
