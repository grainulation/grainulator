/**
 * server.test.js — HTTP endpoint tests for silo serve
 *
 * Spawns the ESM server on a random port and validates all API routes.
 * Runs with plain Node.js (node:test + node:assert). Zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PATH = path.join(__dirname, "..", "lib", "server.js");

let serverProcess;
let port;

/** Find a free port by briefly binding to 0. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port: p } = srv.address();
      srv.close(() => resolve(p));
    });
    srv.on("error", reject);
  });
}

/** Simple HTTP GET that returns { status, headers, body }. */
function get(urlPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${port}${urlPath}`,
      { timeout: opts.timeout || 5000 },
      (res) => {
        // For SSE we only need headers and the first chunk
        if (opts.sse) {
          const onData = (chunk) => {
            res.destroy();
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: chunk.toString(),
            });
          };
          res.once("data", onData);
          // Safety timeout in case no data arrives
          setTimeout(() => {
            res.removeListener("data", onData);
            res.destroy();
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: "",
            });
          }, 3000);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timeout"));
    });
  });
}

/** Parse JSON body, throwing a clear error on failure. */
function json(response) {
  try {
    return JSON.parse(response.body);
  } catch (e) {
    throw new Error(
      `Failed to parse JSON (status ${response.status}): ${response.body.slice(0, 200)}`,
    );
  }
}

/** Wait for the server to accept connections. */
function waitForServer(maxMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() - start > maxMs) {
        return reject(new Error(`Server did not start within ${maxMs}ms`));
      }
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(attempt, 150));
      req.end();
    }
    attempt();
  });
}

describe("silo server endpoints", () => {
  before(async () => {
    port = await findFreePort();
    serverProcess = spawn("node", [SERVER_PATH, "--port", String(port)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    // Collect stderr for debugging if something goes wrong
    let stderr = "";
    serverProcess.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    serverProcess.on("exit", (code) => {
      if (code && code !== 0 && code !== null) {
        process.stderr.write(
          `silo server exited with code ${code}\n${stderr}\n`,
        );
      }
    });
    await waitForServer();
  });

  after(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
    }
  });

  // ── GET /health ──

  it("GET /health returns 200 with expected fields", async () => {
    const res = await get("/health");
    assert.equal(res.status, 200);
    const data = json(res);
    assert.equal(data.status, "ok");
    assert.equal(typeof data.uptime, "number");
    assert.ok(data.uptime >= 0);
    assert.equal(typeof data.packs, "number");
  });

  // ── GET /api/packs ──

  it("GET /api/packs returns 200 with array of packs", async () => {
    const res = await get("/api/packs");
    assert.equal(res.status, 200);
    const data = json(res);
    assert.ok(Array.isArray(data.packs), "packs should be an array");
    assert.ok(data.packs.length > 0, "should have at least one built-in pack");
    // Each pack should have id and name
    for (const pack of data.packs) {
      assert.ok(pack.id, "pack should have an id");
      assert.ok(pack.name, "pack should have a name");
    }
  });

  // ── GET /api/packs/:name (existing) ──

  it("GET /api/packs/compliance returns 200 with pack details", async () => {
    const res = await get("/api/packs/compliance");
    assert.equal(res.status, 200);
    const data = json(res);
    assert.equal(data.id, "compliance");
    assert.ok(data.name, "pack should have a name");
    assert.ok(Array.isArray(data.claims), "claims should be an array");
    assert.ok(data.claims.length > 0, "compliance pack should have claims");
    assert.equal(typeof data.claimCount, "number");
    assert.equal(data.claimCount, data.claims.length);
  });

  // ── GET /api/packs/:name (nonexistent) ──

  it("GET /api/packs/nonexistent returns 404", async () => {
    const res = await get("/api/packs/nonexistent");
    assert.equal(res.status, 404);
    const data = json(res);
    assert.ok(data.error, "should have an error message");
    assert.ok(data.error.includes("not found"));
  });

  // ── GET /api/search ──

  it("GET /api/search?q=compliance returns 200 with results", async () => {
    const res = await get("/api/search?q=compliance");
    assert.equal(res.status, 200);
    const data = json(res);
    assert.equal(data.query, "compliance");
    assert.ok(Array.isArray(data.results), "results should be an array");
    // compliance is a built-in pack so there should be matches
    assert.ok(data.results.length > 0, 'should find results for "compliance"');
  });

  it("GET /api/search without q returns empty results", async () => {
    const res = await get("/api/search");
    assert.equal(res.status, 200);
    const data = json(res);
    assert.deepEqual(data.results, []);
  });

  // ── GET /events (SSE) ──

  it("GET /events returns SSE stream", async () => {
    const res = await get("/events", { sse: true });
    assert.equal(res.status, 200);
    assert.ok(
      res.headers["content-type"].includes("text/event-stream"),
      `expected text/event-stream, got ${res.headers["content-type"]}`,
    );
    // The server sends an initial state event
    assert.ok(
      res.body.startsWith("data: "),
      "should receive an SSE data frame",
    );
    // Parse the SSE payload
    const payload = JSON.parse(res.body.replace(/^data: /, "").trim());
    assert.equal(payload.type, "state");
    assert.ok(payload.data, "state event should have data");
  });

  // ── GET /api/docs ──

  it("GET /api/docs returns 200 with HTML", async () => {
    const res = await get("/api/docs");
    assert.equal(res.status, 200);
    assert.ok(
      res.headers["content-type"].includes("text/html"),
      `expected text/html, got ${res.headers["content-type"]}`,
    );
    assert.ok(
      res.body.includes("silo API"),
      "docs page should mention silo API",
    );
    assert.ok(
      res.body.includes("/health"),
      "docs page should list /health endpoint",
    );
  });
});
