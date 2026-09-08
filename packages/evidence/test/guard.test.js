/**
 * Integration test: wheat guard
 *
 * Verifies that the guard hook:
 *   - Allows writes to non-output paths
 *   - Blocks writes to output/ when no compilation.json exists
 *   - Allows writes to output/ when compilation is fresh and ready
 *   - Blocks malformed claims.json writes (missing meta.question)
 *   - Allows valid claims.json writes
 *
 * Uses node:test + node:assert — zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Import the guard function directly for unit-style integration testing
import { generateCertificate } from "../compiler/wheat-compiler.js";
import { guard } from "../lib/guard.js";

describe("wheat guard", () => {
	let tmpDir;

	before(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-guard-test-"));
		fs.mkdirSync(path.join(tmpDir, "output"), { recursive: true });
	});

	after(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("allows writes to non-output paths", () => {
		const result = guard(
			tmpDir,
			JSON.stringify({
				file_path: path.join(tmpDir, "research", "notes.md"),
			}),
		);
		assert.equal(result.allow, true);
	});

	it("blocks writes to output/ when no compilation.json exists", () => {
		const result = guard(
			tmpDir,
			JSON.stringify({
				file_path: path.join(tmpDir, "output", "brief.html"),
			}),
		);
		assert.equal(result.allow, false);
		assert.ok(
			result.reason.includes("BLOCKED"),
			"reason should include BLOCKED",
		);
	});

	it("allows writes to output/ when compilation is fresh and ready", () => {
		// Create claims.json
		const claimsPath = path.join(tmpDir, "claims.json");
		fs.writeFileSync(
			claimsPath,
			JSON.stringify({
				meta: { question: "test" },
				claims: [],
			}),
		);

		// Wait a tick so compilation.json mtime is after claims.json
		const compilationPath = path.join(tmpDir, "compilation.json");

		// Write compilation slightly after claims to ensure it's "fresh"
		const now = new Date();
		fs.writeFileSync(
			compilationPath,
			JSON.stringify({
				status: "ready",
				compilation_certificate: generateCertificate(JSON.parse(fs.readFileSync(claimsPath, "utf8"))),
				errors: [],
				summary: {},
			}),
		);
		// Force compilation mtime to be after claims mtime
		const future = new Date(now.getTime() + 1000);
		fs.utimesSync(compilationPath, future, future);

		const result = guard(
			tmpDir,
			JSON.stringify({
				file_path: path.join(tmpDir, "output", "brief.html"),
			}),
		);
		assert.equal(
			result.allow,
			true,
			"should allow when compilation is fresh and ready",
		);
	});

	it("blocks writes to output/ when compilation status is blocked", () => {
		const compilationPath = path.join(tmpDir, "compilation.json");
		fs.writeFileSync(
			compilationPath,
			JSON.stringify({
				status: "blocked",
				errors: [{ message: "unresolved conflict" }],
				summary: {},
			}),
		);
		const future = new Date(Date.now() + 2000);
		fs.utimesSync(compilationPath, future, future);

		const result = guard(
			tmpDir,
			JSON.stringify({
				file_path: path.join(tmpDir, "output", "brief.html"),
			}),
		);
		assert.equal(result.allow, false);
		assert.ok(
			result.reason.includes("blocked"),
			"reason should mention blocked status",
		);
	});

	it("blocks claims.json writes missing meta.question", () => {
		const result = guard(
			tmpDir,
			JSON.stringify({
				file_path: path.join(tmpDir, "claims.json"),
				content: JSON.stringify({ meta: {}, claims: [] }),
			}),
		);
		assert.equal(result.allow, false);
		assert.ok(
			result.reason.includes("meta.question"),
			"reason should mention meta.question",
		);
	});

	it("blocks claims.json writes missing claims array", () => {
		const result = guard(
			tmpDir,
			JSON.stringify({
				file_path: path.join(tmpDir, "claims.json"),
				content: JSON.stringify({ meta: { question: "test" } }),
			}),
		);
		assert.equal(result.allow, false);
		assert.ok(
			result.reason.includes("claims"),
			"reason should mention claims array",
		);
	});

	it("allows valid claims.json writes", () => {
		const result = guard(
			tmpDir,
			JSON.stringify({
				file_path: path.join(tmpDir, "claims.json"),
				content: JSON.stringify({
					meta: { question: "valid question" },
					claims: [{ id: "d001", type: "constraint" }],
				}),
			}),
		);
		assert.equal(result.allow, true);
	});

	it("allows non-JSON tool input (passes through)", () => {
		const result = guard(tmpDir, "not json at all");
		assert.equal(result.allow, true);
	});
});
