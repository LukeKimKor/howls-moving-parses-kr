// Conventional Commits check for the lefthook commit-msg hook.
// Kept in a file (not an inline shell script) so it runs the same on Windows and Unix.
import { readFileSync } from "node:fs";

const PATTERN =
	/^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\([a-z0-9-]+\))?: .+/m;

const message = readFileSync(process.argv[2], "utf8");

if (!PATTERN.test(message)) {
	console.error(`
  ✗ Commit message does not follow Conventional Commits format.

  Expected: <type>(<scope>): <description>
  Example:  feat(leaderboard): add EU region filter

  Valid types: feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert
`);
	process.exit(1);
}
