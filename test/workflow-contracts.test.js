// Generated from typescript/test/workflow-contracts.test.ts; edit that source and run npm run build:types.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const workflows = fs
	.readdirSync(path.join(root, "skills"))
	.filter((name) => fs.existsSync(path.join(root, "skills", name, "SKILL.md")))
	.map((name) => `skills/${name}/SKILL.md`);
test("skill discovery contains only real skills and briefs use portable Markdown", () => {
	for (const entry of fs.readdirSync(path.join(root, "skills"), {
		withFileTypes: true,
	})) {
		if (entry.isDirectory())
			assert.ok(
				fs.existsSync(path.join(root, "skills", entry.name, "SKILL.md")),
				entry.name,
			);
	}
	const source = read("skills/brief/SKILL.md");
	assert.doesNotMatch(
		source,
		/skills\/_templates|CLAUDE_PLUGIN_ROOT.*templates/,
	);
	assert.match(source, /"format":"markdown"/);
	assert.match(source, /output\/brief\.md/);
	assert.equal(
		fs.existsSync(path.join(root, "skills/present/SKILL.md")),
		false,
	);
});
test("core verification workflows preserve unresolved findings and distinguish host acceptance", () => {
	for (const name of ["grainulator", "blind-spot", "status"]) {
		const source = read(`skills/${name}/SKILL.md`);
		assert.match(source, /Carry existing unresolved findings forward/);
		assert.match(
			source,
			/source revision or build, installed package and cache version/,
		);
		assert.match(source, /host version, and exact test scope/);
		assert.match(source, /actual nested tool invocation and its result/);
		assert.match(
			source,
			/generic user success report or a ready compiler does not close unrelated failures/,
		);
	}
});
test("native Codex onboarding discloses workspace binding and direct MCP scope", () => {
	for (const file of [
		"skills/setup/SKILL.md",
		"docs/HOSTS.md",
		"docs/INSTALLATION.md",
	]) {
		const source = read(file);
		assert.match(
			source,
			/GRAINULATOR_WORKSPACE=\/absolute\/path\/to\/project codex/,
			file,
		);
		assert.match(source, /Codex Desktop/, file);
		assert.match(source, /connect --dir \/absolute\/path\/to\/project/, file);
		assert.match(
			source,
			/does not (?:load or verify|install or verify|test)/,
			file,
		);
	}
});
test("shipped workflows expose the product namespace and retain portable next actions", () => {
	for (const file of [...workflows, "agents/grainulator.md"]) {
		const source = read(file);
		assert.doesNotMatch(
			source,
			/mcp__(wheat|silo|mill)__|\b(?:wheat|silo|mill)[._/]|@grainulation\/(?:wheat|silo|mill)/i,
			file,
		);
		assert.match(source, /\*\*Auto\*\*/, file);
		assert.match(source, /\*\*Manual\*\*/, file);
		assert.match(source, /Do not invent work|never invent work/, file);
		assert.match(source, /CLI/, file);
		assert.doesNotMatch(
			source,
			/Minimum \d+ active claims|Add \d+-\d+ claims per pass|total_claims\s*>=|\(\d+-\d+ passes/,
			file,
		);
	}
});
test("mutation reminder covers canonical/plugin-prefixed mutations and excludes removed aliases", () => {
	const config = JSON.parse(read("hooks/hooks.json"));
	const matcher = new RegExp(config.hooks.PostToolUse[0].matcher);
	for (const name of [
		"mcp__grainulator__add_claim",
		"mcp__grainulator__resolve",
		"mcp__grainulator__import_claims",
		"mcp__plugin_grainulator_grainulator__add_claim",
	]) {
		assert.ok(matcher.test(name), name);
	}
	for (const name of [
		"mcp__grainulator__memory_store",
		"mcp__grainulator__status",
		"mcp__wheat__wheat_add_claim",
		"mcp__wheat__wheat_resolve",
		"mcp__plugin_grainulator_wheat__wheat_resolve",
		"mcp__grainulator__exports_convert",
		"mcp__grainulator__resolve_extra",
		"mcp__other__add_claim",
	]) {
		assert.equal(matcher.test(name), false, name);
	}
});
test("write guard points blocked mutations to the canonical tools and leaves ordinary files usable", () => {
	for (const file of [
		"claims.json",
		"compilation.json",
		"C:\\sprint\\claims.json",
	]) {
		const result = spawnSync(
			process.execPath,
			[path.join(root, "hooks/write-guard.cjs")],
			{
				input: JSON.stringify({ tool_input: { file_path: file } }),
				encoding: "utf8",
			},
		);
		assert.equal(result.status, 2, result.stderr);
		assert.match(result.stderr, /grainulator\.add_claim/);
		assert.doesNotMatch(result.stderr, /wheat/);
	}
	const result = spawnSync(
		process.execPath,
		[path.join(root, "hooks/write-guard.cjs")],
		{
			input: JSON.stringify({ tool_input: { file_path: "notes.md" } }),
			encoding: "utf8",
		},
	);
	assert.equal(result.status, 0);
});
test("write guard waits for complete delayed pipe input before deciding", async (t) => {
	const hook = path.join(root, "hooks/write-guard.cjs");
	const child = spawn(
		process.execPath,
		[
			"--input-type=commonjs",
			"-e",
			`process.stdout.write("HOOK_READY\\n"); require(${JSON.stringify(hook)});`,
		],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	t.after(() => child.kill());
	let stderr = "";
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	child.stdin.on("error", () => {});
	child.stdout.once("data", () => {
		// Wait until the guard has entered its read, then deliver incomplete JSON
		// before the final chunk. A synchronous nonblocking read fails with EAGAIN.
		setTimeout(() => {
			child.stdin.write('{"tool_input":');
			setTimeout(() => child.stdin.end('{"file_path":"claims.json"}}'), 20);
		}, 100);
	});
	const status = await new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Hook did not finish reading stdin")),
			5000,
		);
		child.once("error", reject);
		child.once("close", (code) => {
			clearTimeout(timeout);
			resolve(code);
		});
	});
	assert.equal(status, 2, stderr);
	assert.match(stderr, /BLOCKED: claims\.json/);
	assert.doesNotMatch(stderr, /malformed hook context/);
});
test("write guard retains environment context fallback and malformed-input diagnostics", () => {
	const hook = path.join(root, "hooks/write-guard.cjs");
	const environment = {
		...process.env,
		CLAUDE_HOOK_CONTEXT: JSON.stringify({
			tool_input: { file_path: "compilation.json" },
		}),
	};
	const fallback = spawnSync(process.execPath, [hook], {
		input: "",
		encoding: "utf8",
		env: environment,
	});
	assert.equal(fallback.status, 2, fallback.stderr);
	const malformed = spawnSync(process.execPath, [hook], {
		input: "{",
		encoding: "utf8",
		env: environment,
	});
	assert.equal(malformed.status, 0);
	assert.match(malformed.stderr, /malformed hook context/);
	assert.doesNotMatch(malformed.stderr, /BLOCKED/);
});
test("write guard treats nonobject JSON envelopes as malformed context without crashing", () => {
	for (const context of [
		null,
		[],
		false,
		0,
		"text",
		{ tool_input: null },
		{ tool_input: [] },
		{ tool_input: "claims.json" },
	]) {
		const result = spawnSync(
			process.execPath,
			[path.join(root, "hooks/write-guard.cjs")],
			{
				input: JSON.stringify(context),
				encoding: "utf8",
			},
		);
		assert.equal(result.status, 0, result.stderr);
		assert.match(
			result.stderr,
			/malformed hook context; no file decision made/,
		);
		assert.doesNotMatch(result.stderr, /TypeError|Unhandled|BLOCKED/);
	}
});
test("packaged Claude agent permits direct and plugin-prefixed core MCP tools", async () => {
	const { TOOLS } = await import("../lib/grainulator-mcp.js");
	const source = read("agents/grainulator.md");
	const frontmatter = source.split("---")[1];
	assert.ok(frontmatter !== undefined);
	const allowed = new Set(
		[...frontmatter.matchAll(/^ {2}- (.+)$/gm)].map((match) => {
			const name = match[1];
			assert.ok(name !== undefined);
			return name;
		}),
	);
	for (const tool of TOOLS) {
		assert.ok(
			allowed.has(`mcp__grainulator__${tool.name}`),
			`Direct registration missing ${tool.name}`,
		);
		assert.ok(
			allowed.has(`mcp__plugin_grainulator_grainulator__${tool.name}`),
			`Plugin registration missing ${tool.name}`,
		);
	}
	assert.ok(
		[...allowed]
			.filter((name) => name.startsWith("mcp__"))
			.every(
				(name) =>
					name.startsWith("mcp__grainulator__") ||
					name.startsWith("mcp__plugin_grainulator_grainulator__"),
			),
		"Optional external MCP servers must not be hard dependencies of the agent allowlist",
	);
});
