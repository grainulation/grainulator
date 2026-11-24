#!/usr/bin/env node
// Generated from typescript/packages/runtime/test/smoke.test.ts; edit that source and run npm run build:types.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const kind of ["claim", "run", "result", "trace", "lessons"]) {
	const schema = JSON.parse(
		fs.readFileSync(path.join(root, "schemas", `${kind}.schema.json`), "utf8"),
	);
	assert.equal(schema.$id, `urn:grainulator:runtime:${kind}:1`);
	assert.ok(
		[
			"https://json-schema.org/draft/2020-12/schema",
			"http://json-schema.org/draft-07/schema#",
		].includes(schema.$schema),
		"Schema dialect must remain explicit and supported",
	);
}
for (const retired of [
	".claude-plugin",
	".codex-plugin",
	"hooks",
	"skills",
	"package-lock.json",
])
	assert.equal(
		fs.existsSync(path.join(root, retired)),
		false,
		`Retired runtime surface remains: ${retired}`,
	);
const pkg = JSON.parse(
	fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
assert.equal(pkg.name, "@grainulation/grainulator-runtime");
assert.equal(pkg.private, true);
assert.equal(pkg.bin, undefined);
assert.ok(fs.existsSync(path.join(root, "bin/runtime-check.js")));
console.log(
	"PASS: bundled runtime schemas and consolidated package boundaries",
);
