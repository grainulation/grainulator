/**
 * mcp-crash.test.js — Unit + subprocess tests for the shared MCP crash
 * helper (lib/mcp-crash.js).
 *
 * In-process tests use `register: "noop"` + mocked stderr/exit so we never
 * touch the real process handlers. Subprocess tests use a small fixture that
 * imports the helper, sets BARN_MCP_CRASH_TEST, and crashes.
 *
 * Zero dependencies — node:test only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  CRASH_EXIT_CODE,
  CRASH_RECURSIVE_EXIT_CODE,
  buildFatalPayload,
  installCrashHandlers,
} from "../lib/mcp-crash.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// A minimal Writable-like sink for asserting stderr output.
function makeSink() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    text: () => chunks.join(""),
    lines: () => chunks.join("").split("\n").filter(Boolean),
    chunks,
  };
}

function makeExitRecorder() {
  const calls = [];
  function exit(code) {
    calls.push(code);
  }
  return { exit, calls };
}

// ── buildFatalPayload ─────────────────────────────────────────────────────

describe("buildFatalPayload", () => {
  it("produces the documented shape for uncaughtException", () => {
    const p = buildFatalPayload({
      service: "wheat",
      version: "1.2.3",
      kind: "uncaughtException",
      err: new Error("boom"),
    });
    assert.equal(p.level, "fatal");
    assert.equal(p.source, "wheat-mcp");
    assert.equal(p.kind, "uncaughtException");
    assert.equal(p.name, "Error");
    assert.equal(p.message, "boom");
    assert.ok(typeof p.stack === "string" && p.stack.length > 0);
    assert.equal(p.version, "1.2.3");
    assert.equal(p.pid, process.pid);
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(p.time));
    assert.match(p.note, /process state undefined/);
  });

  it("produces a distinct note for unhandledRejection", () => {
    const p = buildFatalPayload({
      service: "mill",
      version: "2.0.0",
      kind: "unhandledRejection",
      err: new Error("nope"),
    });
    assert.equal(p.source, "mill-mcp");
    assert.match(p.note, /unhandled promise rejection/);
  });

  it("coerces non-Error reasons", () => {
    const p = buildFatalPayload({
      service: "silo",
      version: "1.0",
      kind: "unhandledRejection",
      err: "string reason",
    });
    assert.equal(p.message, "string reason");
    assert.equal(p.name, "Error");
  });

  it("defaults service to 'mcp' when missing", () => {
    const p = buildFatalPayload({
      kind: "uncaughtException",
      err: new Error("x"),
    });
    assert.equal(p.source, "mcp-mcp");
  });
});

// ── installCrashHandlers: in-process noop mode ────────────────────────────

describe("installCrashHandlers (noop mode)", () => {
  it("does not attach listeners to process when register='noop'", () => {
    const before = process.listenerCount("uncaughtException");
    const beforeRej = process.listenerCount("unhandledRejection");
    const h = installCrashHandlers({ register: "noop" });
    assert.equal(process.listenerCount("uncaughtException"), before);
    assert.equal(process.listenerCount("unhandledRejection"), beforeRej);
    assert.equal(typeof h.uninstall, "function");
    assert.equal(typeof h.listeners.uncaughtException, "function");
    assert.equal(typeof h.listeners.unhandledRejection, "function");
    // uninstall is a no-op when nothing was installed
    assert.doesNotThrow(() => h.uninstall());
  });

  it("uncaught handler writes JSON to stderr and exits with code 1", () => {
    const sink = makeSink();
    const { exit, calls } = makeExitRecorder();
    const h = installCrashHandlers({
      service: "wheat",
      version: "1.0.0",
      register: "noop",
      stderr: sink,
      exit,
      includeTestHook: false,
    });
    h.listeners.uncaughtException(new Error("sync-boom"));
    const lines = sink.lines();
    assert.equal(lines.length, 1);
    const payload = JSON.parse(lines[0]);
    assert.equal(payload.level, "fatal");
    assert.equal(payload.kind, "uncaughtException");
    assert.equal(payload.source, "wheat-mcp");
    assert.equal(payload.message, "sync-boom");
    assert.deepEqual(calls, [CRASH_EXIT_CODE]);
  });

  it("unhandled-rejection handler exits with code 1 and tags the kind", () => {
    const sink = makeSink();
    const { exit, calls } = makeExitRecorder();
    const h = installCrashHandlers({
      service: "mill",
      version: "2.0.0",
      register: "noop",
      stderr: sink,
      exit,
      includeTestHook: false,
    });
    h.listeners.unhandledRejection(new Error("promise-nope"));
    const payload = JSON.parse(sink.lines()[0]);
    assert.equal(payload.kind, "unhandledRejection");
    assert.equal(payload.source, "mill-mcp");
    assert.equal(payload.message, "promise-nope");
    assert.deepEqual(calls, [CRASH_EXIT_CODE]);
  });

  it("coerces a non-Error rejection reason", () => {
    const sink = makeSink();
    const { exit } = makeExitRecorder();
    const h = installCrashHandlers({
      service: "silo",
      register: "noop",
      stderr: sink,
      exit,
      includeTestHook: false,
    });
    h.listeners.unhandledRejection("bare string");
    const payload = JSON.parse(sink.lines()[0]);
    assert.equal(payload.message, "bare string");
  });

  it("recursive crash: stderr throwing falls back, exits with code 2", () => {
    // Simulate the real process.exit by throwing a sentinel so the handler
    // does not keep executing (as it would in production — process.exit is
    // terminal). Our mock records the code before throwing.
    class ExitCalled extends Error {
      constructor(code) {
        super(`exit(${code})`);
        this.code = code;
      }
    }
    const calls = [];
    const exit = (code) => {
      calls.push(code);
      throw new ExitCalled(code);
    };
    let writes = 0;
    const erroringStderr = {
      write() {
        writes += 1;
        throw new Error("EPIPE-ish");
      },
    };
    const h = installCrashHandlers({
      service: "wheat",
      register: "noop",
      stderr: erroringStderr,
      exit,
      includeTestHook: false,
    });
    // First call: primary write throws, fallback write throws -> exit(1).
    assert.throws(
      () => h.listeners.uncaughtException(new Error("first")),
      ExitCalled,
    );
    // Second call: crashHandlerRunning is true -> recursive write throws ->
    // exit(2).
    assert.throws(
      () => h.listeners.uncaughtException(new Error("second")),
      ExitCalled,
    );
    assert.ok(writes >= 2, "stderr.write should have been attempted");
    assert.deepEqual(calls, [CRASH_EXIT_CODE, CRASH_RECURSIVE_EXIT_CODE]);
  });

  it("runs onExit before process.exit and swallows onExit errors", () => {
    const sink = makeSink();
    const order = [];
    const exit = (code) => order.push(["exit", code]);
    const onExit = () => {
      order.push(["onExit"]);
      throw new Error("cleanup-failed"); // must be swallowed
    };
    const h = installCrashHandlers({
      service: "test-service",
      register: "noop",
      stderr: sink,
      exit,
      onExit,
      includeTestHook: false,
    });
    h.listeners.uncaughtException(new Error("pls"));
    // onExit must run before exit
    assert.deepEqual(order, [["onExit"], ["exit", CRASH_EXIT_CODE]]);
  });

  it("uninstall removes listeners that were installed", () => {
    const before = process.listenerCount("uncaughtException");
    const beforeRej = process.listenerCount("unhandledRejection");
    const h = installCrashHandlers({
      service: "wheat",
      register: "install",
      stderr: makeSink(),
      exit: () => {},
      includeTestHook: false,
    });
    assert.equal(process.listenerCount("uncaughtException"), before + 1);
    assert.equal(process.listenerCount("unhandledRejection"), beforeRej + 1);
    h.uninstall();
    assert.equal(process.listenerCount("uncaughtException"), before);
    assert.equal(process.listenerCount("unhandledRejection"), beforeRej);
  });

  it("constants are stable integers", () => {
    assert.equal(CRASH_EXIT_CODE, 1);
    assert.equal(CRASH_RECURSIVE_EXIT_CODE, 2);
  });
});

// ── Subprocess tests: real process, real crash, real exit ─────────────────

describe("installCrashHandlers (subprocess)", () => {
  // Write a tiny fixture that imports the helper and optionally crashes.
  const tmp = mkdtempSync(join(tmpdir(), "barn-mcp-crash-sub-"));
  const fixturePath = join(tmp, "fixture.mjs");
  const helperPath = join(__dirname, "..", "lib", "mcp-crash.js");
  writeFileSync(
    fixturePath,
    `
import { installCrashHandlers } from ${JSON.stringify(helperPath)};
installCrashHandlers({
  service: "wheat",
  version: "test-0.0.0",
});
// Keep event loop alive so the deferred crash has time to fire.
setTimeout(() => { process.stderr.write("sentinel-normal\\n"); process.exit(0); }, 400);
`,
  );

  it("uncaught path: exit 1, JSON on stderr tagged uncaughtException", () => {
    const r = spawnSync(process.execPath, [fixturePath], {
      env: { ...process.env, BARN_MCP_CRASH_TEST: "uncaught" },
      encoding: "utf8",
      timeout: 8000,
    });
    assert.equal(
      r.status,
      CRASH_EXIT_CODE,
      `expected exit 1, got ${r.status}; stderr=${r.stderr}`,
    );
    // Find a JSON line on stderr
    const jsonLine = r.stderr
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.startsWith("{") && s.includes('"level":"fatal"'));
    assert.ok(jsonLine, `no fatal JSON line in stderr: ${r.stderr}`);
    const payload = JSON.parse(jsonLine);
    assert.equal(payload.level, "fatal");
    assert.equal(payload.kind, "uncaughtException");
    assert.equal(payload.source, "wheat-mcp");
    assert.match(payload.message, /BARN_MCP_CRASH_TEST uncaught/);
  });

  it("unhandled path: exit 1, JSON on stderr tagged unhandledRejection", () => {
    const r = spawnSync(process.execPath, [fixturePath], {
      env: { ...process.env, BARN_MCP_CRASH_TEST: "unhandled" },
      encoding: "utf8",
      timeout: 8000,
    });
    assert.equal(
      r.status,
      CRASH_EXIT_CODE,
      `expected exit 1, got ${r.status}; stderr=${r.stderr}`,
    );
    const jsonLine = r.stderr
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.startsWith("{") && s.includes('"level":"fatal"'));
    assert.ok(jsonLine, `no fatal JSON line in stderr: ${r.stderr}`);
    const payload = JSON.parse(jsonLine);
    assert.equal(payload.kind, "unhandledRejection");
    assert.equal(payload.source, "wheat-mcp");
  });

  it("normal path: no crash env -> exits 0 with sentinel", () => {
    const r = spawnSync(process.execPath, [fixturePath], {
      env: { ...process.env, BARN_MCP_CRASH_TEST: "" },
      encoding: "utf8",
      timeout: 8000,
    });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}`);
    assert.match(r.stderr, /sentinel-normal/);
  });

  // Cleanup the fixture tmp directory after this describe finishes.
  it("cleanup", () => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
