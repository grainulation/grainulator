import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	loadNativeSettings,
	loadToolset,
	loadWorkspace,
	saveWorkspace,
} from "../../lib/workspace-config.js";

const cli = fileURLToPath(new URL("../../bin/grainulator.js", import.meta.url));
test("native startup pins workspace and profile to one saved generation", (t) => {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-binding-snapshot-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const a = path.join(dir, "a"),
		b = path.join(dir, "b");
	fs.mkdirSync(a);
	fs.mkdirSync(b);
	const file = path.join(dir, "workspace.json");
	fs.writeFileSync(
		file,
		JSON.stringify({ schema: 1, workspace: a, toolset: "legacy" }),
	);
	const read = fs.readFileSync;
	let reads = 0;
	const mock = t.mock.method(
		fs,
		"readFileSync",
		(...args: Parameters<typeof fs.readFileSync>) => {
			const result = Reflect.apply(read, fs, args) as ReturnType<
				typeof fs.readFileSync
			>;
			if (args[0] === file) {
				reads++;
				fs.writeFileSync(
					file,
					JSON.stringify({ schema: 1, workspace: b, toolset: "compact" }),
				);
			}
			return result;
		},
	);
	const settings = loadNativeSettings({ GRAINULATOR_CONFIG: file });
	mock.mock.restore();
	assert.equal(reads, 1);
	assert.equal(settings.workspace, fs.realpathSync(a));
	assert.equal(settings.toolset, "legacy");
	assert.equal(
		loadNativeSettings({ GRAINULATOR_CONFIG: file }).workspace,
		fs.realpathSync(b),
	);
});

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
	assert.throws(
		() => saveWorkspace(workspace, env),
		/unrecognized native binding/,
	);
	const repaired = saveWorkspace(workspace, env, undefined, { repair: true });
	assert.ok(repaired.backup);
	assert.equal(fs.readFileSync(repaired.backup, "utf8"), "not json");
	if (process.platform !== "win32")
		assert.equal(fs.statSync(env.GRAINULATOR_CONFIG).mode & 0o777, 0o600);
});

test("setup refuses unrelated existing data and repairs only with an exact retained preimage", (t) => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-binding-ownership-"),
	);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	for (const [name, content] of [
		[
			"grainulator.config.json",
			'{"schema_version":1,"evidence":{"compiler":{"claims":"valuable.json"}}}\n',
		],
		["claims.json", '{"schema_version":1,"claims":[{"id":"keep"}]}\n'],
		["host-settings.json", '{"hooks":{"Stop":[]},"theme":"keep"}\n'],
		["workspace.json", "damaged native binding\n"],
	] as const) {
		const file = path.join(root, name);
		fs.writeFileSync(file, content);
		const env = { ...process.env, GRAINULATOR_CONFIG: file };
		const result = spawnSync(
			process.execPath,
			[cli, "setup", "--dir", root, "--toolset", "compact", "--json"],
			{ env, encoding: "utf8" },
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stdout + result.stderr, /GRAINULATOR_CONFIG/);
		assert.equal(fs.readFileSync(file, "utf8"), content);
	}
	const file = path.join(root, "workspace.json");
	const repaired = spawnSync(
		process.execPath,
		[cli, "setup", "--dir", root, "--toolset", "compact", "--repair", "--json"],
		{ env: { ...process.env, GRAINULATOR_CONFIG: file }, encoding: "utf8" },
	);
	assert.equal(repaired.status, 0, repaired.stderr);
	const result = JSON.parse(repaired.stdout) as { backup: string };
	assert.equal(
		fs.readFileSync(result.backup, "utf8"),
		"damaged native binding\n",
	);
	if (process.platform !== "win32")
		assert.equal(fs.statSync(result.backup).mode & 0o777, 0o600);
	assert.equal(
		loadNativeSettings({ GRAINULATOR_CONFIG: file }).toolset,
		"compact",
	);
	saveWorkspace(root, { GRAINULATOR_CONFIG: file }, "legacy");
	assert.equal(
		fs.readFileSync(result.backup, "utf8"),
		"damaged native binding\n",
	);
});

test("setup refuses links and does not replace a file created or edited concurrently", (t) => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-binding-race-"),
	);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const target = path.join(root, "valuable.json"),
		file = path.join(root, "workspace.json");
	fs.writeFileSync(target, "unrelated data");
	fs.symlinkSync(target, file);
	assert.throws(
		() => saveWorkspace(root, { GRAINULATOR_CONFIG: file }),
		/regular file/,
	);
	assert.equal(fs.readFileSync(target, "utf8"), "unrelated data");
	fs.unlinkSync(file);
	const link = fs.linkSync;
	const publish = t.mock.method(
		fs,
		"linkSync",
		(source: fs.PathLike, destination: fs.PathLike) => {
			fs.writeFileSync(file, "concurrent creation");
			return link(source, destination);
		},
	);
	assert.throws(() => saveWorkspace(root, { GRAINULATOR_CONFIG: file }), {
		code: "EEXIST",
	});
	publish.mock.restore();
	assert.equal(fs.readFileSync(file, "utf8"), "concurrent creation");
	fs.unlinkSync(file);
	saveWorkspace(root, { GRAINULATOR_CONFIG: file });
	const close = fs.closeSync;
	let edited = false;
	const edit = t.mock.method(fs, "closeSync", (fd: number) => {
		close(fd);
		if (!edited) {
			edited = true;
			fs.writeFileSync(file, "concurrent edit");
		}
	});
	assert.throws(
		() => saveWorkspace(root, { GRAINULATOR_CONFIG: file }),
		/changed since setup started/,
	);
	edit.mock.restore();
	assert.equal(fs.readFileSync(file, "utf8"), "concurrent edit");
});
test("setup reads the opened binding and refuses pathname replacement", (t) => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-binding-open-"),
	);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const file = path.join(root, "workspace.json");
	const replacement = path.join(root, "replacement.json");
	saveWorkspace(root, { GRAINULATOR_CONFIG: file }, "legacy");
	const concurrent = JSON.stringify({
		schema: 1,
		workspace: root,
		toolset: "compact",
	});
	fs.writeFileSync(replacement, concurrent);
	const open = fs.openSync;
	let replaced = false;
	const mock = t.mock.method(
		fs,
		"openSync",
		(...args: Parameters<typeof fs.openSync>) => {
			const descriptor = Reflect.apply(open, fs, args) as number;
			if (args[0] === file && !replaced) {
				replaced = true;
				fs.renameSync(replacement, file);
			}
			return descriptor;
		},
	);
	assert.throws(
		() => saveWorkspace(root, { GRAINULATOR_CONFIG: file }, "legacy"),
		/changed since setup started/,
	);
	mock.mock.restore();
	assert.equal(replaced, true);
	assert.equal(fs.readFileSync(file, "utf8"), concurrent);
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
