// Generated from typescript/test/dogfood/legacy-scaffold.test.mts; edit that source and run npm run build:types.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
function initialize(t, previousConfig) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-scaffold-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
	if (previousConfig !== undefined)
		fs.writeFileSync(path.join(dir, ".mcp.json"), previousConfig);
	const env = { ...process.env };
	delete env.CLAUDE_PLUGIN_ROOT;
	const result = spawnSync(
		process.execPath,
		[
			path.join(root, "bin/grainulator.js"),
			"init",
			"--dir",
			dir,
			"--question",
			"Does this preserve the host?",
			"--audience",
			"self",
			"--constraints",
			"Local only",
			"--done",
			"Host configuration remains intact",
		],
		{ encoding: "utf8", env, timeout: 15000 },
	);
	assert.equal(result.status, 0, result.stderr);
	return dir;
}
test("canonical initialization preserves malformed or existing canonical MCP configuration", (t) => {
	for (const previous of [
		'{"broken":',
		JSON.stringify({ mcpServers: null }),
		JSON.stringify({ mcpServers: false }),
		JSON.stringify({
			mcpServers: { grainulator: { command: "custom-agent", args: ["keep"] } },
		}),
	]) {
		const dir = initialize(t, previous);
		assert.equal(
			fs.readFileSync(path.join(dir, ".mcp.json"), "utf8"),
			previous,
		);
		assert.equal(fs.existsSync(path.join(dir, ".git/hooks/pre-commit")), false);
	}
});
test("canonical initialization creates no host registrations or instructions", (t) => {
	const dir = initialize(t);
	for (const name of [
		".mcp.json",
		"CLAUDE.md",
		"AGENTS.md",
		".claude/commands",
	])
		assert.equal(fs.existsSync(path.join(dir, name)), false);
	assert.ok(fs.existsSync(path.join(dir, "claims.json")));
});
