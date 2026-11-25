import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { initializeSprint } from "../../../lib/sprint-init.js";

test("canonical initialization seeds stated constraints and creates no host scaffold", (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-init-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const result = initializeSprint(dir, {
		question: "Should we migrate?",
		audience: "engineering,product",
		constraints: "Budget;Timeline",
		done: "Decision",
	});
	assert.equal(result.status, "ok");
	const data: { meta: { question: string }; claims: { evidence: string }[] } =
		JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8"));
	assert.equal(data.meta.question, "Should we migrate?");
	assert.equal(data.claims.length, 3);
	assert.ok(data.claims.every((c) => c.evidence === "stated"));
	for (const name of [
		"CLAUDE.md",
		"AGENTS.md",
		".claude",
		".git",
		"grainulator.config.json",
	])
		assert.equal(fs.existsSync(path.join(dir, name)), false);
	assert.equal(
		initializeSprint(dir, { question: "Overwrite?" }).status,
		"error",
	);
	const old = fs.readFileSync(path.join(dir, "claims.json"));
	const forced = initializeSprint(dir, {
		question: "New question",
		force: true,
	});
	assert.equal(forced.status, "ok");
	assert.ok("backup" in forced);
	assert.ok(forced.backup);
	assert.deepEqual(fs.readFileSync(forced.backup), old);
});
test("initialization rejects a runtime ledger before force or directory writes", (t) => {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-runtime-ledger-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const bytes = JSON.stringify({
		schema: "urn:grainulator:runtime:claims:1",
		claims: [],
	});
	fs.writeFileSync(path.join(dir, "claims.json"), bytes);
	assert.equal(
		initializeSprint(dir, { question: "Force?", force: true }).status,
		"error",
	);
	assert.equal(fs.readFileSync(path.join(dir, "claims.json"), "utf8"), bytes);
	assert.deepEqual(fs.readdirSync(dir), ["claims.json"]);
});
