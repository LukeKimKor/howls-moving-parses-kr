import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps Korean collector string literals in the shared display-message catalog", () => {
	const violations: string[] = [];
	for (const name of readdirSync("scripts").filter(
		(name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
	)) {
		const source = ts.createSourceFile(
			name,
			readFileSync(join("scripts", name), "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const visit = (node: ts.Node) => {
			if (
				(ts.isStringLiteralLike(node) ||
					ts.isTemplateHead(node) ||
					ts.isTemplateMiddle(node) ||
					ts.isTemplateTail(node)) &&
				/[가-힣]/u.test(node.text)
			) {
				violations.push(
					`${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.text}`,
				);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	expect(violations).toEqual([]);
});
