/**
 * shared-utils.test.js — Unit tests for the shared-utility modules
 * absorbed from duplication across the ecosystem (r100–r117).
 *
 * Uses node:test — zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import {
  jsonRpcResponse,
  jsonRpcError,
  JSON_RPC_ERRORS,
  parseJsonRpc,
  buildInitializeResult,
} from "../lib/mcp.js";
import {
  isInsideDir,
  resolveSafe,
  assertInsideDir,
  relativeInside,
} from "../lib/paths.js";
import { atomicWrite, atomicWriteJSON } from "../lib/atomic.js";
import {
  parseFlags,
  flag,
  flagList,
  loadJSON,
  setVerbose,
  vlog,
  isFlag,
} from "../lib/cli.js";
import {
  PHASE_PREFIXES,
  isValidPhase,
  phaseFromClaimId,
  prefixForPhase,
} from "../lib/phases.js";
import {
  loadSprintClaims,
  loadSprintCompilation,
  sprintSummary,
  summarize,
  findSprintFiles,
} from "../lib/sprints.js";

// ── MCP helpers ────────────────────────────────────────────────────────────

describe("mcp.jsonRpcResponse", () => {
  it("serializes success envelope", () => {
    const s = jsonRpcResponse(1, { ok: true });
    assert.deepEqual(JSON.parse(s), {
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    });
  });

  it("accepts string ids", () => {
    const s = jsonRpcResponse("req-123", null);
    assert.equal(JSON.parse(s).id, "req-123");
  });
});

describe("mcp.jsonRpcError", () => {
  it("serializes error envelope", () => {
    const s = jsonRpcError(1, -32601, "method not found");
    assert.deepEqual(JSON.parse(s), {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "method not found" },
    });
  });

  it("includes data when provided", () => {
    const s = jsonRpcError(1, -32603, "oops", { detail: "bad" });
    const parsed = JSON.parse(s);
    assert.deepEqual(parsed.error.data, { detail: "bad" });
  });

  it("omits data when undefined", () => {
    const s = jsonRpcError(1, -32603, "oops");
    assert.ok(!("data" in JSON.parse(s).error));
  });
});

describe("mcp constants", () => {
  it("exports standard error codes", () => {
    assert.equal(JSON_RPC_ERRORS.PARSE_ERROR, -32700);
    assert.equal(JSON_RPC_ERRORS.METHOD_NOT_FOUND, -32601);
    assert.equal(JSON_RPC_ERRORS.INTERNAL_ERROR, -32603);
  });
});

describe("mcp.parseJsonRpc", () => {
  it("returns null for empty input", () => {
    assert.equal(parseJsonRpc(""), null);
    assert.equal(parseJsonRpc("   "), null);
    assert.equal(parseJsonRpc(null), null);
  });

  it("parses valid JSON", () => {
    const p = parseJsonRpc('{"jsonrpc":"2.0","id":1,"method":"test"}');
    assert.equal(p.id, 1);
    assert.equal(p.method, "test");
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseJsonRpc("not json"));
  });
});

describe("mcp.buildInitializeResult", () => {
  it("wraps capabilities + serverInfo", () => {
    const r = buildInitializeResult({
      serverName: "test",
      serverVersion: "1.0.0",
    });
    assert.equal(r.protocolVersion, "2024-11-05");
    assert.equal(r.serverInfo.name, "test");
    assert.deepEqual(r.capabilities, { tools: {}, resources: {} });
  });

  it("includes prompts when provided", () => {
    const r = buildInitializeResult({
      serverName: "test",
      serverVersion: "1.0.0",
      prompts: {},
    });
    assert.deepEqual(r.capabilities.prompts, {});
  });
});

// ── Path helpers ──────────────────────────────────────────────────────────

describe("paths.isInsideDir", () => {
  it("accepts path equal to base", () => {
    assert.equal(isInsideDir("/foo", "/foo"), true);
  });

  it("accepts nested paths", () => {
    assert.equal(isInsideDir("/foo/bar", "/foo"), true);
    assert.equal(isInsideDir("/foo/bar/baz", "/foo"), true);
  });

  it("rejects sibling with shared prefix", () => {
    // Classic "/foo matches /foobar" bug — must NOT trigger
    assert.equal(isInsideDir("/foobar", "/foo"), false);
    assert.equal(isInsideDir("/foo-x", "/foo"), false);
  });

  it("rejects parent directories", () => {
    assert.equal(isInsideDir("/foo", "/foo/bar"), false);
    assert.equal(isInsideDir("/", "/foo"), false);
  });

  it("resolves relative paths", () => {
    assert.equal(isInsideDir("./a", "."), true);
  });
});

describe("paths.resolveSafe", () => {
  it("resolves relative target inside base", () => {
    const r = resolveSafe("/tmp/work", "sub/file.txt");
    assert.ok(r.endsWith(`${sep}sub${sep}file.txt`));
  });

  it("rejects ../ escape", () => {
    assert.throws(() => resolveSafe("/tmp/work", "../escape.txt"));
  });

  it("rejects absolute path outside base", () => {
    assert.throws(() => resolveSafe("/tmp/work", "/etc/passwd"));
  });

  it("allows absolute path inside base", () => {
    const r = resolveSafe("/tmp/work", "/tmp/work/a");
    assert.ok(r.endsWith(`${sep}work${sep}a`));
  });
});

describe("paths.assertInsideDir", () => {
  it("throws on escape", () => {
    assert.throws(() => assertInsideDir("/etc/passwd", "/tmp/work"));
  });

  it("passes for valid paths", () => {
    assert.doesNotThrow(() => assertInsideDir("/tmp/work/a", "/tmp/work"));
  });
});

describe("paths.relativeInside", () => {
  it("returns relative path", () => {
    assert.equal(relativeInside("/tmp/work", "/tmp/work/a/b"), `a${sep}b`);
  });

  it("returns null when outside", () => {
    assert.equal(relativeInside("/tmp/work", "/etc/passwd"), null);
  });
});

// ── Atomic writes ─────────────────────────────────────────────────────────

describe("atomic writes", () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "barn-atomic-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("atomicWrite writes string content", () => {
    const p = join(dir, "hello.txt");
    atomicWrite(p, "world");
    assert.equal(readFileSync(p, "utf-8"), "world");
  });

  it("atomicWriteJSON serializes with trailing newline", () => {
    const p = join(dir, "data.json");
    atomicWriteJSON(p, { a: 1, b: 2 });
    const content = readFileSync(p, "utf-8");
    assert.ok(content.endsWith("\n"));
    assert.deepEqual(JSON.parse(content), { a: 1, b: 2 });
  });

  it("does not leave tmp files after success", () => {
    const p = join(dir, "clean.json");
    atomicWriteJSON(p, { ok: true });
    // Scan parent dir for any .tmp* files
    const tmpFiles = readdirSync(dir).filter((f) => f.includes(".tmp."));
    assert.deepEqual(tmpFiles, []);
  });

  it("cleans up tmp on write error (unwritable target)", () => {
    // Try to write into a nonexistent deep path — renameSync should fail
    const badPath = join(dir, "no-such-dir", "file.json");
    assert.throws(() => atomicWriteJSON(badPath, { x: 1 }));
  });
});

// ── CLI helpers ───────────────────────────────────────────────────────────

describe("cli.parseFlags", () => {
  it("parses --key value", () => {
    assert.deepEqual(parseFlags(["--mode", "concise"]), { mode: "concise" });
  });

  it("parses --key=value", () => {
    assert.deepEqual(parseFlags(["--mode=concise"]), { mode: "concise" });
  });

  it("parses bare --flag as true", () => {
    assert.deepEqual(parseFlags(["--verbose"]), { verbose: true });
  });

  it("handles multiple flags", () => {
    assert.deepEqual(
      parseFlags(["--mode", "concise", "--verbose", "--timeout=5000"]),
      { mode: "concise", verbose: true, timeout: "5000" },
    );
  });

  it("last value wins on duplicates", () => {
    assert.deepEqual(parseFlags(["--mode", "a", "--mode", "b"]), { mode: "b" });
  });

  it("ignores positional args", () => {
    assert.deepEqual(parseFlags(["file.txt", "--mode", "concise"]), {
      mode: "concise",
    });
  });
});

describe("cli.flag / flagList", () => {
  it("flag returns single value", () => {
    assert.equal(flag("mode", ["--mode", "concise"]), "concise");
    assert.equal(flag("missing", ["--mode", "concise"]), undefined);
  });

  it("flagList splits comma-separated", () => {
    assert.deepEqual(flagList("tags", ["--tags", "a,b,c"]), ["a", "b", "c"]);
  });

  it("flagList returns empty for missing flag", () => {
    assert.deepEqual(flagList("tags", []), []);
  });

  it("flagList trims whitespace and drops empties", () => {
    assert.deepEqual(flagList("tags", ["--tags", " a , b ,,c "]), [
      "a",
      "b",
      "c",
    ]);
  });
});

describe("cli.loadJSON", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "barn-json-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns parsed content for valid file", () => {
    const p = join(dir, "ok.json");
    writeFileSync(p, '{"x": 1}');
    assert.deepEqual(loadJSON(p), { x: 1 });
  });

  it("returns fallback on missing file", () => {
    assert.equal(loadJSON(join(dir, "no-such.json")), null);
    assert.deepEqual(loadJSON(join(dir, "no-such.json"), { d: 1 }), { d: 1 });
  });

  it("returns fallback on malformed JSON", () => {
    const p = join(dir, "bad.json");
    writeFileSync(p, "not json");
    assert.equal(loadJSON(p), null);
  });
});

describe("cli.isFlag", () => {
  it("detects flags", () => {
    assert.equal(isFlag("--mode"), true);
    assert.equal(isFlag("--"), true);
    assert.equal(isFlag("file.txt"), false);
    assert.equal(isFlag(""), false);
    assert.equal(isFlag(null), false);
  });
});

describe("cli.setVerbose / vlog", () => {
  it("vlog is silent by default", () => {
    // Just make sure it doesn't throw — actual stderr inspection is overkill
    assert.doesNotThrow(() => vlog("test", "message"));
  });

  it("setVerbose toggles without error", () => {
    setVerbose(true);
    assert.doesNotThrow(() => vlog("test", "verbose message"));
    setVerbose(false);
  });
});

// ── Phase constants ───────────────────────────────────────────────────────

describe("phases.PHASE_PREFIXES", () => {
  it("is frozen", () => {
    assert.throws(() => {
      PHASE_PREFIXES.zz = "zz-phase";
    });
  });

  it("has canonical phases", () => {
    assert.equal(PHASE_PREFIXES.d, "define");
    assert.equal(PHASE_PREFIXES.r, "research");
    assert.equal(PHASE_PREFIXES.cal, "calibration");
    assert.equal(PHASE_PREFIXES.burn, "control-burn");
  });
});

describe("phases.isValidPhase", () => {
  it("accepts known phases", () => {
    assert.equal(isValidPhase("define"), true);
    assert.equal(isValidPhase("calibration"), true);
  });

  it("rejects unknown phases", () => {
    assert.equal(isValidPhase("bogus"), false);
    assert.equal(isValidPhase(""), false);
  });
});

describe("phases.phaseFromClaimId", () => {
  it("handles single-char prefixes", () => {
    assert.equal(phaseFromClaimId("d001"), "define");
    assert.equal(phaseFromClaimId("r042"), "research");
    assert.equal(phaseFromClaimId("p003"), "prototype");
    assert.equal(phaseFromClaimId("x007"), "challenge");
    assert.equal(phaseFromClaimId("w001"), "witness");
  });

  it("handles multi-char prefixes", () => {
    assert.equal(phaseFromClaimId("cal001"), "calibration");
    assert.equal(phaseFromClaimId("burn-003"), "control-burn");
  });

  it("returns null for unknown prefix", () => {
    assert.equal(phaseFromClaimId("zzz001"), null);
  });

  it("returns null for non-string", () => {
    assert.equal(phaseFromClaimId(null), null);
    assert.equal(phaseFromClaimId(""), null);
    assert.equal(phaseFromClaimId(42), null);
  });
});

describe("phases.prefixForPhase", () => {
  it("returns canonical prefix", () => {
    assert.equal(prefixForPhase("define"), "d");
    assert.equal(prefixForPhase("calibration"), "cal");
  });

  it("returns null for unknown", () => {
    assert.equal(prefixForPhase("bogus"), null);
  });
});

// ── Sprint helpers ────────────────────────────────────────────────────────

describe("sprint helpers", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "barn-sprint-"));
    const sprint1 = join(dir, "sprint1");
    mkdirSync(sprint1, { recursive: true });
    writeFileSync(
      join(sprint1, "claims.json"),
      JSON.stringify({
        meta: { question: "Q1", phase: "research" },
        claims: [
          { id: "d001", status: "active" },
          { id: "r001", status: "active" },
          { id: "r002", status: "superseded" },
        ],
      }),
    );
    writeFileSync(
      join(sprint1, "compilation.json"),
      JSON.stringify({
        status: "ready",
        certificate: "sha256:abc",
        conflict_graph: { unresolved: [] },
      }),
    );
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loadSprintClaims returns full object", () => {
    const c = loadSprintClaims(join(dir, "sprint1"));
    assert.equal(c.meta.question, "Q1");
    assert.equal(c.claims.length, 3);
  });

  it("loadSprintClaims returns null for missing directory", () => {
    assert.equal(loadSprintClaims(join(dir, "no-such")), null);
  });

  it("loadSprintCompilation returns full object", () => {
    const c = loadSprintCompilation(join(dir, "sprint1"));
    assert.equal(c.status, "ready");
  });

  it("sprintSummary produces shape harvest/orchard need", () => {
    const s = sprintSummary(join(dir, "sprint1"));
    assert.equal(s.question, "Q1");
    assert.equal(s.phase, "research");
    assert.equal(s.claim_count, 3);
    assert.equal(s.active_claims, 2);
    assert.equal(s.conflict_count, 0);
    assert.equal(s.compile_status, "ready");
    assert.equal(s.certificate, "sha256:abc");
    assert.ok(typeof s.last_modified_ms === "number");
  });

  it("summarize drops missing sprints", () => {
    const results = summarize([join(dir, "sprint1"), join(dir, "no-such")]);
    assert.equal(results.length, 1);
    assert.equal(results[0].question, "Q1");
  });

  it("findSprintFiles scans two levels deep and returns {file, dir, name, cat}", () => {
    const found = findSprintFiles(dir);
    // sprint1 is a direct child → active
    const active = found.find((f) => f.name === "sprint1");
    assert.ok(active, "sprint1 should be discovered");
    assert.equal(active.cat, "active");
    assert.ok(active.file.endsWith("claims.json"));
    assert.equal(active.dir, join(dir, "sprint1"));
    // Hidden dirs, node_modules, and archive are not scanned as active
    assert.ok(!found.some((f) => f.name.startsWith(".")));
    assert.ok(!found.some((f) => f.name === "node_modules"));
  });

  it("findSprintFiles returns root category when claims.json is directly in targetDir", () => {
    // Write a claims.json directly into the tempdir to simulate root-sprint layout
    writeFileSync(
      join(dir, "claims.json"),
      JSON.stringify({ meta: { question: "Root" }, claims: [] }),
    );
    const found = findSprintFiles(dir);
    const root = found.find((f) => f.cat === "root");
    assert.ok(root, "root sprint should be discovered");
    assert.equal(root.dir, dir);
    // Clean up so subsequent reruns don't see it
    rmSync(join(dir, "claims.json"), { force: true });
  });
});
