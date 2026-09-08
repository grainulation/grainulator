import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHandler } from "../../lib/grainulator-mcp.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-workflow-example-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}

test("brief and present skill JSON examples generate their advertised HTML artifacts", async (t) => {
	const dir = fixture(t);
	const handler = createHandler({ dir, memoryDir: path.join(dir, "memory") });
	const call = async (name, args) => {
		const result = JSON.parse(
			await handler("tools/call", { name, arguments: args }, 1),
		).result;
		assert.equal(result.isError, false, JSON.stringify(result));
		return JSON.parse(result.content[0].text);
	};
	await call("init", { question: "Documented export example" });
	for (const name of ["brief", "present"]) {
		const source = fs.readFileSync(
			path.join(root, "skills", name, "SKILL.md"),
			"utf8",
		);
		const example = JSON.parse(source.match(/```json\n([\s\S]*?)\n\s*```/)[1]);
		const result = await call("exports_convert", { ...example, dir });
		assert.equal(result.status, "ok");
		assert.match(
			fs.readFileSync(path.join(dir, example.output), "utf8"),
			/<!DOCTYPE html>/i,
		);
		assert.match(source, /does not accept a template argument/);
		assert.match(source, /If no PDF renderer is available/);
	}
});

test("orchestration workflow runs from a discovered nested configuration parent", (t) => {
	const dir = fixture(t);
	const configParent = path.join(dir, ".grainulator");
	fs.mkdirSync(configParent);
	fs.writeFileSync(
		path.join(configParent, "orchard.json"),
		JSON.stringify({ sprints: [], settings: { sync_interval: "manual" } }),
	);
	const source = fs.readFileSync(
		path.join(root, "skills/orchestrate/SKILL.md"),
		"utf8",
	);
	assert.match(source, /working directory.*<config-parent>/);
	for (const args of [
		["plan", "--format", "ascii"],
		["next", "--json"],
	]) {
		const result = spawnSync(
			process.execPath,
			[path.join(root, "bin/grainulator.js"), "orchestrate", ...args],
			{ cwd: configParent, encoding: "utf8", timeout: 15000 },
		);
		assert.equal(result.status, 0, result.stderr);
		if (args[0] === "next") assert.deepEqual(JSON.parse(result.stdout), []);
	}
	assert.deepEqual(fs.readdirSync(dir), [".grainulator"]);
});
