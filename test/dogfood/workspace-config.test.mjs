import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadWorkspace, saveWorkspace } from "../../lib/workspace-config.js";

const cli = fileURLToPath(new URL("../../bin/grainulator.js", import.meta.url));
test("setup persists an explicit default; environment overrides and invalid setup preserves previous settings", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-setup-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const workspace = path.join(dir, "project"),
		other = path.join(dir, "other");
	fs.mkdirSync(workspace);
	fs.mkdirSync(other);
	const env = { GRAINULATOR_CONFIG: path.join(dir, "config/workspace.json") };
	const run = (args) =>
		spawnSync(process.execPath, [cli, ...args], {
			cwd: dir,
			env: { ...process.env, ...env },
			encoding: "utf8",
		});
	for (const flag of ["--help", "-h"]) {
		assert.equal(run(["setup", flag]).status, 0);
		assert.equal(fs.existsSync(env.GRAINULATOR_CONFIG), false);
	}
	const saved = run(["setup", "--dir", workspace, "--json"]);
	assert.equal(saved.status, 0, saved.stderr);
	assert.equal(loadWorkspace(env).workspace, fs.realpathSync(workspace));
	assert.equal(
		loadWorkspace({ ...env, GRAINULATOR_WORKSPACE: other }).workspace,
		fs.realpathSync(other),
	);
	const before = fs.readFileSync(env.GRAINULATOR_CONFIG, "utf8");
	assert.notEqual(run(["setup", "--dir", "relative"]).status, 0);
	assert.notEqual(run(["setup"]).status, 0);
	assert.equal(fs.readFileSync(env.GRAINULATOR_CONFIG, "utf8"), before);
	assert.throws(
		() => loadWorkspace({ ...env, GRAINULATOR_WORKSPACE: "relative" }),
		/absolute/,
	);
	fs.writeFileSync(env.GRAINULATOR_CONFIG, "not json");
	assert.throws(() => loadWorkspace(env));
	saveWorkspace(workspace, env);
	if (process.platform !== "win32")
		assert.equal(fs.statSync(env.GRAINULATOR_CONFIG).mode & 0o777, 0o600);
});
test("version is readable without a sprint or configuration", () => {
	const expected = JSON.parse(
		fs.readFileSync(new URL("../../package.json", import.meta.url)),
	).version;
	for (const flag of ["--version", "-v", "version"]) {
		const result = spawnSync(process.execPath, [cli, flag], {
			cwd: os.tmpdir(),
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), expected);
	}
});

test("root execution and connection help never starts work or creates files", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-root-help-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	for (const command of [
		"demo",
		"run",
		"preview",
		"connect",
		"doctor",
		"mcp",
		"compile",
	]) {
		for (const flag of ["--help", "-h"]) {
			const result = spawnSync(
				process.execPath,
				[cli, command, flag, "--dir", dir],
				{ cwd: dir, encoding: "utf8", timeout: 5000 },
			);
			assert.equal(result.status, 0, `${command} ${flag}: ${result.stderr}`);
			assert.match(result.stdout, /grainulator|Usage:/i);
			assert.deepEqual(
				fs.readdirSync(dir),
				[],
				`${command} ${flag} wrote files`,
			);
		}
	}
});
