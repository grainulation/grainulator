import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("skill discovery contains only real skills and shared artifact templates resolve", () => {
	for (const entry of fs.readdirSync(path.join(root, "skills"), {
		withFileTypes: true,
	})) {
		if (entry.isDirectory())
			assert.ok(
				fs.existsSync(path.join(root, "skills", entry.name, "SKILL.md")),
				entry.name,
			);
	}
	for (const name of ["brief", "present"]) {
		const source = read(`skills/${name}/SKILL.md`);
		assert.doesNotMatch(source, /skills\/_templates/);
		const matches = [
			...source.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/(templates\/[a-z.-]+)/g),
		];
		assert.ok(matches.length >= 2);
		for (const match of matches)
			assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
	}
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
		"site/install.html",
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

test("mutation reminder covers canonical and plugin-prefixed names plus legacy callers only", () => {
	const config = JSON.parse(read("hooks/hooks.json"));
	const matcher = new RegExp(config.hooks.PostToolUse[0].matcher);
	for (const name of [
		"mcp__grainulator__add_claim",
		"mcp__grainulator__resolve",
		"mcp__plugin_grainulator_grainulator__add_claim",
		"mcp__wheat__wheat_add_claim",
		"mcp__plugin_grainulator_wheat__wheat_resolve",
	]) {
		assert.ok(matcher.test(name), name);
	}
	for (const name of [
		"mcp__grainulator__memory_store",
		"mcp__grainulator__status",
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

test("packaged Claude agent permits direct and plugin-prefixed core MCP tools", async () => {
	const { TOOLS } = await import("../lib/grainulator-mcp.js");
	const source = read("agents/grainulator.md");
	const frontmatter = source.split("---")[1];
	const allowed = new Set(
		[...frontmatter.matchAll(/^ {2}- (.+)$/gm)].map((match) => match[1]),
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
