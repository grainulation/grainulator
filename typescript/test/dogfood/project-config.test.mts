import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHandler, RESOURCES, TOOLS } from "../../lib/grainulator-mcp.js";
import { initializeSprint } from "../../lib/sprint-init.js";
import { compile } from "../../packages/evidence/compiler/evidence-compiler.js";
import { guard } from "../../packages/evidence/lib/guard.js";
import config from "../../packages/shared/lib/project-config.cjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t: TestContext) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-config-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}
function write(
	dir: string,
	data: string | Record<string, unknown>,
	name = "grainulator.config.json",
) {
	fs.writeFileSync(
		path.join(dir, name),
		typeof data === "string" ? data : JSON.stringify(data),
	);
}
test("missing optional configuration uses defaults; malformed/present or unsupported input never does", (t) => {
	const dir = fixture(t);
	assert.equal(config.evidenceConfig(dir).compiler.claims, "claims.json");
	for (const data of [
		"{",
		{ schema_version: 2 },
		{ schema_version: 1, evidence: [] },
		{ schema_version: 1, evidence: { dirs: { output: 3 } } },
	]) {
		write(dir, data);
		assert.throws(() => config.evidenceConfig(dir));
		assert.throws(() => compile(null, null, dir));
		assert.equal(guard(dir, "{}").allow, false);
	}
});
test("evidence uses exact sprint section; child evidence does not shadow parent orchestration inside explicit workspace", (t) => {
	const dir = fixture(t),
		child = path.join(dir, "child");
	fs.mkdirSync(child);
	write(dir, {
		schema_version: 1,
		evidence: { compiler: { claims: "parent.json" } },
		orchestration: { sprints: [{ path: "child" }] },
	});
	assert.equal(
		config.evidenceConfig(child, { workspace: dir }).compiler.claims,
		"claims.json",
	);
	write(child, { schema_version: 1, evidence: { dirs: { output: "local" } } });
	const portfolio = config.readSection(child, "orchestration", {
		workspace: dir,
		ascend: true,
	});
	assert.equal(portfolio.origin, dir);
	assert.deepEqual(
		(portfolio.value as { sprints: { path: string }[] }).sprints,
		[{ path: "child" }],
	);
	assert.equal(config.readSection(child, "orchestration").value, undefined);
});
test("locked section update preserves other sections and unknown values; custom file wins", (t) => {
	const dir = fixture(t),
		data = {
			schema_version: 1,
			unknown: { keep: true },
			evidence: { custom: "preserve" },
			orchestration: { sprints: [] },
		};
	write(dir, data, "custom.json");
	config.updateSection(
		dir,
		"orchestration",
		(current) => ({
			...(current as Record<string, unknown>),
			sprints: [{ path: "." }],
		}),
		{ configFile: "custom.json" },
	);
	const after = config.readProjectConfig(dir, {
		configFile: "custom.json",
	}).data;
	assert.deepEqual(after.evidence, data.evidence);
	assert.deepEqual(after.unknown, data.unknown);
	assert.equal(
		(after.orchestration as { sprints: { path: string }[] }).sprints.length,
		1,
	);
	assert.equal(fs.existsSync(path.join(dir, "grainulator.config.json")), false);
	fs.mkdirSync(path.join(dir, "custom.json.lock"));
	assert.throws(
		() =>
			config.updateSection(dir, "evidence", () => ({}), {
				configFile: "custom.json",
			}),
		/locked/,
	);
	assert.deepEqual(
		config.readProjectConfig(dir, { configFile: "custom.json" }).data,
		after,
	);
});
test("relative configured paths resolve from defining file and cannot escape through symlinks", (t) => {
	const dir = fixture(t),
		outside = fixture(t);
	write(dir, {
		schema_version: 1,
		evidence: {
			compiler: {
				claims: "data/claims.json",
				compilation: "data/compilation.json",
			},
		},
	});
	assert.equal(
		initializeSprint(dir, { question: "Configured ledger?" }).status,
		"ok",
	);
	assert.ok(fs.existsSync(path.join(dir, "data", "claims.json")));
	assert.ok(fs.existsSync(path.join(dir, "data", "compilation.json")));
	fs.symlinkSync(outside, path.join(dir, "escape"));
	write(dir, {
		schema_version: 1,
		evidence: { dirs: { output: "escape/new" } },
	});
	assert.throws(() => config.evidenceConfig(dir), /outside/);
});
test("migration marker blocks mutation without changing evidence, while config check diagnoses it", (t) => {
	const dir = fixture(t);
	assert.equal(
		initializeSprint(dir, { question: "Preserve this ledger" }).status,
		"ok",
	);
	const before = fs.readFileSync(path.join(dir, "claims.json"));
	fs.mkdirSync(path.join(dir, ".grainulator"), { recursive: true });
	write(
		path.join(dir, ".grainulator"),
		{
			schema: "grainulator.migration.v1",
			state: "in-progress",
			transaction: "fixture",
		},
		"migration.json",
	);
	assert.throws(() => compile(null, null, dir), /in progress/);
	assert.equal(
		initializeSprint(dir, { question: "Overwrite?", force: true }).status,
		"error",
	);
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), before);
	const result = spawnSync(
		process.execPath,
		[
			path.join(root, "bin/grainulator.js"),
			"config",
			"check",
			"--dir",
			dir,
			"--json",
		],
		{ encoding: "utf8" },
	);
	assert.equal(result.status, 1);
	assert.equal(JSON.parse(result.stdout).status, "blocked");
});
test("canonical MCP rejects all historical tool/resource identities before filesystem mutation", async (t) => {
	const dir = fixture(t),
		handler = createHandler({ dir });
	assert.equal(TOOLS.length, 29);
	assert.equal(RESOURCES.length, 7);
	for (const name of [
		"wheat/init",
		"wheat/compile",
		"silo/list",
		"mill/formats",
	]) {
		const result = JSON.parse(
			await handler("tools/call", { name, arguments: {} }, 1),
		);
		assert.equal(result.error.code, -32602);
	}
	for (const uri of ["wheat://claims", "silo://index", "mill://formats"])
		assert.equal(
			JSON.parse(await handler("resources/read", { uri }, 1)).error.code,
			-32602,
		);
	assert.deepEqual(fs.readdirSync(dir), []);
});
test("native path and native-shaped ledger are refused by evidence operations, even with force", (t) => {
	const dir = fixture(t),
		native = path.join(dir, ".grainulator", "runtime");
	assert.equal(
		initializeSprint(native, { question: "Wrong ledger" }).status,
		"error",
	);
	assert.equal(fs.existsSync(native), false);
	write(
		dir,
		{ schema: "urn:grainulator:runtime:claims:1", claims: [] },
		"claims.json",
	);
	const bytes = fs.readFileSync(path.join(dir, "claims.json"));
	assert.equal(
		initializeSprint(dir, { question: "Wrong force", force: true }).status,
		"error",
	);
	assert.throws(() => compile(null, null, dir));
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), bytes);
});
test("Brew connect emits stable opt launcher without Cellar Node; errors remain JSON", (t) => {
	const dir = fixture(t),
		launcher = "/opt/example/opt/grainulator/bin/grainulator";
	const result = spawnSync(
		process.execPath,
		[path.join(root, "bin/grainulator.js"), "connect", "--dir", dir],
		{
			encoding: "utf8",
			env: {
				...process.env,
				GRAINULATOR_INSTALL_ORIGIN: "homebrew",
				GRAINULATOR_HOMEBREW_LAUNCHER: launcher,
			},
		},
	);
	assert.equal(result.status, 0);
	const registration = JSON.parse(result.stdout).mcpServers.grainulator;
	assert.equal(registration.command, launcher);
	assert.deepEqual(registration.args, ["mcp", "--dir", dir]);
	const invalid = spawnSync(
		process.execPath,
		[
			path.join(root, "bin/grainulator.js"),
			"run",
			"--adapter-args",
			"{",
			"--json",
		],
		{ encoding: "utf8" },
	);
	assert.equal(invalid.status, 1);
	assert.equal(JSON.parse(invalid.stdout).error.code, "E_USAGE");
});
