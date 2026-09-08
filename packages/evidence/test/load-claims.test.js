/**
 * Unit tests: lib/load-claims.js
 *
 * Verifies the shared claims.json loader/migrator:
 *   - returns null data when the file is missing (no error)
 *   - returns E_PARSE on malformed JSON
 *   - returns E_SCHEMA_VERSION when schema is newer than compiler
 *   - runs schema migration (current version 1.0 is a no-op pass-through)
 *   - respects opts.filename override
 *   - returns the resolved path in the result
 *
 * All disk I/O uses a per-test tempdir — no user-state pollution.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadClaims } from "../lib/load-claims.js";
import { CURRENT_SCHEMA } from "../compiler/wheat-compiler.js";

describe("load-claims", () => {
	let dir;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-load-claims-"));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("returns { data: null, errors: [] } when claims.json is missing", () => {
		const result = loadClaims(dir);
		assert.equal(result.data, null);
		assert.deepEqual(result.errors, []);
		assert.equal(result.path, path.join(dir, "claims.json"));
	});

	it("returns E_PARSE error on malformed JSON", () => {
		fs.writeFileSync(path.join(dir, "claims.json"), "{not json}");
		const result = loadClaims(dir);
		assert.equal(result.data, null);
		assert.equal(result.errors.length, 1);
		assert.equal(result.errors[0].code, "E_PARSE");
		assert.match(result.errors[0].message, /not valid JSON/);
	});

	it("loads a valid current-version claims doc (happy path)", () => {
		const doc = {
			schema_version: "1.0",
			meta: { question: "q", phase: "research" },
			claims: [],
		};
		fs.writeFileSync(
			path.join(dir, "claims.json"),
			JSON.stringify(doc, null, 2) + "\n",
		);
		const result = loadClaims(dir);
		assert.deepEqual(result.errors, []);
		assert.ok(result.data);
		assert.equal(result.data.schema_version, "1.0");
		assert.equal(result.data.meta.question, "q");
	});

	it("treats missing schema_version as 1.0 (backwards compat)", () => {
		const doc = { meta: { question: "q" }, claims: [] };
		fs.writeFileSync(
			path.join(dir, "claims.json"),
			JSON.stringify(doc, null, 2) + "\n",
		);
		const result = loadClaims(dir);
		assert.deepEqual(result.errors, []);
		assert.ok(result.data);
		assert.deepEqual(result.data.claims, []);
	});

	it("returns E_SCHEMA_VERSION when file schema is newer than compiler", () => {
		const doc = {
			schema_version: "99.99",
			meta: { question: "q" },
			claims: [],
		};
		fs.writeFileSync(
			path.join(dir, "claims.json"),
			JSON.stringify(doc, null, 2) + "\n",
		);
		const result = loadClaims(dir);
		assert.equal(result.data, null);
		assert.equal(result.errors.length, 1);
		assert.equal(result.errors[0].code, "E_SCHEMA_VERSION");
	});

	it("respects opts.filename override", () => {
		const doc = { schema_version: CURRENT_SCHEMA, meta: {}, claims: [] };
		fs.writeFileSync(
			path.join(dir, "alternate.json"),
			JSON.stringify(doc, null, 2) + "\n",
		);
		const result = loadClaims(dir, { filename: "alternate.json" });
		assert.deepEqual(result.errors, []);
		assert.ok(result.data);
		assert.equal(result.path, path.join(dir, "alternate.json"));
	});

	it("returns the resolved path even when file is absent", () => {
		const result = loadClaims(dir);
		assert.equal(result.path, path.join(dir, "claims.json"));
	});

	it("handles a non-object JSON root without throwing (returns data as-is)", () => {
		// Arrays and nulls aren't valid claims docs, but the loader should not crash.
		fs.writeFileSync(path.join(dir, "claims.json"), "[]");
		const result = loadClaims(dir);
		// checkAndMigrateSchema accepts any object-ish root, but `[].meta` = undefined.
		// With no schema_version and no meta.schema_version, it defaults to 1.0
		// and returns the data unchanged. We just verify no exception is thrown
		// and that an array is NOT coerced into a valid claims doc.
		assert.ok(Array.isArray(result.data) || result.data === null);
	});
});
