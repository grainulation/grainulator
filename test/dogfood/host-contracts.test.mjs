import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(
	new URL("../../hooks/write-guard.cjs", import.meta.url),
);
const invoke = (input, env = {}) =>
	spawnSync(process.execPath, [guard], {
		input,
		encoding: "utf8",
		env: { ...process.env, CLAUDE_HOOK_CONTEXT: "", ...env },
	});
test("Claude stdin hook blocks protected writes with the blocking exit code", () => {
	for (const file_path of [
		"/tmp/sprint/claims.json",
		"claims.json",
		"C:\\sprint\\compilation.json",
	]) {
		const result = invoke(
			JSON.stringify({ tool_name: "Write", tool_input: { file_path } }),
		);
		assert.equal(result.status, 2);
		assert.match(result.stderr, /BLOCKED/);
	}
});
test("write guard leaves ordinary files alone and supports legacy context", () => {
	assert.equal(
		invoke(
			JSON.stringify({ tool_input: { file_path: "/tmp/claims.json.notes" } }),
		).status,
		0,
	);
	assert.equal(
		invoke("", {
			CLAUDE_HOOK_CONTEXT: JSON.stringify({
				tool_input: { file_path: "/tmp/claims.json" },
			}),
		}).status,
		2,
	);
});
test("stdin takes precedence over stale legacy hook context", () => {
	assert.equal(
		invoke(JSON.stringify({ tool_input: { file_path: "/tmp/claims.json" } }), {
			CLAUDE_HOOK_CONTEXT: '{"tool_input":{"file_path":"/tmp/notes.md"}}',
		}).status,
		2,
	);
});
