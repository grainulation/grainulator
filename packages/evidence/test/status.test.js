/**
 * Unit tests: lib/status.js
 *
 * status.js only exports `run(dir, args)` which calls process.exit and writes
 * to stdout. We exercise it via a tiny runner spawned as a child process so
 * we can capture exit codes and output without polluting the test runner.
 *
 * Covers:
 *   - no-sprint message + JSON shape
 *   - full status render (human mode) against a constructed sprint
 *   - --json mode output shape (question, claims counts, evidence tiers, topics)
 *   - malformed claims.json exits with error code
 *
 * All disk I/O uses a per-test tempdir.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATUS_MODULE = path.resolve(__dirname, "..", "lib", "status.js");

function runStatus(dir, args = []) {
	// Spawn node with a short runner that imports status.run and invokes it.
	// Using file:// URL so the ES module import works on all platforms.
	const runner = `
		import { run } from ${JSON.stringify("file://" + STATUS_MODULE)};
		await run(${JSON.stringify(dir)}, ${JSON.stringify(args)});
	`;
	const result = spawnSync(
		process.execPath,
		["--input-type=module", "-e", runner],
		{
			encoding: "utf8",
			timeout: 10_000,
			// Force non-TTY so no hints/prompts fire, and suppress install prompts.
			env: {
				...process.env,
				WHEAT_NO_HINTS: "1",
				WHEAT_NO_INSTALL_PROMPT: "1",
				CI: "1",
			},
		},
	);
	return {
		code: result.status,
		stdout: result.stdout || "",
		stderr: result.stderr || "",
	};
}

function baseClaimsDoc(overrides = {}) {
	return {
		schema_version: "1.0",
		meta: {
			question: "Is SSE the right fit?",
			phase: "research",
			audience: ["ci"],
			initiated: "2026-01-01",
			connectors: [],
		},
		claims: [],
		...overrides,
	};
}

function makeClaim(id, overrides = {}) {
	return {
		id,
		type: "factual",
		topic: "topic-a",
		content: "content",
		source: { origin: "cli", artifact: null, connector: null },
		evidence: "stated",
		status: "active",
		phase_added: "research",
		timestamp: "2026-01-01T00:00:00Z",
		conflicts_with: [],
		resolved_by: null,
		tags: [],
		...overrides,
	};
}

describe("status: no-sprint behaviour", () => {
	let dir;

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-status-empty-"));
	});

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("prints no-sprint message (human mode) and exits 0", () => {
		const { code, stdout } = runStatus(dir, []);
		assert.equal(code, 0);
		assert.match(stdout, /No sprint found/);
	});

	it("emits JSON error shape with --json and exits 0", () => {
		const { code, stdout } = runStatus(dir, ["--json"]);
		assert.equal(code, 0);
		const payload = JSON.parse(stdout);
		assert.equal(payload.error, "no_sprint");
		assert.match(payload.message, /No sprint/);
	});
});

describe("status: happy path (--json)", () => {
	let dir;

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-status-json-"));
		fs.writeFileSync(
			path.join(dir, "claims.json"),
			JSON.stringify(
				baseClaimsDoc({
					claims: [
						makeClaim("r001", {
							topic: "topic-a",
							evidence: "documented",
						}),
						makeClaim("r002", {
							topic: "topic-b",
							evidence: "tested",
						}),
						makeClaim("r003", {
							topic: "topic-a",
							evidence: "stated",
							status: "superseded",
						}),
					],
				}),
				null,
				2,
			) + "\n",
		);
	});

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("emits valid JSON with expected top-level fields", () => {
		const { code, stdout } = runStatus(dir, ["--json"]);
		assert.equal(code, 0);
		const payload = JSON.parse(stdout);
		assert.equal(payload.question, "Is SSE the right fit?");
		assert.equal(payload.phase, "research");
		assert.ok(payload.status === "ready" || payload.status === "blocked");
		assert.equal(payload.claims.total, 3);
		assert.equal(payload.claims.active, 2);
		assert.equal(payload.claims.superseded, 1);
		assert.equal(payload.evidence.documented, 1);
		assert.equal(payload.evidence.tested, 1);
		assert.ok(payload.topics.includes("topic-a"));
		assert.ok(payload.topics.includes("topic-b"));
		assert.ok(payload.age && typeof payload.age.days === "number");
	});
});

describe("status: happy path (human mode)", () => {
	let dir;

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-status-tty-"));
		fs.writeFileSync(
			path.join(dir, "claims.json"),
			JSON.stringify(
				baseClaimsDoc({
					claims: [makeClaim("r001")],
				}),
				null,
				2,
			) + "\n",
		);
	});

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("prints question, phase, claims summary and exits 0", () => {
		const { code, stdout } = runStatus(dir, []);
		assert.equal(code, 0);
		assert.match(stdout, /Is SSE the right fit\?/);
		assert.match(stdout, /Phase:\s+research/);
		assert.match(stdout, /Claims:\s+1 total/);
	});
});

describe("status: error paths", () => {
	let dir;

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-status-bad-"));
	});

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("exits non-zero when claims.json is malformed", () => {
		fs.writeFileSync(path.join(dir, "claims.json"), "{not json");
		const { code, stderr } = runStatus(dir, []);
		assert.notEqual(code, 0);
		assert.match(stderr, /not valid JSON/);
	});
});
