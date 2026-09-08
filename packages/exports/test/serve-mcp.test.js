/**
 * Integration test: mill MCP server — tool-call handlers
 *
 * Spawns `node bin/mill.js serve-mcp` as a child process over stdio,
 * performs JSON-RPC 2.0 initialize, and issues tools/call for each of
 * mill's MCP tools (mill/convert, mill/formats, mill/preview). Asserts
 * on response shape, content payload, and at least one error path per
 * tool. Zero dependencies — uses node:test + node:assert.
 *
 * Modeled on wheat/test/mcp.test.js.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MILL_BIN = path.resolve(__dirname, "..", "bin", "mill.js");

function sendJsonRpc(child, obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

function spawnAndInitialize(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MILL_BIN, "serve-mcp"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error("Timed out waiting for initialize response"));
      }
    }, 5_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split("\n").filter((l) => l.trim());
      if (lines.length > 0 && !resolved) {
        resolved = true;
        clearTimeout(timer);
        try {
          const response = JSON.parse(lines[0]);
          resolve({ response, child });
        } catch (err) {
          child.kill();
          reject(new Error(`Failed to parse initialize: ${err.message}`));
        }
      }
    });

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
      },
    });
  });
}

function waitForResponse(child, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for response")),
      timeout,
    );

    function onData(chunk) {
      buf += chunk.toString();
      // Only resolve on a COMPLETE newline-terminated line. Partial
      // buffer would JSON.parse-fail for any response > 1 stdout chunk.
      const newlineIdx = buf.indexOf("\n");
      if (newlineIdx === -1) return;
      const line = buf.slice(0, newlineIdx).trim();
      if (!line) {
        buf = buf.slice(newlineIdx + 1);
        return;
      }
      clearTimeout(timer);
      child.stdout.removeListener("data", onData);
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(new Error(`Parse error: ${err.message}\nRaw: ${line}`));
      }
    }

    child.stdout.on("data", onData);
  });
}

function cleanup(child) {
  try {
    child.kill();
  } catch {
    /* already dead */
  }
}

async function callTool(child, id, name, args) {
  const responsePromise = waitForResponse(child);
  sendJsonRpc(child, {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const response = await responsePromise;
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, id);
  assert.ok(response.result, "response should have result");
  assert.ok(
    Array.isArray(response.result.content),
    "result.content should be an array",
  );
  const textBlock = response.result.content[0];
  assert.equal(textBlock.type, "text");
  assert.ok(
    typeof textBlock.text === "string" && textBlock.text.length > 0,
    "content[0].text should be a non-empty string",
  );
  const payload = JSON.parse(textBlock.text);
  return { response, payload };
}

/** Create a workspace with a minimal claims.json that any format can consume. */
function makeWorkspace(prefix = "mill-mcp-test-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const claims = {
    meta: {
      question: "MCP handler test sprint",
      audience: ["ci"],
      phase: "research",
    },
    claims: [
      {
        id: "r001",
        type: "factual",
        topic: "test-topic",
        content: "A sample claim for mill MCP tests.",
        evidence: "stated",
        status: "active",
        tags: ["fixture"],
      },
      {
        id: "r002",
        type: "recommendation",
        topic: "test-topic",
        content: "Another claim to exercise conversion.",
        evidence: "documented",
        status: "active",
        tags: ["fixture"],
      },
    ],
  };
  fs.writeFileSync(
    path.join(dir, "claims.json"),
    JSON.stringify(claims, null, 2) + "\n",
  );
  // compilation.json is the preferred source — write a compiled shape too
  const compilation = {
    status: "clean",
    sprint_meta: claims.meta,
    resolved_claims: claims.claims,
    coverage: { "test-topic": { count: 2 } },
  };
  fs.writeFileSync(
    path.join(dir, "compilation.json"),
    JSON.stringify(compilation, null, 2) + "\n",
  );
  return dir;
}

describe("mill MCP server — protocol basics", () => {
  let dir;
  before(() => {
    dir = makeWorkspace();
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("responds to initialize with serverInfo", async () => {
    const { response, child } = await spawnAndInitialize(dir);
    try {
      assert.equal(response.jsonrpc, "2.0");
      assert.equal(response.id, 1);
      assert.equal(response.result.serverInfo.name, "mill");
      assert.ok(response.result.protocolVersion);
    } finally {
      cleanup(child);
    }
  });

  it("tools/list returns mill/convert, mill/formats, mill/preview", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const responsePromise = waitForResponse(child);
      sendJsonRpc(child, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });
      const response = await responsePromise;
      const names = response.result.tools.map((t) => t.name);
      assert.ok(names.includes("mill/convert"));
      assert.ok(names.includes("mill/formats"));
      assert.ok(names.includes("mill/preview"));
    } finally {
      cleanup(child);
    }
  });

  it("no stdout pollution before first JSON-RPC response", async () => {
    const child = spawn(process.execPath, [MILL_BIN, "serve-mcp"], {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      let stdout = "";
      const firstChunk = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 5_000);
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
          if (stdout.length > 0) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      sendJsonRpc(child, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      });
      await firstChunk;
      const trimmed = stdout.trimStart();
      assert.ok(
        trimmed.startsWith("{"),
        `stdout should start with JSON object, got: ${trimmed.slice(0, 100)}`,
      );
    } finally {
      cleanup(child);
    }
  });
});

describe("mill MCP tool handlers", () => {
  let dir;
  before(() => {
    dir = makeWorkspace();
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ── mill/formats ─────────────────────────────────────────────────────────
  it("mill/formats — returns non-empty format catalog", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const { payload } = await callTool(child, 10, "mill/formats", {});
      assert.equal(payload.status, "ok");
      assert.ok(Array.isArray(payload.formats));
      assert.ok(payload.formats.length > 0, "should have at least one format");
      assert.ok(
        payload.formats.every(
          (f) => typeof f.id === "string" && typeof f.mimeType === "string",
        ),
        "every format should have id and mimeType",
      );
    } finally {
      cleanup(child);
    }
  });

  // ── mill/convert — happy path ────────────────────────────────────────────
  it("mill/convert — converts to a known format inline", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      // Pick a format that is guaranteed to exist; discover via formats first
      const { payload: formatsPayload } = await callTool(
        child,
        20,
        "mill/formats",
        {},
      );
      const candidate =
        formatsPayload.formats.find((f) => f.id === "markdown") ||
        formatsPayload.formats[0];
      const { payload } = await callTool(child, 21, "mill/convert", {
        format: candidate.id,
      });
      assert.equal(payload.status, "ok");
      assert.equal(payload.format, candidate.id);
      assert.ok(
        typeof payload.output === "string" && payload.output.length > 0,
        "inline output should be a non-empty string",
      );
      assert.ok(typeof payload.bytes === "number");
    } finally {
      cleanup(child);
    }
  });

  it("mill/convert — writes to file when output path given", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const { payload: formatsPayload } = await callTool(
        child,
        22,
        "mill/formats",
        {},
      );
      const candidate =
        formatsPayload.formats.find((f) => f.id === "markdown") ||
        formatsPayload.formats[0];
      const outRel = "artifacts/out.txt";
      const { payload } = await callTool(child, 23, "mill/convert", {
        format: candidate.id,
        output: outRel,
      });
      assert.equal(payload.status, "ok");
      const outAbs = path.join(dir, outRel);
      assert.ok(fs.existsSync(outAbs), "output file should exist");
      assert.ok(fs.statSync(outAbs).size > 0, "output should be non-empty");
    } finally {
      cleanup(child);
    }
  });

  // ── mill/convert — error paths ───────────────────────────────────────────
  it("mill/convert — errors when format missing", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const { response, payload } = await callTool(
        child,
        30,
        "mill/convert",
        {},
      );
      assert.equal(payload.status, "error");
      assert.ok(/format/i.test(payload.message));
      assert.ok(response.result.isError);
    } finally {
      cleanup(child);
    }
  });

  it("mill/convert — errors on unknown format", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const { payload } = await callTool(child, 31, "mill/convert", {
        format: "definitely-not-a-real-format-xyz",
      });
      assert.equal(payload.status, "error");
      assert.ok(/unknown format/i.test(payload.message));
    } finally {
      cleanup(child);
    }
  });

  it("mill/convert — rejects path traversal in source", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const { payload } = await callTool(child, 32, "mill/convert", {
        format: "markdown",
        source: "../../../etc/passwd",
      });
      assert.equal(payload.status, "error");
      assert.ok(/escapes workspace/i.test(payload.message));
    } finally {
      cleanup(child);
    }
  });

  // ── mill/preview ─────────────────────────────────────────────────────────
  it("mill/preview — returns first N lines without writing", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const { payload: formatsPayload } = await callTool(
        child,
        40,
        "mill/formats",
        {},
      );
      const candidate =
        formatsPayload.formats.find((f) => f.id === "markdown") ||
        formatsPayload.formats[0];
      const { payload } = await callTool(child, 41, "mill/preview", {
        format: candidate.id,
        lines: 5,
      });
      assert.equal(payload.status, "ok");
      assert.ok(typeof payload.preview === "string");
      assert.ok(payload.showing <= 5);
      assert.ok(typeof payload.totalLines === "number");
    } finally {
      cleanup(child);
    }
  });

  it("mill/preview — errors when format missing", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const { payload } = await callTool(child, 42, "mill/preview", {});
      assert.equal(payload.status, "error");
      assert.ok(/format/i.test(payload.message));
    } finally {
      cleanup(child);
    }
  });

  it("unknown tool — returns JSON-RPC method-not-found error", async () => {
    const { child } = await spawnAndInitialize(dir);
    try {
      const responsePromise = waitForResponse(child);
      sendJsonRpc(child, {
        jsonrpc: "2.0",
        id: 50,
        method: "tools/call",
        params: { name: "mill/does-not-exist", arguments: {} },
      });
      const response = await responsePromise;
      assert.ok(response.error, "should return JSON-RPC error");
      assert.equal(response.error.code, -32601);
    } finally {
      cleanup(child);
    }
  });
});
