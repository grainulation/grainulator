/**
 * server.test.js — HTTP endpoint tests for barn serve
 *
 * Spawns lib/server.js as a child process on a random port,
 * tests every API endpoint, then tears down.
 *
 * Uses node:test (describe/it/before/after) + node:assert/strict.
 * Zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SERVER_PATH = join(ROOT, "lib", "server.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find a free port by binding to port 0, reading the assigned port, then closing. */
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

/** Make an HTTP request, return { status, headers, body }. */
function request(port, method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        timeout: 5000,
      },
      (res) => {
        // For SSE, read just the first chunk then destroy
        if (opts.streaming) {
          res.once("data", (chunk) => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: chunk.toString(),
            });
            res.destroy();
          });
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timeout"));
    });
    req.end();
  });
}

/**
 * Start the barn server on a given port. Returns the child process.
 * Resolves once the server prints its "serving on" line.
 */
function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [SERVER_PATH, "--port", String(port), "--root", ROOT],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let started = false;
    const timer = setTimeout(() => {
      if (!started) {
        child.kill("SIGTERM");
        reject(new Error("server did not start within 10s"));
      }
    }, 10000);

    child.stdout.on("data", (data) => {
      if (data.toString().includes("serving on") && !started) {
        started = true;
        clearTimeout(timer);
        resolve(child);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      if (!started) {
        clearTimeout(timer);
        reject(new Error(`server exited prematurely with code ${code}`));
      }
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("barn server endpoints", () => {
  let serverProc;
  let port;

  before(async () => {
    port = await findFreePort();
    serverProc = await startServer(port);
  });

  after(async () => {
    if (serverProc) {
      serverProc.kill("SIGTERM");
      await new Promise((resolve) => {
        serverProc.on("exit", resolve);
        setTimeout(() => {
          try {
            serverProc.kill("SIGKILL");
          } catch {
            /* already dead */
          }
          resolve();
        }, 3000);
      });
      serverProc = null;
    }
  });

  // ── GET /health ──

  it("GET /health returns 200 with expected fields", async () => {
    const res = await request(port, "GET", "/health");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /application\/json/);

    const body = JSON.parse(res.body);
    assert.equal(body.tool, "barn");
    assert.equal(typeof body.version, "string");
    assert.ok(body.version.length > 0, "version is non-empty");
    assert.equal(typeof body.uptime, "number");
    assert.ok(body.uptime > 0, "uptime is positive");
    assert.equal(body.port, port);
  });

  // ── GET /api/state ──

  it("GET /api/state returns 200 with templates array", async () => {
    const res = await request(port, "GET", "/api/state");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /application\/json/);

    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.templates), "state.templates is an array");
    assert.ok(body.templates.length > 0, "at least one template loaded");
    assert.ok(Array.isArray(body.sprints), "state.sprints is an array");
  });

  // ── GET /api/template?name=explainer ──

  it("GET /api/template?name=explainer returns 200 with HTML content", async () => {
    const res = await request(port, "GET", "/api/template?name=explainer");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/plain/);
    assert.ok(
      res.body.includes("<!DOCTYPE html>") || res.body.includes("<html"),
      "body contains HTML markup",
    );
  });

  // ── GET /api/template?name=nonexistent ──

  it("GET /api/template?name=nonexistent returns 404", async () => {
    const res = await request(port, "GET", "/api/template?name=nonexistent");
    assert.equal(res.status, 404);
  });

  // ── GET /api/search?q=dashboard ──

  it("GET /api/search?q=dashboard returns 200 with matching results", async () => {
    const res = await request(port, "GET", "/api/search?q=dashboard");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /application\/json/);

    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body), "search results is an array");
    assert.ok(body.length > 0, 'at least one result for "dashboard"');

    const names = body.map((t) => t.name);
    assert.ok(
      names.includes("dashboard"),
      "results include the dashboard template",
    );
  });

  // ── GET /events (SSE) ──

  it("GET /events returns SSE stream with correct content-type", async () => {
    const res = await request(port, "GET", "/events", { streaming: true });
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/event-stream/);
    assert.ok(
      res.body.startsWith("data:"),
      "SSE stream starts with data frame",
    );

    // Verify the initial state event is valid JSON
    const jsonStr = res.body.replace(/^data:\s*/, "").trim();
    const event = JSON.parse(jsonStr);
    assert.equal(event.type, "state", 'initial SSE event type is "state"');
    assert.ok(Array.isArray(event.data?.templates), "SSE state has templates");
  });

  // ── GET /api/docs ──

  it("GET /api/docs returns 200 with HTML documentation", async () => {
    const res = await request(port, "GET", "/api/docs");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/html/);
    assert.ok(
      res.body.includes("barn API"),
      "docs page contains barn API title",
    );
    assert.ok(res.body.includes("/health"), "docs page lists /health endpoint");
    assert.ok(
      res.body.includes("/api/state"),
      "docs page lists /api/state endpoint",
    );
  });
});
