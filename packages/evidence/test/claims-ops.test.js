/**
 * Unit tests: lib/claims-ops.js
 *
 * Covers the shared claim CRUD used by both MCP + CLI:
 *   - addClaim: happy path, validation, duplicate IDs, missing sprint
 *   - searchClaims: filter by topic/type/evidence/query, content truncation
 *   - resolveClaim: happy path, missing claims, missing conflict relationship
 *   - getStatus: happy path, no sprint, type distribution, conflicted detection
 *   - VALID_TYPES + VALID_EVIDENCE + resolvePaths exports
 *
 * All disk I/O happens in per-test tempdirs — no user-state pollution.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../compiler/wheat-compiler.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
	addClaim,
	getStatus,
	resolveClaim,
	resolvePaths,
	searchClaims,
	VALID_EVIDENCE,
	VALID_TYPES,
} from "../lib/claims-ops.js";

function writeClaims(dir, data) {
	fs.writeFileSync(
		path.join(dir, "claims.json"),
		JSON.stringify(data, null, 2) + "\n",
	);
}

function baseClaimsDoc(overrides = {}) {
	return {
		schema_version: "1.0",
		meta: {
			question: "test question",
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
		content: "A claim",
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

describe("claims-ops: exports", () => {
	it("exports VALID_TYPES as an array of 6 types", () => {
		assert.ok(Array.isArray(VALID_TYPES));
		assert.equal(VALID_TYPES.length, 6);
		assert.ok(VALID_TYPES.includes("constraint"));
		assert.ok(VALID_TYPES.includes("factual"));
		assert.ok(VALID_TYPES.includes("recommendation"));
	});

	it("exports VALID_EVIDENCE as an array of 5 tiers", () => {
		assert.ok(Array.isArray(VALID_EVIDENCE));
		assert.equal(VALID_EVIDENCE.length, 5);
		assert.ok(VALID_EVIDENCE.includes("stated"));
		assert.ok(VALID_EVIDENCE.includes("production"));
	});

	it("resolvePaths returns the expected path shape", () => {
		const paths = resolvePaths("/tmp/example");
		assert.equal(paths.claims, path.join("/tmp/example", "claims.json"));
		assert.equal(
			paths.compilation,
			path.join("/tmp/example", "compilation.json"),
		);
		assert.ok(paths.brief.endsWith(path.join("output", "brief.html")));
		assert.ok(paths.compiler.endsWith("wheat-compiler.js"));
	});
});

describe("claims-ops: addClaim", () => {
	let dir;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-claims-ops-"));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("returns error when claims.json missing", () => {
		const result = addClaim(dir, {
			id: "r001",
			type: "factual",
			topic: "t",
			content: "c",
		});
		assert.equal(result.status, "error");
		assert.match(result.message, /No claims\.json/);
	});

	it("appends a claim and persists to disk (happy path)", () => {
		writeClaims(dir, baseClaimsDoc());
		const result = addClaim(dir, {
			id: "r001",
			type: "factual",
			topic: "topic-a",
			content: "Sky is blue",
			evidence: "documented",
			tags: ["sky"],
		});
		assert.equal(result.status, "ok");
		assert.equal(result.claim.id, "r001");
		assert.equal(result.claim.evidence, "documented");
		assert.deepEqual(result.claim.tags, ["sky"]);
		assert.equal(result.claim.status, "active");

		const raw = fs.readFileSync(path.join(dir, "claims.json"), "utf8");
		const parsed = JSON.parse(raw);
		assert.equal(parsed.claims.length, 1);
		assert.equal(parsed.claims[0].id, "r001");
	});

	it("defaults evidence to 'stated' when omitted", () => {
		writeClaims(dir, baseClaimsDoc());
		const result = addClaim(dir, {
			id: "r001",
			type: "factual",
			topic: "t",
			content: "c",
		});
		assert.equal(result.status, "ok");
		assert.equal(result.claim.evidence, "stated");
		assert.deepEqual(result.claim.tags, []);
	});

	it("rejects missing required fields", () => {
		writeClaims(dir, baseClaimsDoc());
		const result = addClaim(dir, { id: "r001", type: "factual" });
		assert.equal(result.status, "error");
		assert.match(result.message, /Required fields/);
	});

	it("rejects invalid type", () => {
		writeClaims(dir, baseClaimsDoc());
		const result = addClaim(dir, {
			id: "r001",
			type: "bogus",
			topic: "t",
			content: "c",
		});
		assert.equal(result.status, "error");
		assert.match(result.message, /Invalid type/);
	});

	it("rejects invalid evidence tier", () => {
		writeClaims(dir, baseClaimsDoc());
		const result = addClaim(dir, {
			id: "r001",
			type: "factual",
			topic: "t",
			content: "c",
			evidence: "hearsay",
		});
		assert.equal(result.status, "error");
		assert.match(result.message, /Invalid evidence/);
	});

	it("rejects duplicate claim IDs", () => {
		writeClaims(dir, baseClaimsDoc({ claims: [makeClaim("r001")] }));
		const result = addClaim(dir, {
			id: "r001",
			type: "factual",
			topic: "t",
			content: "c",
		});
		assert.equal(result.status, "error");
		assert.match(result.message, /already exists/);
	});
});

describe("claims-ops: searchClaims", () => {
	let dir;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-search-"));
		writeClaims(
			dir,
			baseClaimsDoc({
				claims: [
					makeClaim("r001", {
						topic: "topic-a",
						type: "factual",
						evidence: "documented",
						content: "SSE scales to 10k clients",
					}),
					makeClaim("r002", {
						topic: "topic-b",
						type: "risk",
						evidence: "web",
						content: "Polling is wasteful",
					}),
					makeClaim("r003", {
						topic: "topic-a",
						type: "recommendation",
						evidence: "tested",
						content: "Use SSE for fanout",
					}),
					makeClaim("r004", {
						topic: "topic-a",
						type: "factual",
						evidence: "documented",
						content: "Superseded",
						status: "superseded",
					}),
				],
			}),
		);
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("returns all active claims when no filters are given", () => {
		const result = searchClaims(dir, {});
		assert.equal(result.status, "ok");
		assert.equal(result.count, 3);
	});

	it("filters by topic", () => {
		const result = searchClaims(dir, { topic: "topic-a" });
		assert.equal(result.count, 2);
	});

	it("filters by type", () => {
		const result = searchClaims(dir, { type: "recommendation" });
		assert.equal(result.count, 1);
		assert.equal(result.claims[0].id, "r003");
	});

	it("filters by evidence tier", () => {
		const result = searchClaims(dir, { evidence: "tested" });
		assert.equal(result.count, 1);
	});

	it("query filter is case-insensitive substring match on content", () => {
		const result = searchClaims(dir, { query: "sse" });
		assert.equal(result.count, 2);
	});

	it("truncates content longer than 200 chars with ellipsis", () => {
		const longContent = "x".repeat(250);
		writeClaims(
			dir,
			baseClaimsDoc({
				claims: [makeClaim("r001", { content: longContent, topic: "long" })],
			}),
		);
		const result = searchClaims(dir, { topic: "long" });
		assert.equal(result.count, 1);
		assert.ok(result.claims[0].content.endsWith("..."));
		assert.equal(result.claims[0].content.length, 203);
	});

	it("returns error when claims.json missing", () => {
		const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-empty-"));
		try {
			const result = searchClaims(emptyDir, {});
			assert.equal(result.status, "error");
		} finally {
			fs.rmSync(emptyDir, { recursive: true, force: true });
		}
	});
});

describe("claims-ops: resolveClaim", () => {
	let dir;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-resolve-"));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("resolves a valid conflict and marks loser superseded", () => {
		writeClaims(
			dir,
			baseClaimsDoc({
				claims: [
					makeClaim("r001", { conflicts_with: ["r002"] }),
					makeClaim("r002", { conflicts_with: ["r001"] }),
				],
			}),
		);
		const result = resolveClaim(dir, {
			winner: "r001",
			loser: "r002",
			reason: "Better evidence",
		});
		assert.equal(result.status, "ok");
		assert.match(result.message, /Better evidence/);

		const parsed = JSON.parse(
			fs.readFileSync(path.join(dir, "claims.json"), "utf8"),
		);
		const winner = parsed.claims.find((c) => c.id === "r001");
		const loser = parsed.claims.find((c) => c.id === "r002");
		assert.equal(winner.status, "active");
		assert.deepEqual(winner.conflicts_with, []);
		assert.equal(loser.status, "superseded");
		assert.equal(loser.resolved_by, "r001");
	});

	it("errors when required args are missing", () => {
		writeClaims(dir, baseClaimsDoc());
		const result = resolveClaim(dir, { winner: "r001" });
		assert.equal(result.status, "error");
		assert.match(result.message, /Required fields/);
	});

	it("errors when winner does not exist", () => {
		writeClaims(dir, baseClaimsDoc({ claims: [makeClaim("r002")] }));
		const result = resolveClaim(dir, { winner: "r001", loser: "r002" });
		assert.equal(result.status, "error");
		assert.match(result.message, /"r001" not found/);
	});

	it("errors when loser does not exist", () => {
		writeClaims(dir, baseClaimsDoc({ claims: [makeClaim("r001")] }));
		const result = resolveClaim(dir, { winner: "r001", loser: "r002" });
		assert.equal(result.status, "error");
		assert.match(result.message, /"r002" not found/);
	});

	it("errors when claims have no conflict relationship", () => {
		writeClaims(
			dir,
			baseClaimsDoc({
				claims: [makeClaim("r001"), makeClaim("r002")],
			}),
		);
		const result = resolveClaim(dir, { winner: "r001", loser: "r002" });
		assert.equal(result.status, "error");
		assert.match(result.message, /no conflicts_with relationship/);
	});

	it("errors when claims.json missing", () => {
		const result = resolveClaim(dir, { winner: "r001", loser: "r002" });
		assert.equal(result.status, "error");
		assert.match(result.message, /No claims\.json/);
	});
});

describe("claims-ops: getStatus", () => {
	let dir;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-status-"));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("returns no_sprint when claims.json missing", () => {
		const result = getStatus(dir);
		assert.equal(result.status, "no_sprint");
	});

	it("summarizes an active sprint (happy path)", () => {
		writeClaims(
			dir,
			baseClaimsDoc({
				claims: [
					makeClaim("r001", { topic: "topic-a", type: "factual" }),
					makeClaim("r002", { topic: "topic-a", type: "factual" }),
					makeClaim("r003", { topic: "topic-b", type: "recommendation" }),
					makeClaim("r004", {
						topic: "topic-c",
						status: "superseded",
					}),
				],
			}),
		);
		const result = getStatus(dir);
		assert.equal(result.status, "ok");
		assert.equal(result.question, "test question");
		assert.equal(result.phase, "research");
		assert.equal(result.total_claims, 4);
		assert.equal(result.active_claims, 3);
		assert.equal(result.topics, 2); // only active claims contribute
		assert.equal(result.type_distribution.factual, 2);
		assert.equal(result.type_distribution.recommendation, 1);
	});

	it("counts active claims with conflicts_with as conflicted", () => {
		writeClaims(
			dir,
			baseClaimsDoc({
				claims: [
					makeClaim("r001", { conflicts_with: ["r002"] }),
					makeClaim("r002", { conflicts_with: ["r001"] }),
				],
			}),
		);
		const result = getStatus(dir);
		assert.equal(result.conflicted_claims, 2);
	});

	it("reads compilation_status from compilation.json when present", () => {
		writeClaims(dir, baseClaimsDoc());
		compile(path.join(dir, "claims.json"), path.join(dir, "compilation.json"), dir);
		const result = getStatus(dir);
		assert.equal(result.compilation_status, "ready");
	});

	it("degrades to 'unknown' when compilation.json is malformed", () => {
		writeClaims(dir, baseClaimsDoc());
		fs.writeFileSync(path.join(dir, "compilation.json"), "{not json");
		const result = getStatus(dir);
		assert.equal(result.compilation_status, "unknown");
	});

	it("handles empty sprint (no claims)", () => {
		writeClaims(dir, baseClaimsDoc({ claims: [] }));
		const result = getStatus(dir);
		assert.equal(result.status, "ok");
		assert.equal(result.total_claims, 0);
		assert.equal(result.active_claims, 0);
		assert.equal(result.topics, 0);
	});
});
