import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { callCompact } from "../../lib/compact-mcp.js";
import { COMPACT_TOOLS } from "../../lib/grainulator-mcp.js";
import {
	validateOutput,
	withStructuredResult,
} from "../../lib/mcp-contracts.js";
import { claimsDocument, readLedger } from "../../lib/research/evidence.js";

test("checked research boundary rejects malformed external JSON and keeps model claims stated", () => {
	for (const claims of [null, 1, [], {}, { claims: null }])
		assert.throws(() => readLedger(JSON.stringify(claims)), /1–24 claims/);
	const claim = {
		id: "r001",
		type: "factual",
		topic: "boundary",
		content: "Recorded by a model",
		sources: ["https://example.com/source", "file:///etc/passwd", {}],
		conflicts_with: [],
	};
	assert.throws(
		() =>
			readLedger(
				JSON.stringify({ claims: [{ ...claim, conflicts_with: [1] }] }),
			),
		/source and conflict lists/,
	);
	const document = claimsDocument({
		question: "What is supported?",
		config: { provider: "openai" },
		steps: [{ pass: "ledger", text: JSON.stringify({ claims: [claim] }) }],
	});
	assert.equal(document.claims[0].evidence, "stated");
	assert.deepEqual(document.claims[0].source.urls, [
		"https://example.com/source",
	]);
	assert.deepEqual(document.claims[0].tags, ["needs-verification"]);
});

test("checked MCP boundary rejects malformed content before advertising structured results", () => {
	for (const content of [
		null,
		false,
		0,
		"",
		{},
		[{ type: "text", text: 1 }],
		[{ type: "text", text: "[]" }],
	])
		assert.throws(
			() => withStructuredResult(JSON.stringify({ result: { content } })),
			/Expected (?:one JSON|an object) tool result/,
		);
	const error = JSON.stringify({
		error: { code: -32602, message: "Invalid params" },
	});
	assert.equal(withStructuredResult(error), error);
	for (const result of [null, false, {}, { content: [] }])
		assert.throws(
			() => withStructuredResult(JSON.stringify({ result })),
			/Expected one JSON tool result/,
		);
});

test("output contracts distinguish declared properties from Object prototype names", () => {
	const schema = {
		type: "object",
		properties: { allowed: { type: "string" } },
		additionalProperties: false,
	};
	for (const key of ["__proto__", "constructor", "toString"])
		assert.throws(
			() => validateOutput(JSON.parse(`{"${key}":{"extra":true}}`), schema),
			/unexpected/,
		);
	validateOutput({ allowed: "recorded" }, schema);
	const declared = {
		type: "object",
		properties: JSON.parse('{"__proto__":{"type":"string"}}'),
		additionalProperties: false,
	};
	validateOutput(JSON.parse('{"__proto__":"recorded"}'), declared);
	assert.throws(
		() => validateOutput(JSON.parse('{"__proto__":1}'), declared),
		/expected string/,
	);
});

test("output enum contracts compare nested JSON values structurally", () => {
	const schema = {
		enum: [{ answer: [1, { confirmed: true }], label: "recorded" }],
	};
	validateOutput(
		JSON.parse('{"label":"recorded","answer":[1,{"confirmed":true}]}'),
		schema,
	);
	validateOutput(["a", { count: 0 }], { enum: [["a", { count: -0 }]] });
	for (const value of [
		{ answer: [1, { confirmed: false }], label: "recorded" },
		{ answer: [1, { confirmed: true }], label: "recorded", extra: true },
		{ answer: [1, { confirmed: true }] },
		[1, { confirmed: true }],
	])
		assert.throws(() => validateOutput(value, schema), /unsupported value/);
	assert.throws(
		() => validateOutput([2, 1], { enum: [[1, 2]] }),
		/unsupported value/,
	);
});

test("compact criteria validate conditional fields before invoking a backend", async () => {
	const tool = COMPACT_TOOLS.find(
		(candidate) => candidate.name === "configure_sprint",
	);
	const calls = [];
	const backend = async (_method, request) => {
		calls.push(request);
		return JSON.stringify({
			result: { content: [{ type: "text", text: '{"status":"ok"}' }] },
		});
	};
	for (const args of [
		{ mode: "create" },
		{ mode: "criteria", reason: "reviewed" },
		{ mode: "criteria", done: "ready" },
		{ mode: "criteria", done: "ready", reason: "  " },
		{ mode: "criteria", done: "ready", reason: "🌾".repeat(4097) },
		{ mode: "criteria", done: "", reason: "reviewed" },
		{ mode: "criteria", question: "  ", reason: "reviewed" },
		Object.assign(Object.create({ mode: "create" }), {
			question: "inherited mode",
		}),
	]) {
		await assert.rejects(() => callCompact(tool, args, backend));
		assert.equal(
			calls.length,
			0,
			"Invalid conditional arguments must never reach the backend",
		);
	}
	await callCompact(
		tool,
		{ mode: "create", question: "Create", done: "" },
		backend,
	);
	await callCompact(
		tool,
		{ mode: "criteria", done: "ready", reason: "🌾".repeat(4096) },
		backend,
	);
	assert.deepEqual(
		calls.map((request) => request.name),
		["init", "acceptance_set"],
	);
});

test("TypeScript freshness rejects runtime output orphaned by a deleted canonical source", (t) => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const fixture = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-typescript-orphan-"),
	);
	t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
	for (const name of [
		"typescript",
		"lib",
		"package.json",
		"tsconfig.json",
		"biome.json",
	])
		fs.cpSync(path.join(root, name), path.join(fixture, name), {
			recursive: true,
		});
	fs.mkdirSync(path.join(fixture, "scripts"));
	fs.copyFileSync(
		path.join(root, "scripts/typescript-build.mjs"),
		path.join(fixture, "scripts/typescript-build.mjs"),
	);
	fs.symlinkSync(
		path.join(root, "node_modules"),
		path.join(fixture, "node_modules"),
		"dir",
	);
	const run = (mode) =>
		spawnSync(
			process.execPath,
			[path.join(fixture, "scripts/typescript-build.mjs"), mode],
			{ cwd: fixture, encoding: "utf8", timeout: 30000 },
		);
	const baseline = run("--check");
	assert.ifError(baseline.error);
	assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
	const runtime = path.join(fixture, "lib/mcp-contracts.js");
	const before = fs.readFileSync(runtime);
	fs.unlinkSync(path.join(fixture, "typescript/lib/mcp-contracts.ts"));
	for (const mode of ["--check", "--write"]) {
		const result = run(mode);
		assert.ifError(result.error);
		assert.notEqual(result.status, 0);
		assert.match(
			result.stdout + result.stderr,
			/Orphaned generated runtime module lib\/mcp-contracts\.js/,
		);
		assert.deepEqual(
			fs.readFileSync(runtime),
			before,
			"Failed generation must preserve the existing runtime",
		);
	}
});
