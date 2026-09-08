/**
 * Unit tests: lib/server.js
 *
 * server.js is ES-module; this CJS test file loads it via dynamic import().
 * We pass { installSignalHandlers: false, installCrashHandlers: false } and
 * port 0 so Node picks a free port — keeping the suite hermetic.
 *
 * Covers:
 *   - start() returns { server, port } and binds to 127.0.0.1
 *   - GET / serves the dashboard HTML
 *   - GET /api/docs returns an HTML API reference with all routes
 *   - GET /api/sprints lists the sprint in the tempdir root
 *   - GET /api/dashboard returns zeroed shape for empty root
 *   - GET /api/decay accepts ?days=N query
 *   - GET /unknown-path returns 404
 *   - GET /events returns SSE content-type header (stream then closed)
 *   - directory-traversal in static paths is rejected with 403
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import net from "node:net";

function get(port, urlPath, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: urlPath,
        method: "GET",
        headers: extraHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function makeSprintTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harvest-server-"));
  // Put one sprint at the root (claims.json present) so discoverSprints
  // doesn't walk up and find something outside.
  fs.writeFileSync(
    path.join(root, "claims.json"),
    JSON.stringify({
      schema_version: "1.0",
      meta: { question: "test", phase: "research" },
      claims: [
        {
          id: "r001",
          type: "factual",
          evidence: "documented",
          status: "active",
          content: "test",
          topic: "t",
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  );
  return root;
}

describe("server: start() happy path", () => {
  let serverInstance;
  let port;
  let root;
  let startFn;

  before(async () => {
    const mod = await import("../lib/server.js");
    startFn = mod.start;
    root = makeSprintTree();
    const r = startFn({
      port: 0, // let OS assign a free port
      root,
      verbose: false,
      installCrashHandlers: false,
      installSignalHandlers: false,
    });
    serverInstance = r.server;
    // Wait until actually listening.
    await new Promise((resolve) => {
      if (serverInstance.listening) resolve();
      else serverInstance.once("listening", resolve);
    });
    port = serverInstance.address().port;
  });

  after(async () => {
    await new Promise((resolve) => {
      serverInstance.closeAllConnections?.();
      serverInstance.close(() => resolve());
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("binds to a valid port on 127.0.0.1", () => {
    assert.ok(typeof port === "number" && port > 0);
    const addr = serverInstance.address();
    assert.equal(addr.address, "127.0.0.1");
  });

  it("GET / returns the dashboard HTML", async () => {
    const res = await get(port, "/");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] || "", /text\/html/);
    assert.ok(res.body.length > 0);
  });

  it("GET /api/docs returns HTML with route table", async () => {
    const res = await get(port, "/api/docs");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] || "", /text\/html/);
    assert.match(res.body, /harvest API/);
    assert.match(res.body, /\/api\/sprints/);
    assert.match(res.body, /\/api\/decay/);
  });

  it("GET /api/sprints returns the discovered sprint", async () => {
    const res = await get(port, "/api/sprints");
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.sprints));
    // Root sprint is discovered
    assert.ok(body.sprints.length >= 1);
    assert.ok(body.sprints.some((s) => s.claimCount === 1));
  });

  it("GET /api/decay?days=30 returns decay summary", async () => {
    const res = await get(port, "/api/decay?days=30");
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.decay);
    assert.ok(body.decay.summary);
  });

  it("GET /api/dashboard returns combined summary", async () => {
    const res = await get(port, "/api/dashboard");
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(typeof body.sprintCount === "number");
    assert.ok(typeof body.totalClaims === "number");
  });

  it("GET /unknown-path returns 404", async () => {
    const res = await get(port, "/no-such-path");
    assert.equal(res.status, 404);
  });

  it("GET /events returns text/event-stream header", async () => {
    // Open a raw socket so we can read a single event frame then disconnect,
    // instead of blocking on SSE heartbeat.
    const headers = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: "/events",
          method: "GET",
        },
        (res) => {
          resolve({ status: res.statusCode, headers: res.headers });
          res.destroy();
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(headers.status, 200);
    assert.match(headers.headers["content-type"] || "", /text\/event-stream/);
  });

  it("rejects directory-traversal in static paths with 403", async () => {
    // raw socket so node doesn't normalize ".." away in the URL
    const body = await new Promise((resolve) => {
      const sock = net.createConnection({ host: "127.0.0.1", port }, () => {
        sock.write("GET /../../etc/passwd HTTP/1.0\r\nHost: localhost\r\n\r\n");
      });
      const chunks = [];
      sock.on("data", (c) => chunks.push(c));
      sock.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      sock.on("error", () =>
        resolve(chunks.length ? Buffer.concat(chunks).toString("utf8") : ""),
      );
    });
    // Must be 403 or 404 — never expose traversal.
    assert.ok(
      /HTTP\/1\.[01] 403|HTTP\/1\.[01] 404/.test(body),
      `expected 403 or 404 but got:\n${body.split("\n")[0]}`,
    );
  });
});

describe("server: empty root", () => {
  let serverInstance;
  let port;
  let root;

  before(async () => {
    const mod = await import("../lib/server.js");
    root = fs.mkdtempSync(path.join(os.tmpdir(), "harvest-server-empty-"));
    const r = mod.start({
      port: 0,
      root,
      verbose: false,
      installCrashHandlers: false,
      installSignalHandlers: false,
    });
    serverInstance = r.server;
    await new Promise((resolve) => {
      if (serverInstance.listening) resolve();
      else serverInstance.once("listening", resolve);
    });
    port = serverInstance.address().port;
  });

  after(async () => {
    await new Promise((resolve) => {
      serverInstance.closeAllConnections?.();
      serverInstance.close(() => resolve());
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("GET /api/dashboard returns zeroed shape when no sprints", async () => {
    const res = await get(port, "/api/dashboard");
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.sprintCount, 0);
    assert.equal(body.totalClaims, 0);
    assert.equal(body.analysis, null);
  });

  it("GET /api/calibration returns empty-summary shape", async () => {
    const res = await get(port, "/api/calibration");
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.calibration);
    assert.equal(body.calibration.summary.totalSprints, 0);
  });
});
