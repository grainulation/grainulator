import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "../../packages/evidence/compiler/wheat-compiler.js";
import { addClaim, getStatus } from "../../packages/evidence/lib/claims-ops.js";
import nextActionsModule from "../../packages/evidence/lib/next-actions.cjs";
import { handleRequest } from "../../packages/evidence/lib/serve-mcp.js";

const { nextActions, formatNextActions } = nextActionsModule;
const root = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t, meta = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-next-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	fs.writeFileSync(
		path.join(dir, "claims.json"),
		JSON.stringify({
			schema_version: "1.0",
			meta: { question: "Does it work?", ...meta },
			claims: [],
		}),
	);
	return dir;
}
const add = (dir, id, topic, type = "factual") =>
	assert.equal(
		addClaim(dir, {
			id,
			topic,
			type,
			content: `Check ${topic}`,
			evidence: "tested",
		}).status,
		"ok",
	);
const compileDir = (dir) =>
	compile(
		path.join(dir, "claims.json"),
		path.join(dir, "compilation.json"),
		dir,
	);
function run(file, args, options = {}) {
	const result = spawnSync(process.execPath, [path.join(root, file), ...args], {
		encoding: "utf8",
		timeout: 15000,
		...options,
	});
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
}
const hook = (dir, level = "on") =>
	run("lib/tips-hook.cjs", [], {
		input: JSON.stringify({ tool_input: { dir } }),
		env: { ...process.env, CLAUDE_PLUGIN_OPTION_TIPS_LEVEL: level },
	});

test("blockers precede research and neither group invents a user approval", () => {
	const groups = nextActions({
		errors: [{ code: "E_CONFLICT" }],
		conflict_graph: { unresolved: [{ claimA: "r001", claimB: "r002" }] },
		coverage: { speed: { status: "weak" } },
	});
	assert.deepEqual(
		groups.auto.map((a) => a.command),
		["/resolve", "grainulator compile --summary --check"],
	);
	assert.deepEqual(groups.auto[0].claim_ids, ["r001", "r002"]);
	assert.deepEqual(groups.manual, []);
});

test("retired topics and stated user constraints do not create research chores", (t) => {
	const dir = fixture(t, { excluded_topics: ["retired-app"] });
	add(dir, "r001", "retired-app", "risk");
	add(dir, "f001", "user-scope", "constraint");
	const groups = compileDir(dir).next_actions;
	assert.doesNotMatch(JSON.stringify(groups), /retired-app|user-scope/);
	assert.equal(groups.auto[0].command, "/research <topic>");
	assert.ok(groups.auto.length >= 2 && groups.auto.length <= 3);
});

test("formatter displays only Auto and Manual lists, without diagnostic reasons", () => {
	assert.equal(
		formatNextActions({
			auto: [
				{
					label: "Verify session export",
					command: "grainulator compile",
					reason: "DO NOT PRINT",
				},
			],
			manual: [{ label: "Dogfood the installed build" }],
		}),
		"Auto\n\n- Verify session export (grainulator compile)\n\nManual\n\n- Dogfood the installed build",
	);
	assert.equal(
		formatNextActions({ auto: [], manual: [] }),
		"Auto\n\n- None.\n\nManual\n\n- None.",
	);
});

test("CLI, compiled artifact and MCP return the same grouped actions", async (t) => {
	const dir = fixture(t);
	add(dir, "r001", "session-export", "risk");
	const expected = compileDir(dir).next_actions;
	const cli = JSON.parse(
		run("bin/grainulator.js", ["compile", "--json", "--dir", dir]),
	);
	assert.deepEqual(cli.next_actions, expected);
	const display = run("bin/grainulator.js", ["compile", "--dir", dir]);
	assert.equal(display.trim(), formatNextActions(expected));
	for (const name of ["wheat/compile", "wheat/status"]) {
		const response = await handleRequest(
			dir,
			"tools/call",
			{ name, arguments: { dir } },
			1,
		);
		const value = JSON.parse(JSON.parse(response).result.content[0].text);
		assert.deepEqual(value.next_actions, expected);
		assert.match(value.next_actions_instruction, /Auto and Manual/);
	}
});

test("status detects stale evidence without writing the ledger or trusting old advice", (t) => {
	const dir = fixture(t);
	add(dir, "r001", "old-risk", "risk");
	compileDir(dir);
	add(dir, "r002", "new-risk", "risk");
	const before = fs.readFileSync(path.join(dir, "claims.json"));
	const stale = fs.readFileSync(path.join(dir, "compilation.json"));
	const result = getStatus(dir);
	assert.equal(result.compilation_status, "stale");
	assert.deepEqual(
		result.next_actions.auto.map((a) => a.command),
		["grainulator compile --summary"],
	);
	assert.deepEqual(result.next_actions.manual, []);
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), before);
	assert.deepEqual(fs.readFileSync(path.join(dir, "compilation.json")), stale);
});

test("legacy schema migration does not make a fresh compilation appear stale", (t) => {
	const dir = fixture(t);
	const file = path.join(dir, "claims.json");
	const data = JSON.parse(fs.readFileSync(file));
	delete data.schema_version;
	fs.writeFileSync(file, JSON.stringify(data));
	compileDir(dir);
	assert.notEqual(getStatus(dir).compilation_status, "stale");
});

test("hook refreshes consecutive mutations even when compilation is less than five seconds old", (t) => {
	const dir = fixture(t);
	add(dir, "r001", "first-risk", "risk");
	hook(dir);
	add(dir, "r002", "second-risk", "risk");
	// Reproduce the old debounce path deterministically without timing assumptions.
	fs.utimesSync(path.join(dir, "compilation.json"), new Date(), new Date());
	const context = JSON.parse(hook(dir)).hookSpecificOutput.additionalContext;
	assert.match(context, /second-risk/);
	const saved = JSON.parse(fs.readFileSync(path.join(dir, "compilation.json")));
	assert.equal(saved.resolved_claims.length, 2);
	const lists = formatNextActions(saved.next_actions);
	assert.ok(context.endsWith(lists));
	assert.equal(
		fs.readFileSync(path.join(dir, ".grainulator-tips.md"), "utf8"),
		`${lists}\n`,
	);
	assert.doesNotMatch(context, /all clear/i);
});

test("hook respects off and quiet without claiming product acceptance", (t) => {
	const dir = fixture(t);
	assert.equal(hook(dir, "off"), "");
	assert.equal(fs.existsSync(path.join(dir, "compilation.json")), false);
	assert.equal(hook(dir, "quiet"), "");
	assert.equal(fs.existsSync(path.join(dir, ".grainulator-tips.md")), false);
	const context = JSON.parse(hook(dir)).hookSpecificOutput.additionalContext;
	assert.match(context, /Auto\n/);
	assert.match(context, /Manual\n/);
	assert.doesNotMatch(context, /all clear/i);
});

test("hook resolves relative sprint directories against host cwd, not its process cwd", (t) => {
	const host = fixture(t);
	const caller = fixture(t);
	const relative = "nested-sprint";
	for (const parent of [host, caller]) {
		fs.mkdirSync(path.join(parent, relative));
		fs.copyFileSync(
			path.join(parent, "claims.json"),
			path.join(parent, relative, "claims.json"),
		);
	}
	const intended = path.join(host, relative);
	const unrelated = path.join(caller, relative);
	add(intended, "r001", "intended-host-risk", "risk");
	add(unrelated, "r002", "unrelated-caller-risk", "risk");
	const output = run("lib/tips-hook.cjs", [], {
		cwd: caller,
		input: JSON.stringify({ cwd: host, tool_input: { dir: relative } }),
		env: { ...process.env, CLAUDE_PLUGIN_OPTION_TIPS_LEVEL: "on" },
	});
	assert.match(output, /intended-host-risk/);
	assert.doesNotMatch(output, /unrelated-caller-risk/);
	assert.equal(fs.existsSync(path.join(intended, "compilation.json")), true);
	assert.equal(fs.existsSync(path.join(unrelated, "compilation.json")), false);
});
