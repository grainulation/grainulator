/**
 * Integration test: wheat compile
 *
 * Verifies that the compiler reads a valid claims.json and produces
 * compilation.json with expected structure (status, passes, summary).
 *
 * Uses node:test + node:assert — zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMPILER_PATH = path.resolve(
	__dirname,
	"..",
	"compiler",
	"wheat-compiler.js",
);

/** Build a minimal valid claims.json payload */
function minimalClaims(overrides = {}) {
	return {
		schema_version: overrides.schema_version || "1.0",
		meta: {
			question: "Integration test question",
			initiated: "2026-01-01",
			audience: ["ci"],
			phase: "define",
			connectors: [],
			...overrides.meta,
		},
		claims: overrides.claims || [
			{
				id: "d001",
				type: "constraint",
				topic: "test-topic",
				content: "This is a test constraint claim for CI.",
				source: { origin: "stakeholder", artifact: null, connector: null },
				evidence: "stated",
				status: "active",
				phase_added: "define",
				timestamp: "2026-01-01T00:00:00Z",
				conflicts_with: [],
				resolved_by: null,
				tags: ["ci"],
			},
		],
	};
}

describe("wheat compile", () => {
	let tmpDir;

	before(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-compiler-test-"));
	});

	after(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("produces compilation.json from valid claims", () => {
		const claimsPath = path.join(tmpDir, "claims.json");
		fs.writeFileSync(claimsPath, JSON.stringify(minimalClaims(), null, 2));

		execFileSync(process.execPath, [COMPILER_PATH, "--dir", tmpDir], {
			timeout: 10_000,
			stdio: "pipe",
		});

		const compilationPath = path.join(tmpDir, "compilation.json");
		assert.ok(fs.existsSync(compilationPath), "compilation.json should exist");

		const compilation = JSON.parse(fs.readFileSync(compilationPath, "utf8"));
		assert.ok(
			["ready", "blocked"].includes(compilation.status),
			"status should be ready or blocked",
		);
		assert.ok(
			compilation.compiled_at,
			"compilation should have compiled_at timestamp",
		);
		assert.ok(compilation.claims_hash, "compilation should have claims_hash");
		assert.ok(compilation.coverage, "compilation should have coverage");
		assert.ok(
			compilation.phase_summary,
			"compilation should have phase_summary",
		);
	});

	it("accepts refuted as a valid claim status", () => {
		const claimsPath = path.join(tmpDir, "claims.json");
		fs.writeFileSync(
			claimsPath,
			JSON.stringify(
				minimalClaims({
					claims: [
						{
							id: "r001",
							type: "factual",
							topic: "refutation-demo",
							content: "Initial claim later disproved by adversarial review.",
							source: {
								origin: "cli",
								artifact: null,
								connector: null,
							},
							evidence: "documented",
							status: "refuted",
							phase_added: "research",
							timestamp: "2026-04-18T00:00:00Z",
							conflicts_with: [],
							resolved_by: "r002",
							tags: [],
						},
					],
				}),
				null,
				2,
			),
		);

		execFileSync(
			process.execPath,
			[COMPILER_PATH, "--dir", tmpDir, "--check"],
			{ timeout: 10_000, stdio: "pipe" },
		);

		const compilationPath = path.join(tmpDir, "compilation.json");
		const compilation = JSON.parse(fs.readFileSync(compilationPath, "utf8"));
		assert.equal(
			compilation.sprint_meta.refuted_claims,
			1,
			"refuted_claims counter should reflect refuted claims",
		);
	});

	it("--check exits 0 for valid claims", () => {
		const claimsPath = path.join(tmpDir, "claims.json");
		fs.writeFileSync(claimsPath, JSON.stringify(minimalClaims(), null, 2));

		// Should not throw (exit 0)
		execFileSync(
			process.execPath,
			[COMPILER_PATH, "--dir", tmpDir, "--check"],
			{
				timeout: 10_000,
				stdio: "pipe",
			},
		);
	});

	it("--summary produces human-readable output", () => {
		const claimsPath = path.join(tmpDir, "claims.json");
		fs.writeFileSync(claimsPath, JSON.stringify(minimalClaims(), null, 2));

		const result = execFileSync(
			process.execPath,
			[COMPILER_PATH, "--dir", tmpDir, "--summary"],
			{ timeout: 10_000, encoding: "utf8" },
		);

		assert.ok(result.length > 0, "summary should produce output");
	});

	it("rejects claims with missing required fields", () => {
		const badClaims = minimalClaims({
			claims: [
				{
					id: "bad001",
					// missing type, topic, content, etc.
				},
			],
		});
		const claimsPath = path.join(tmpDir, "claims.json");
		fs.writeFileSync(claimsPath, JSON.stringify(badClaims, null, 2));

		// Compile — should produce compilation with errors or blocked status
		execFileSync(process.execPath, [COMPILER_PATH, "--dir", tmpDir], {
			timeout: 10_000,
			stdio: "pipe",
		});

		const compilation = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "compilation.json"), "utf8"),
		);
		assert.equal(
			compilation.status,
			"blocked",
			"bad claims should result in blocked status",
		);
		assert.ok(compilation.errors.length > 0, "should have validation errors");
	});

	it("detects duplicate claim IDs", () => {
		const dupeClaims = minimalClaims({
			claims: [
				{
					id: "d001",
					type: "constraint",
					topic: "a",
					content: "first",
					source: { origin: "stakeholder", artifact: null, connector: null },
					evidence: "stated",
					status: "active",
					phase_added: "define",
					timestamp: "2026-01-01T00:00:00Z",
					conflicts_with: [],
					resolved_by: null,
					tags: [],
				},
				{
					id: "d001",
					type: "constraint",
					topic: "b",
					content: "duplicate",
					source: { origin: "stakeholder", artifact: null, connector: null },
					evidence: "stated",
					status: "active",
					phase_added: "define",
					timestamp: "2026-01-01T00:00:00Z",
					conflicts_with: [],
					resolved_by: null,
					tags: [],
				},
			],
		});
		const claimsPath = path.join(tmpDir, "claims.json");
		fs.writeFileSync(claimsPath, JSON.stringify(dupeClaims, null, 2));

		execFileSync(process.execPath, [COMPILER_PATH, "--dir", tmpDir], {
			timeout: 10_000,
			stdio: "pipe",
		});

		const compilation = JSON.parse(
			fs.readFileSync(path.join(tmpDir, "compilation.json"), "utf8"),
		);
		assert.equal(
			compilation.status,
			"blocked",
			"duplicate IDs should block compilation",
		);
	});
});
