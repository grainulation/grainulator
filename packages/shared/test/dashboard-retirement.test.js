// Generated from typescript/packages/shared/test/dashboard-retirement.test.ts; edit that source and run npm run build:types.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
test("old product aliases and retired services fail before creating state or launching fallback executables", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-retired-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	for (const args of [
		["wheat", "status"],
		["evidence", "status"],
		["silo", "list"],
		["mill", "formats"],
		["harvest"],
		["orchard"],
		["barn"],
		["bean"],
		["check"],
		["legacy"],
		["serve"],
		["quickstart"],
		["memory", "serve-mcp"],
		["export", "serve-mcp"],
	]) {
		const result = spawnSync(
			process.execPath,
			[path.join(root, "bin/grainulator.js"), ...args],
			{ cwd: dir, encoding: "utf8", timeout: 5000 },
		);
		assert.equal(result.status, 1, args.join(" "));
		assert.deepEqual(fs.readdirSync(dir), []);
	}
});
test("private evidence API retains operations without legacy setup/update exports", async () => {
	const api = await import("../../evidence/lib/index.js");
	assert.deepEqual(Object.keys(api).sort(), [
		"compile",
		"guard",
		"stats",
		"status",
	]);
	for (const operation of Object.values(api))
		assert.equal(typeof operation, "function");
});
test("no standalone discovery or executable package aliases remain", () => {
	assert.equal(fs.existsSync(path.join(root, "packages/legacy-cli")), false);
	for (const component of [
		"shared",
		"evidence",
		"memory",
		"exports",
		"analytics",
		"orchestration",
		"runtime",
	]) {
		const pkg = JSON.parse(
			fs.readFileSync(
				path.join(root, "packages", component, "package.json"),
				"utf8",
			),
		);
		assert.equal(pkg.private, true);
		assert.equal(pkg.name, `@grainulation/grainulator-${component}`);
		assert.equal(pkg.bin, undefined);
	}
});
