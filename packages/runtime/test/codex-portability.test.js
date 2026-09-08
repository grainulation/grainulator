#!/usr/bin/env node
// @ts-check
/**
 * Codex portability smoke tests.
 *
 * These intentionally avoid executing the native binaries: npm test runs on Ubuntu before
 * the Rust conformance job builds platform-local binaries. This test protects the Codex
 * contract by checking the manifest/docs/install surfaces agree.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** @param {string} p */
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
/** @param {string} p */
const json = (p) => JSON.parse(read(p));

let passed = 0;
/** @param {string} name @param {() => void} fn */
const check = (name, fn) => {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
};

check(
	"Codex plugin manifest describes advisory plugin mode and runtime enforcement",
	() => {
		const manifestText = read(".codex-plugin/plugin.json");
		const manifest = json(".codex-plugin/plugin.json");
		const combined = `${manifest.description}\n${manifest.interface.longDescription}`;

		assert.match(combined, /plugin-only mode/i);
		assert.match(combined, /runtime binaries/i);
		assert.match(combined, /Codex Stop hook/i);
		assert.match(combined, /advisory/i);

		assert.doesNotMatch(manifestText, /documentation-only/i);
		assert.doesNotMatch(manifestText, /No servers, hooks/i);
		assert.doesNotMatch(manifestText, /zero-dependency Node CLI/i);
		assert.doesNotMatch(manifestText, /bean-stalk\.md ledger/i);
	},
);

check("runtime-codex documents the current two-mode contract", () => {
	const doc = read("skills/bean/references/runtime-codex.md");

	assert.match(doc, /Mode 1: installed runtime \(enforced\)/);
	assert.match(doc, /Mode 2: plugin-only skill \(advisory\)/);
	assert.match(doc, /~\/\.codex\/hooks\.json/);
	assert.match(doc, /bean-check --dir <project> --json/);
	assert.match(doc, /fail closed/i);

	assert.doesNotMatch(doc, /runs on the \*\*minimal built-in ledger\*\*/i);
	assert.doesNotMatch(doc, /bean adds no tools, servers, hooks/i);
	assert.doesNotMatch(doc, /Maintain the `bean-stalk\.md` table/i);
});

check("installer registers the native Stop hook for Codex", () => {
	const install = read("install.sh");
	assert.match(install, /install_codex\(\)/);
	assert.match(install, /bean-hook" --register "\$CODEX_DIR" hooks\.json/);
	assert.match(install, /~\/\.codex|CODEX_DIR|\$HOME\/\.codex/);
});

check("Codex remains explicit-only", () => {
	assert.match(
		read("skills/bean/agents/openai.yaml"),
		/allow_implicit_invocation:\s*false/,
	);
	assert.match(
		read("skills/bean/SKILL.md"),
		/on Codex, bean\s+runs only on an explicit \/bean/i,
	);
});

check("native hook source has the Codex fail-closed contract", () => {
	const hook = read("rs/src/bin/bean-hook.rs");
	assert.match(hook, /Codex/);
	assert.match(hook, /hooks\.json/);
	assert.match(hook, /refusing to allow stop/);
	assert.match(hook, /stop_hook_active/);
});

console.log(`\n${passed} Codex portability checks passed`);
