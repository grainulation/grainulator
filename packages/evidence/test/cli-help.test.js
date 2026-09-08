import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/wheat.js", import.meta.url));
const commands = ["init", "quickstart", "compile", "add", "search", "resolve", "guard", "status", "stats", "update", "serve", "mcp", "migrate"];

function snapshot(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
		const file = path.join(dir, entry.name);
		return entry.isDirectory() ? [[entry.name, "directory"], ...snapshot(file).map(([name, value]) => [`${entry.name}/${name}`, value])] : [[entry.name, fs.readFileSync(file).toString("base64")]];
	});
}

test("all evidence command help paths exit before mutations, stdin work, or server startup", (t) => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-command-help-"));
	t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
	const preload = path.join(temp, "deny-writes.mjs");
	fs.writeFileSync(preload, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
for (const name of ['writeFileSync','appendFileSync','mkdirSync','renameSync','copyFileSync','unlinkSync','rmSync','rmdirSync','chmodSync']) {
  fs[name] = () => { process.stderr.write('Help attempted filesystem mutation: '+name+'\\n'); throw new Error('Help attempted filesystem mutation: '+name); };
}
syncBuiltinESMExports();`);
	// Invoking through a node_modules path would normally trigger installation tracking.
	const installed = path.join(temp, "node_modules", "evidence-cli.js");
	fs.mkdirSync(path.dirname(installed));
	fs.symlinkSync(bin, installed);
	const fixture = path.join(temp, "sprint");
	fs.mkdirSync(path.join(fixture, ".claude"), { recursive: true });
	fs.mkdirSync(path.join(fixture, ".git", "hooks"), { recursive: true });
	fs.writeFileSync(path.join(fixture, "claims.json"), JSON.stringify({ schema_version: "1.0", meta: { question: "Help must not execute" }, claims: [] }));
	for (const name of ["compilation.json", "AGENTS.md", "CLAUDE.md", ".mcp.json", ".claude/settings.json", ".git/hooks/pre-commit"]) fs.writeFileSync(path.join(fixture, name), `sentinel:${name}\n`);
	const before = snapshot(fixture);
	for (const target of [fixture, path.join(temp, "absent")]) {
		for (const command of commands) {
			for (const flag of ["--help", "-h"]) {
				const result = spawnSync(process.execPath, ["--import", preload, installed, command, "--force", flag, "--dir", target], { cwd: fixture, encoding: "utf8", input: "{}", timeout: 5000 });
				assert.equal(result.error, undefined, `${command} ${flag}: ${result.error}`);
				assert.equal(result.status, 0, `${command} ${flag}: ${result.stderr}`);
				assert.match(result.stdout, /Usage:/, `${command} ${flag}`);
				assert.doesNotMatch(result.stderr, /Help attempted filesystem mutation/);
				assert.deepEqual(snapshot(fixture), before, `${command} ${flag} changed sprint or host files`);
				assert.equal(fs.existsSync(path.join(temp, "absent")), false);
			}
		}
	}
});

test("unknown help requests cannot fall through to legacy verb-less initialization", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-unknown-help-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const result = spawnSync(process.execPath, [bin, "unknown-question", "--help", "--dir", dir], { cwd: dir, encoding: "utf8", timeout: 5000 });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /unknown command/);
	assert.deepEqual(fs.readdirSync(dir), []);
});
