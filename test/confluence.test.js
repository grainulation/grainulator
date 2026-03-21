/**
 * Tests for lib/confluence-sync.js and lib/confluence-pull.js.
 *
 * Validates content generation, JSON extraction, sync state management,
 * and cross-platform path handling.
 *
 * Uses node:test + node:assert -- zero dependencies.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  contentHash,
  buildClaimsTable,
  buildJsonCodeBlock,
  buildSyncBanner,
  buildClaimsPageBody,
  buildBriefPageBody,
  loadSyncState,
  saveSyncState,
  planSync,
  recordSync,
  mcpCreatePage,
  mcpUpdatePage,
  mcpSearchPages,
} from "../lib/confluence-sync.js";

import {
  extractJsonFromStorage,
  validateClaimsStructure,
  writeLocalClaims,
  planPull,
  executePull,
  mcpGetPage,
  mcpSearchWheatPages,
} from "../lib/confluence-pull.js";

// ── Test fixtures ───────────────────────────────────────────────────────────

const SAMPLE_CLAIMS = [
  {
    id: "r001",
    type: "factual",
    topic: "test-topic",
    content: 'This is a test claim with <html> & "quotes"',
    status: "active",
    evidence: "web",
    source: {
      origin: "research",
      artifact: "https://example.com",
      connector: null,
    },
    phase_added: "research",
    timestamp: "2026-03-20T12:00:00.000Z",
    conflicts_with: [],
    resolved_by: null,
    tags: ["test"],
  },
  {
    id: "r002",
    type: "risk",
    topic: "test-topic",
    content: "A risk claim",
    status: "superseded",
    evidence: "stated",
    source: { origin: "analysis", artifact: null, connector: null },
    phase_added: "research",
    timestamp: "2026-03-20T13:00:00.000Z",
    conflicts_with: [],
    resolved_by: "r003 wins",
    tags: ["test", "risk"],
  },
];

const SAMPLE_CLAIMS_JSON = {
  schema_version: "1.0",
  meta: {
    question: "Test question?",
    initiated: "2026-03-20",
    audience: ["engineers"],
    phase: "research",
    connectors: [],
  },
  claims: SAMPLE_CLAIMS,
};

const SAMPLE_COMPILATION = {
  schema_version: "1.0",
  sprint: "test-sprint",
  summary: "A test summary of findings.",
  warnings: ["Low evidence coverage on test-topic"],
  claims_hash: "abc123",
};

// ── Temp directory management ───────────────────────────────────────────────

let tmpDir;

function createTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-test-"));
  return tmpDir;
}

function cleanupTmpDir() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── confluence-sync.js tests ────────────────────────────────────────────────

describe("confluence-sync", () => {
  describe("contentHash", () => {
    it("produces consistent SHA-256 hashes", () => {
      const h1 = contentHash("hello");
      const h2 = contentHash("hello");
      assert.equal(h1, h2);
      assert.equal(h1.length, 64);
    });

    it("produces different hashes for different content", () => {
      const h1 = contentHash("hello");
      const h2 = contentHash("world");
      assert.notEqual(h1, h2);
    });
  });

  describe("buildClaimsTable", () => {
    it("returns empty message for no claims", () => {
      const html = buildClaimsTable([]);
      assert.ok(html.includes("No claims"));
    });

    it("renders claims as HTML table", () => {
      const html = buildClaimsTable(SAMPLE_CLAIMS);
      assert.ok(html.includes("<table>"));
      assert.ok(html.includes("r001"));
      assert.ok(html.includes("r002"));
      assert.ok(html.includes("factual"));
      assert.ok(html.includes("risk"));
    });

    it("escapes HTML entities in claim content", () => {
      const html = buildClaimsTable(SAMPLE_CLAIMS);
      assert.ok(html.includes("&lt;html&gt;"));
      assert.ok(html.includes("&amp;"));
      assert.ok(html.includes("&quot;quotes&quot;"));
    });

    it("includes auto-generated banner warning", () => {
      const html = buildClaimsTable(SAMPLE_CLAIMS);
      assert.ok(html.includes("auto-generated"));
      assert.ok(html.includes("Do not edit"));
    });

    it("includes status badges", () => {
      const html = buildClaimsTable(SAMPLE_CLAIMS);
      assert.ok(html.includes("Green"));
      assert.ok(html.includes("Grey"));
    });
  });

  describe("buildJsonCodeBlock", () => {
    it("wraps JSON in expand + code macros with CDATA", () => {
      const html = buildJsonCodeBlock({ test: true });
      assert.ok(html.includes('ac:name="expand"'));
      assert.ok(html.includes('ac:name="code"'));
      assert.ok(html.includes("language"));
      assert.ok(html.includes("json"));
      assert.ok(html.includes("CDATA"));
      assert.ok(html.includes('"test": true'));
    });
  });

  describe("buildSyncBanner", () => {
    it("includes timestamp in ISO format", () => {
      const html = buildSyncBanner(1710936000000);
      assert.ok(html.includes("Last synced:"));
      assert.ok(html.includes("2024-03-20"));
    });
  });

  describe("buildClaimsPageBody", () => {
    it("combines banner + table + JSON block", () => {
      const body = buildClaimsPageBody(
        SAMPLE_CLAIMS,
        SAMPLE_CLAIMS_JSON,
        Date.now(),
      );
      assert.ok(body.includes("Last synced:"));
      assert.ok(body.includes("<table>"));
      assert.ok(body.includes("CDATA"));
    });
  });

  describe("buildBriefPageBody", () => {
    it("renders summary and warnings", () => {
      const body = buildBriefPageBody(SAMPLE_COMPILATION, Date.now());
      assert.ok(body.includes("test summary"));
      assert.ok(body.includes("Low evidence"));
    });
  });

  describe("sync state persistence", () => {
    beforeEach(() => createTmpDir());
    afterEach(() => cleanupTmpDir());

    it("returns empty object when no state file exists", () => {
      const state = loadSyncState(tmpDir);
      assert.deepEqual(state, {});
    });

    it("round-trips state through save/load", () => {
      const state = {
        "test-sprint": {
          lastHash: "abc123",
          lastSyncTimestamp: 1710936000000,
          pages: { parent: { pageId: "123", version: 1 } },
        },
      };
      saveSyncState(tmpDir, state);
      const loaded = loadSyncState(tmpDir);
      assert.deepEqual(loaded, state);
    });

    it("creates parent directories if needed", () => {
      saveSyncState(tmpDir, { test: true });
      assert.ok(fs.existsSync(path.join(tmpDir, "sync-state.json")));
    });
  });

  describe("planSync", () => {
    beforeEach(() => {
      createTmpDir();
      const sprintDir = path.join(tmpDir, "sprints", "test-sprint");
      fs.mkdirSync(sprintDir, { recursive: true });
      fs.writeFileSync(
        path.join(sprintDir, "compilation.json"),
        JSON.stringify(SAMPLE_COMPILATION),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sprintDir, "claims.json"),
        JSON.stringify(SAMPLE_CLAIMS_JSON),
        "utf8",
      );
    });
    afterEach(() => cleanupTmpDir());

    it("produces a valid sync plan", () => {
      const plan = planSync({
        wheatRoot: tmpDir,
        sprintSlug: "test-sprint",
        spaceKey: "RES",
      });
      assert.equal(plan.sprintSlug, "test-sprint");
      assert.equal(plan.spaceKey, "RES");
      assert.ok(plan.claimsPageBody.includes("r001"));
      assert.ok(plan.briefPageBody.includes("test summary"));
      assert.ok(plan.hash);
      assert.equal(plan.unchanged, false);
    });

    it("detects unchanged content", () => {
      const plan1 = planSync({
        wheatRoot: tmpDir,
        sprintSlug: "test-sprint",
        spaceKey: "RES",
      });
      recordSync(tmpDir, "test-sprint", {
        hash: plan1.hash,
        syncTimestamp: plan1.syncTimestamp,
        pages: {},
      });
      const plan2 = planSync({
        wheatRoot: tmpDir,
        sprintSlug: "test-sprint",
        spaceKey: "RES",
      });
      assert.equal(plan2.unchanged, true);
    });

    it("throws when compilation.json is missing", () => {
      fs.unlinkSync(
        path.join(tmpDir, "sprints", "test-sprint", "compilation.json"),
      );
      assert.throws(() => {
        planSync({
          wheatRoot: tmpDir,
          sprintSlug: "test-sprint",
          spaceKey: "RES",
        });
      }, /compilation\.json/);
    });

    it("sets archive labels when archive flag is true", () => {
      const plan = planSync({
        wheatRoot: tmpDir,
        sprintSlug: "test-sprint",
        spaceKey: "RES",
        archive: true,
      });
      assert.deepEqual(plan.labels, ["wheat-archived"]);
    });
  });

  describe("recordSync", () => {
    beforeEach(() => createTmpDir());
    afterEach(() => cleanupTmpDir());

    it("persists sync record", () => {
      recordSync(tmpDir, "test-sprint", {
        hash: "abc",
        syncTimestamp: 123,
        pages: { parent: { pageId: "1", version: 1 } },
      });
      const state = loadSyncState(tmpDir);
      assert.equal(state["test-sprint"].lastHash, "abc");
      assert.equal(state["test-sprint"].lastSyncTimestamp, 123);
    });
  });

  describe("MCP tool call builders", () => {
    it("mcpCreatePage builds correct descriptor", () => {
      const call = mcpCreatePage({
        spaceKey: "RES",
        title: "Test",
        body: "<p>Hi</p>",
        labels: ["wheat-active"],
      });
      assert.equal(call.tool, "mcp__claude_ai_Atlassian__createConfluencePage");
      assert.equal(call.params.spaceKey, "RES");
      assert.equal(call.params.labels, "wheat-active");
    });

    it("mcpUpdatePage builds correct descriptor", () => {
      const call = mcpUpdatePage({
        pageId: "123",
        title: "Test",
        body: "<p>Hi</p>",
        version: 2,
      });
      assert.equal(call.tool, "mcp__claude_ai_Atlassian__updateConfluencePage");
      assert.equal(call.params.version, 2);
    });

    it("mcpSearchPages builds CQL query", () => {
      const call = mcpSearchPages({
        spaceKey: "RES",
        label: "wheat-active",
        title: "Test",
      });
      assert.ok(call.params.cql.includes('space = "RES"'));
      assert.ok(call.params.cql.includes('label = "wheat-active"'));
    });
  });
});

// ── confluence-pull.js tests ────────────────────────────────────────────────

describe("confluence-pull", () => {
  describe("extractJsonFromStorage", () => {
    it("extracts JSON from CDATA block", () => {
      const body = buildJsonCodeBlock(SAMPLE_CLAIMS_JSON);
      const extracted = extractJsonFromStorage(body);
      assert.deepEqual(extracted, SAMPLE_CLAIMS_JSON);
    });

    it("returns null for empty input", () => {
      assert.equal(extractJsonFromStorage(""), null);
      assert.equal(extractJsonFromStorage(null), null);
    });

    it("returns null when no CDATA block found", () => {
      assert.equal(extractJsonFromStorage("<p>No code blocks here</p>"), null);
    });

    it("skips non-JSON CDATA blocks", () => {
      const body =
        "<![CDATA[not json]]>" +
        buildJsonCodeBlock({ schema_version: "1.0", meta: {}, claims: [] });
      const extracted = extractJsonFromStorage(body);
      assert.equal(extracted.schema_version, "1.0");
    });

    it("handles full page body with table + JSON block", () => {
      const body = buildClaimsPageBody(
        SAMPLE_CLAIMS,
        SAMPLE_CLAIMS_JSON,
        Date.now(),
      );
      const extracted = extractJsonFromStorage(body);
      assert.deepEqual(extracted, SAMPLE_CLAIMS_JSON);
    });
  });

  describe("validateClaimsStructure", () => {
    it("validates a correct structure", () => {
      const result = validateClaimsStructure(SAMPLE_CLAIMS_JSON);
      assert.equal(result.valid, true);
    });

    it("rejects null", () => {
      assert.equal(validateClaimsStructure(null).valid, false);
    });

    it("rejects missing schema_version", () => {
      assert.equal(
        validateClaimsStructure({ meta: {}, claims: [] }).valid,
        false,
      );
    });

    it("rejects missing meta", () => {
      assert.equal(
        validateClaimsStructure({ schema_version: "1.0", claims: [] }).valid,
        false,
      );
    });

    it("rejects missing claims array", () => {
      assert.equal(
        validateClaimsStructure({ schema_version: "1.0", meta: {} }).valid,
        false,
      );
    });

    it("rejects claims missing id", () => {
      const data = {
        schema_version: "1.0",
        meta: {},
        claims: [{ type: "factual" }],
      };
      const result = validateClaimsStructure(data);
      assert.equal(result.valid, false);
      assert.ok(result.reason.includes("missing id"));
    });
  });

  describe("writeLocalClaims", () => {
    beforeEach(() => createTmpDir());
    afterEach(() => cleanupTmpDir());

    it("writes claims.json to sprint directory", () => {
      const result = writeLocalClaims(
        tmpDir,
        "test-sprint",
        SAMPLE_CLAIMS_JSON,
      );
      const expected = path.join(
        tmpDir,
        "sprints",
        "test-sprint",
        "claims.json",
      );
      assert.equal(result.written, expected);
      assert.ok(fs.existsSync(expected));

      const written = JSON.parse(fs.readFileSync(expected, "utf8"));
      assert.deepEqual(written, SAMPLE_CLAIMS_JSON);
    });

    it("creates sprint directory if it does not exist", () => {
      writeLocalClaims(tmpDir, "new-sprint", SAMPLE_CLAIMS_JSON);
      assert.ok(fs.existsSync(path.join(tmpDir, "sprints", "new-sprint")));
    });

    it("backs up existing file when backup option is true", () => {
      writeLocalClaims(tmpDir, "test-sprint", SAMPLE_CLAIMS_JSON);
      const result = writeLocalClaims(
        tmpDir,
        "test-sprint",
        SAMPLE_CLAIMS_JSON,
        {
          backup: true,
        },
      );
      assert.ok(result.backed_up);
      assert.ok(fs.existsSync(result.backed_up));
    });
  });

  describe("planPull", () => {
    it("extracts and validates from page body", () => {
      const body = buildClaimsPageBody(
        SAMPLE_CLAIMS,
        SAMPLE_CLAIMS_JSON,
        Date.now(),
      );
      const plan = planPull({
        wheatRoot: "/tmp/test",
        sprintSlug: "test-sprint",
        pageBody: body,
      });
      assert.equal(plan.sprintSlug, "test-sprint");
      assert.equal(plan.claimCount, 2);
      assert.deepEqual(plan.claimsData, SAMPLE_CLAIMS_JSON);
    });

    it("throws on missing JSON", () => {
      assert.throws(() => {
        planPull({
          wheatRoot: "/tmp/test",
          sprintSlug: "test",
          pageBody: "<p>No JSON here</p>",
        });
      }, /Could not extract JSON/);
    });

    it("throws on invalid claims structure", () => {
      const body = buildJsonCodeBlock({ not_a_sprint: true });
      assert.throws(() => {
        planPull({
          wheatRoot: "/tmp/test",
          sprintSlug: "test",
          pageBody: body,
        });
      }, /not a valid claims structure/);
    });
  });

  describe("executePull", () => {
    beforeEach(() => createTmpDir());
    afterEach(() => cleanupTmpDir());

    it("writes claims to local filesystem", () => {
      const result = executePull({
        wheatRoot: tmpDir,
        sprintSlug: "test-sprint",
        claimsData: SAMPLE_CLAIMS_JSON,
        backup: false,
      });
      assert.ok(fs.existsSync(result.written));
    });
  });

  describe("MCP tool call builders", () => {
    it("mcpGetPage builds correct descriptor", () => {
      const call = mcpGetPage({ pageId: "456" });
      assert.equal(call.tool, "mcp__claude_ai_Atlassian__getConfluencePage");
      assert.equal(call.params.pageId, "456");
    });

    it("mcpSearchWheatPages builds CQL with wheat-active label", () => {
      const call = mcpSearchWheatPages({ spaceKey: "RES", sprintSlug: "test" });
      assert.ok(call.params.cql.includes("wheat-active"));
      assert.ok(call.params.cql.includes("test"));
    });
  });
});

// ── Cross-platform path tests ───────────────────────────────────────────────

describe("cross-platform paths", () => {
  beforeEach(() => createTmpDir());
  afterEach(() => cleanupTmpDir());

  it("sync state uses path.join for filesystem operations", () => {
    saveSyncState(tmpDir, { test: true });
    const statePath = path.join(tmpDir, "sync-state.json");
    assert.ok(fs.existsSync(statePath));
  });

  it("writeLocalClaims creates nested dirs with path.join", () => {
    writeLocalClaims(tmpDir, "deep-sprint", SAMPLE_CLAIMS_JSON);
    const claimsPath = path.join(
      tmpDir,
      "sprints",
      "deep-sprint",
      "claims.json",
    );
    assert.ok(fs.existsSync(claimsPath));
  });

  it("planSync uses path.join for all filesystem access", () => {
    const sprintDir = path.join(tmpDir, "sprints", "path-test");
    fs.mkdirSync(sprintDir, { recursive: true });
    fs.writeFileSync(
      path.join(sprintDir, "compilation.json"),
      JSON.stringify(SAMPLE_COMPILATION),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sprintDir, "claims.json"),
      JSON.stringify(SAMPLE_CLAIMS_JSON),
      "utf8",
    );

    const plan = planSync({
      wheatRoot: tmpDir,
      sprintSlug: "path-test",
      spaceKey: "TEST",
    });
    assert.ok(plan.hash);
  });
});
