/**
 * Unit tests: schema migration framework
 *
 * Verifies compareVersions, checkAndMigrateSchema, and the loadClaims helper.
 * Uses node:test + node:assert — zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
	CURRENT_SCHEMA,
	SCHEMA_MIGRATIONS,
	checkAndMigrateSchema,
	_internals,
} from "../compiler/wheat-compiler.js";

const { compareVersions } = _internals;
import { loadClaims } from "../lib/load-claims.js";

// ── compareVersions ──────────────────────────────────────────────────────────

describe("compareVersions", () => {
	it("equal versions return 0", () => {
		assert.equal(compareVersions("1.0", "1.0"), 0);
		assert.equal(compareVersions("2.3", "2.3"), 0);
	});

	it("lesser version returns -1", () => {
		assert.equal(compareVersions("1.0", "1.1"), -1);
		assert.equal(compareVersions("1.9", "2.0"), -1);
	});

	it("greater version returns 1", () => {
		assert.equal(compareVersions("1.1", "1.0"), 1);
		assert.equal(compareVersions("2.0", "1.9"), 1);
	});

	it("handles missing minor segment", () => {
		assert.equal(compareVersions("1", "1.0"), 0);
		assert.equal(compareVersions("2", "1.9"), 1);
	});
});

// ── checkAndMigrateSchema ────────────────────────────────────────────────────

describe("checkAndMigrateSchema", () => {
	it("missing schema_version defaults to 1.0", () => {
		const input = { meta: { question: "test" }, claims: [] };
		const { data, errors } = checkAndMigrateSchema(input);
		assert.equal(errors.length, 0);
		assert.deepEqual(data.claims, []);
	});

	it("reads schema_version from root level", () => {
		const input = {
			schema_version: "1.0",
			meta: { question: "test" },
			claims: [],
		};
		const { data, errors } = checkAndMigrateSchema(input);
		assert.equal(errors.length, 0);
		assert.ok(data);
	});

	it("reads schema_version from meta as fallback", () => {
		const input = {
			meta: { question: "test", schema_version: "1.0" },
			claims: [],
		};
		const { data, errors } = checkAndMigrateSchema(input);
		assert.equal(errors.length, 0);
		assert.ok(data);
	});

	it("rejects future schema version with E_SCHEMA_VERSION", () => {
		const input = { schema_version: "99.0", meta: {}, claims: [] };
		const { errors } = checkAndMigrateSchema(input);
		assert.equal(errors.length, 1);
		assert.equal(errors[0].code, "E_SCHEMA_VERSION");
	});

	it("data at CURRENT_SCHEMA passes through unchanged", () => {
		const input = {
			schema_version: CURRENT_SCHEMA,
			meta: { question: "test" },
			claims: [{ id: "d001" }],
		};
		const { data, errors } = checkAndMigrateSchema(input);
		assert.equal(errors.length, 0);
		assert.deepEqual(data.claims, [{ id: "d001" }]);
	});

	it("migration is idempotent — running twice yields same result", () => {
		const input = {
			schema_version: CURRENT_SCHEMA,
			meta: { question: "test" },
			claims: [],
		};
		const first = checkAndMigrateSchema(input);
		const second = checkAndMigrateSchema(first.data);
		assert.deepEqual(first.data, second.data);
		assert.equal(second.errors.length, 0);
	});
});

// ── loadClaims ───────────────────────────────────────────────────────────────

describe("loadClaims", () => {
	let tmpDir;

	before(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-migration-test-"));
	});

	after(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null data for missing directory", () => {
		const { data, errors } = loadClaims(path.join(tmpDir, "nonexistent"));
		assert.equal(data, null);
	});

	it("returns null data for invalid JSON", () => {
		fs.writeFileSync(path.join(tmpDir, "claims.json"), "not json");
		const { data, errors } = loadClaims(tmpDir);
		assert.equal(data, null);
		assert.equal(errors[0].code, "E_PARSE");
	});

	it("loads and migrates valid claims", () => {
		const claims = {
			schema_version: "1.0",
			meta: {
				question: "test",
				initiated: "2026-01-01",
				audience: ["ci"],
				phase: "define",
				connectors: [],
			},
			claims: [],
		};
		fs.writeFileSync(path.join(tmpDir, "claims.json"), JSON.stringify(claims));
		const { data, errors } = loadClaims(tmpDir);
		assert.equal(errors.length, 0);
		assert.ok(data);
		assert.equal(data.meta.question, "test");
	});

	it("rejects future schema version", () => {
		const claims = { schema_version: "99.0", meta: {}, claims: [] };
		fs.writeFileSync(path.join(tmpDir, "claims.json"), JSON.stringify(claims));
		const { data, errors } = loadClaims(tmpDir);
		assert.equal(data, null);
		assert.equal(errors[0].code, "E_SCHEMA_VERSION");
	});

	it("supports custom filename via opts", () => {
		const claims = {
			schema_version: "1.0",
			meta: { question: "custom" },
			claims: [],
		};
		fs.writeFileSync(path.join(tmpDir, "custom.json"), JSON.stringify(claims));
		const { data, errors } = loadClaims(tmpDir, { filename: "custom.json" });
		assert.equal(errors.length, 0);
		assert.ok(data);
		assert.equal(data.meta.question, "custom");
	});
});

// ── Golden-file fixture: claims-v1.0.json ────────────────────────────────────

describe("golden-file: claims-v1.0.json", () => {
	const FIXTURES_DIR = path.join(
		path.dirname(import.meta.url.replace("file://", "")),
		"fixtures",
	);
	let fixture;

	before(() => {
		const raw = fs.readFileSync(
			path.join(FIXTURES_DIR, "claims-v1.0.json"),
			"utf8",
		);
		fixture = JSON.parse(raw);
	});

	it("fixture has schema_version at root level", () => {
		assert.equal(fixture.schema_version, "1.0");
	});

	it("migrates to CURRENT_SCHEMA without errors", () => {
		const result = checkAndMigrateSchema(structuredClone(fixture));
		assert.equal(result.errors.length, 0);
		assert.ok(result.data);
	});

	it("preserves all claims through migration", () => {
		const result = checkAndMigrateSchema(structuredClone(fixture));
		assert.equal(result.data.claims.length, fixture.claims.length);
		assert.equal(result.data.claims[0].id, "d001");
		assert.equal(result.data.claims[1].id, "r001");
	});

	it("preserves meta through migration", () => {
		const result = checkAndMigrateSchema(structuredClone(fixture));
		assert.equal(result.data.meta.question, fixture.meta.question);
		assert.deepEqual(result.data.meta.audience, fixture.meta.audience);
	});
});

// ── SCHEMA_MIGRATIONS chain integrity ────────────────────────────────────────

describe("SCHEMA_MIGRATIONS", () => {
	it("is an array", () => {
		assert.ok(Array.isArray(SCHEMA_MIGRATIONS));
	});

	it("each entry has from, to, and migrate function", () => {
		for (const m of SCHEMA_MIGRATIONS) {
			assert.ok(typeof m.from === "string", `migration missing "from"`);
			assert.ok(typeof m.to === "string", `migration missing "to"`);
			assert.ok(typeof m.migrate === "function", `migration missing "migrate"`);
		}
	});

	it("migrations form a contiguous chain (no gaps)", () => {
		for (let i = 1; i < SCHEMA_MIGRATIONS.length; i++) {
			assert.equal(
				SCHEMA_MIGRATIONS[i].from,
				SCHEMA_MIGRATIONS[i - 1].to,
				`Gap in migration chain: ${SCHEMA_MIGRATIONS[i - 1].to} -> ${
					SCHEMA_MIGRATIONS[i].from
				}`,
			);
		}
	});

	it("last migration targets CURRENT_SCHEMA (if any migrations exist)", () => {
		if (SCHEMA_MIGRATIONS.length > 0) {
			const last = SCHEMA_MIGRATIONS[SCHEMA_MIGRATIONS.length - 1];
			assert.equal(last.to, CURRENT_SCHEMA);
		}
	});
});
