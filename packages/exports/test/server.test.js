import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_SCRIPT = path.join(__dirname, "..", "lib", "server.js");

// ── Fixture data ────────────────────────────────────────────────────────────

function makeFixtureCompilation() {
  return {
    meta: { question: "Test sprint question", audience: "tests" },
    claims: [
      {
        id: "r001",
        type: "factual",
        text: "Node.js has built-in HTTP module",
        confidence: 0.95,
        evidence: { tier: "documented", source: "nodejs.org" },
        status: "active",
        created: "2026-01-15",
        tags: ["node", "http"],
      },
      {
        id: "r002",
        type: "recommendation",
        text: "Use streams for large file processing",
        confidence: 0.8,
        evidence: { tier: "tested", source: "prototype" },
        status: "active",
        created: "2026-01-16",
        tags: ["performance"],
      },
    ],
    conflicts: [],
    certificate: {
      compiled_at: "2026-01-17T00:00:00Z",
      claim_count: 2,
      status: "clean",
    },
  };
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

function request(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path, ...opts },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("request timeout"));
    });
  });
}

// ── Server lifecycle ────────────────────────────────────────────────────────

function startServer(sourceDir, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [SERVER_SCRIPT, "--port", String(port), "--source", sourceDir],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        child.kill();
        reject(new Error("Server did not start within 8 seconds"));
      }
    }, 8000);

    child.stdout.on("data", (data) => {
      const text = data.toString();
      if (!started && text.includes("serving on")) {
        started = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });

    child.stderr.on("data", (data) => {
      // Surface stderr for debugging but don't fail on it
      if (!started) {
        const text = data.toString();
        if (text.includes("FATAL") || text.includes("EADDRINUSE")) {
          clearTimeout(timeout);
          reject(new Error(`Server startup failed: ${text}`));
        }
      }
    });

    child.on("exit", (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Server exited prematurely with code ${code}`));
      }
    });
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("mill server endpoints", () => {
  let tmpDir;
  let serverProcess;
  let port;

  before(async () => {
    // Create temp source dir with fixture data
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mill-server-test-"));

    fs.writeFileSync(
      path.join(tmpDir, "compilation.json"),
      JSON.stringify(makeFixtureCompilation(), null, 2),
    );
    fs.writeFileSync(
      path.join(tmpDir, "claims.json"),
      JSON.stringify({ claims: makeFixtureCompilation().claims }, null, 2),
    );

    port = await findFreePort();
    serverProcess = await startServer(tmpDir, port);
  });

  after(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  // ── GET /health ──

  it("GET /health returns 200 with expected fields", async () => {
    const res = await request(port, "/health");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("application/json"));

    const body = JSON.parse(res.body);
    assert.equal(body.status, "ok");
    assert.equal(typeof body.uptime, "number");
    assert.ok(body.uptime >= 0);
    assert.equal(typeof body.formats, "number");
    assert.ok(body.formats > 0);
  });

  // ── GET /api/state ──

  it("GET /api/state returns 200 with formats array and claimCount", async () => {
    const res = await request(port, "/api/state");
    assert.equal(res.status, 200);

    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.formats), "formats should be an array");
    assert.ok(body.formats.length > 0, "formats should not be empty");
    assert.equal(typeof body.claimCount, "number");
    assert.equal(body.claimCount, 2);
    assert.equal(body.hasCompilation, true);
  });

  it("GET /api/state format objects have name and extension", async () => {
    const res = await request(port, "/api/state");
    const body = JSON.parse(res.body);
    const fmt = body.formats[0];
    assert.ok(fmt.name, "format should have name");
    assert.ok(fmt.extension, "format should have extension");
    assert.ok(fmt.mimeType, "format should have mimeType");
  });

  // ── GET /api/formats ──

  it("GET /api/formats returns 200 with array of format objects", async () => {
    const res = await request(port, "/api/formats");
    assert.equal(res.status, 200);

    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.formats), "body.formats should be an array");
    assert.ok(body.formats.length > 0);

    const csv = body.formats.find((f) => f.name === "csv");
    assert.ok(csv, "csv format should be listed");
    assert.equal(csv.extension, ".csv");
    assert.ok(csv.mimeType.includes("text/csv"));
    assert.ok(csv.description);
    assert.equal(csv.schema_version, "1.0.0");
  });

  // ── GET /api/preview?format=csv ──

  it("GET /api/preview?format=csv returns 200 with preview content", async () => {
    const res = await request(port, "/api/preview?format=csv");
    assert.equal(res.status, 200);

    const body = JSON.parse(res.body);
    assert.equal(body.format, "csv");
    assert.equal(typeof body.output, "string");
    assert.ok(body.output.length > 0, "output should not be empty");
    assert.ok(body.output.includes("r001"), "output should contain claim id");
    assert.equal(typeof body.size, "number");
    assert.ok(body.size > 0);
  });

  // ── GET /api/preview?format=nonexistent ──

  it("GET /api/preview?format=nonexistent returns 400 with error", async () => {
    const res = await request(port, "/api/preview?format=nonexistent");
    assert.equal(res.status, 400);

    const body = JSON.parse(res.body);
    assert.ok(body.error, "response should have error field");
    assert.ok(
      body.error.includes("nonexistent"),
      "error should mention the format name",
    );
  });

  it("GET /api/preview without format param returns 400", async () => {
    const res = await request(port, "/api/preview");
    assert.equal(res.status, 400);

    const body = JSON.parse(res.body);
    assert.ok(body.error);
  });

  // ── GET /events ──

  it("GET /events returns SSE stream with text/event-stream content-type", async () => {
    const { status, headers, firstEvent } = await new Promise(
      (resolve, reject) => {
        const req = http.get(
          { hostname: "127.0.0.1", port, path: "/events" },
          (res) => {
            const contentType = res.headers["content-type"];
            let data = "";

            res.on("data", (chunk) => {
              data += chunk.toString();
              // Once we get the initial state event, we have enough to verify
              if (data.includes("\n\n")) {
                req.destroy();
                resolve({
                  status: res.statusCode,
                  headers: res.headers,
                  firstEvent: data,
                });
              }
            });

            // Safety timeout -- SSE stays open, so force-close after 3s
            setTimeout(() => {
              req.destroy();
              resolve({
                status: res.statusCode,
                headers: res.headers,
                firstEvent: data,
              });
            }, 3000);
          },
        );
        req.on("error", (err) => {
          // ECONNRESET is expected when we destroy the request
          if (err.code !== "ECONNRESET") reject(err);
        });
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error("SSE timeout"));
        });
      },
    );

    assert.equal(status, 200);
    assert.ok(headers["content-type"].includes("text/event-stream"));
    assert.ok(headers["cache-control"].includes("no-cache"));

    // The server sends an initial state event
    assert.ok(firstEvent.includes("data:"), "should contain SSE data line");
    const jsonStr = firstEvent.split("data: ")[1].split("\n")[0];
    const event = JSON.parse(jsonStr);
    assert.equal(event.type, "state");
    assert.ok(event.data.formats, "initial event should include formats");
  });

  // ── GET /api/docs ──

  it("GET /api/docs returns 200 with HTML documentation", async () => {
    const res = await request(port, "/api/docs");
    assert.equal(res.status, 200);
    assert.ok(res.headers["content-type"].includes("text/html"));
    assert.ok(res.body.includes("mill API"), "should contain API title");
    assert.ok(res.body.includes("/health"), "should list health endpoint");
    assert.ok(res.body.includes("/api/state"), "should list state endpoint");
    assert.ok(res.body.includes("/events"), "should list SSE endpoint");
  });

  // ── 404 fallback ──

  it("GET /nonexistent returns 404", async () => {
    const res = await request(port, "/nonexistent");
    assert.equal(res.status, 404);
  });
});
