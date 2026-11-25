import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	loadToolset,
	loadWorkspace,
	saveWorkspace,
} from "../../lib/workspace-config.js";

const cli = fileURLToPath(new URL("../../bin/grainulator.js", import.meta.url));
test("native profile selection is explicit and invalid setup preserves the saved binding", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-toolset-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const env = { GRAINULATOR_CONFIG: path.join(dir, "workspace.json") };
	assert.equal(loadToolset(env), "legacy");
	saveWorkspace(dir, env, "compact");
	assert.equal(loadToolset(env), "compact");
	const before = fs.readFileSync(env.GRAINULATOR_CONFIG, "utf8");
	const invalid = spawnSync(
		process.execPath,
		[cli, "setup", "--dir", dir, "--toolset", "typo"],
		{ env: { ...process.env, ...env }, encoding: "utf8" },
	);
	assert.notEqual(invalid.status, 0);
	assert.match(invalid.stderr, /toolset must be legacy or compact/);
	assert.equal(fs.readFileSync(env.GRAINULATOR_CONFIG, "utf8"), before);
	assert.equal(
		loadToolset({ ...env, GRAINULATOR_WORKSPACE: dir }),
		"legacy",
		"explicit environment workspace does not inherit saved settings",
	);
	assert.equal(
		loadToolset({
			...env,
			GRAINULATOR_WORKSPACE: dir,
			GRAINULATOR_TOOLSET: "compact",
		}),
		"compact",
	);
	assert.equal(
		loadToolset({ ...env, GRAINULATOR_TOOLSET: "legacy" }),
		"legacy",
	);
	assert.throws(() => loadToolset({ ...env, GRAINULATOR_TOOLSET: "typo" }));
	const saved = spawnSync(
		process.execPath,
		[cli, "setup", "--dir", dir, "--toolset", "compact", "--json"],
		{ env: { ...process.env, ...env }, encoding: "utf8" },
	);
	assert.equal(saved.status, 0, saved.stderr);
	assert.equal(JSON.parse(saved.stdout).toolset, "compact");
	saveWorkspace(dir, env);
	assert.equal(
		loadToolset(env),
		"legacy",
		"unselected profiles retain the compatibility default",
	);
});

test("setup persists an explicit default; environment overrides and invalid setup preserves previous settings", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-setup-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const workspace = path.join(dir, "project"),
		other = path.join(dir, "other");
	fs.mkdirSync(workspace);
	fs.mkdirSync(other);
	const env = { GRAINULATOR_CONFIG: path.join(dir, "config/workspace.json") };
	const run = (args: string[]) =>
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
		fs.readFileSync(new URL("../../package.json", import.meta.url)).toString(),
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

test("setup preserves pre-existing temporary paths and cleans only its own failed transaction", (t) => {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-setup-ownership-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const file = path.join(dir, "workspace.json");
	const env = { GRAINULATOR_CONFIG: file };
	const previousTemporary = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(previousTemporary, "another writer's file");
	saveWorkspace(dir, env);
	assert.equal(
		fs.readFileSync(previousTemporary, "utf8"),
		"another writer's file",
	);
	const before = fs.readFileSync(file, "utf8");
	const originalOpen = fs.openSync;
	const occupied = path.join(dir, "occupied.tmp");
	fs.writeFileSync(occupied, "unrelated target");
	const open = t.mock.method(
		fs,
		"openSync",
		(
			name: fs.PathLike,
			flags: string | number,
			...rest: [mode?: fs.Mode | null]
		) => {
			if (flags === "wx") {
				fs.symlinkSync(occupied, name);
				return originalOpen(name, flags, ...rest);
			}
			return originalOpen(name, flags, ...rest);
		},
	);
	assert.throws(() => saveWorkspace(dir, env), { code: "EEXIST" });
	open.mock.restore();
	const symlinks = fs
		.readdirSync(dir)
		.filter((name) => fs.lstatSync(path.join(dir, name)).isSymbolicLink());
	assert.equal(
		symlinks.length,
		1,
		"failed exclusive open preserves the path it did not create",
	);
	assert.equal(fs.readFileSync(occupied, "utf8"), "unrelated target");
	const pathsBeforeFailure = fs.readdirSync(dir).sort();
	const rename = t.mock.method(fs, "renameSync", () => {
		throw Object.assign(new Error("replacement denied"), { code: "EACCES" });
	});
	assert.throws(() => saveWorkspace(dir, env), { code: "EACCES" });
	rename.mock.restore();
	assert.equal(fs.readFileSync(file, "utf8"), before);
	assert.deepEqual(
		fs.readdirSync(dir).sort(),
		pathsBeforeFailure,
		"owned temporary file is removed after failed replacement",
	);
});

test("root execution and connection help never starts work or creates files", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-root-help-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	for (const command of [
		"demo",
		"run",
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
			assert.equal(
				result.error,
				undefined,
				`${command} ${flag} must exit without a timeout`,
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

test("retired browser and site-asset commands fail without output files", (t) => {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-retired-web-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	for (const args of [
		["preview"],
		["preview", "--help"],
		["utils", "sync-assets", "--target", dir],
	]) {
		const result = spawnSync(process.execPath, [cli, ...args], {
			cwd: dir,
			encoding: "utf8",
			timeout: 5000,
		});
		assert.equal(result.error, undefined);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /unknown command/i);
		assert.deepEqual(fs.readdirSync(dir), []);
	}
});
