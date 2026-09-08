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
			path.join(root, "packages/evidence/bin/wheat.js"),
			"init",
			"--headless",
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
test("compatibility scaffold preserves malformed or existing canonical MCP configuration", (t) => {
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
test("compatibility scaffold registers only unified local tools and current workflow instructions", (t) => {
	const dir = initialize(t);
	const config = JSON.parse(fs.readFileSync(path.join(dir, ".mcp.json")));
	assert.deepEqual(Object.keys(config.mcpServers), ["grainulator"]);
	assert.equal(config.mcpServers.grainulator.command, process.execPath);
	assert.ok(config.mcpServers.grainulator.args.includes("mcp"));
	const instructions = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
	assert.match(instructions, /\*\*Auto\*\*/);
	assert.doesNotMatch(instructions, /Wheat|wheat|auto-commits/);
	assert.equal(fs.existsSync(path.join(dir, ".claude/commands/wheat")), false);
	assert.equal(
		fs.existsSync(path.join(dir, ".claude/commands/grainulator/research.md")),
		true,
	);
});
