#!/usr/bin/env node
/**
 * silo serve -- local HTTP server for the silo knowledge browser UI
 *
 * Two-column pack browser with search, import wizard, and SSE live updates.
 * Zero npm dependencies (node:http only).
 *
 * Usage:
 *   silo serve [--port 9095] [--root /path/to/repo]
 *
 * Programmatic:
 *   import { start } from '@grainulation/silo/server';
 *   const { server, port } = start({ port: 9095, root: process.cwd() });
 */

import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { Search } from "./search.js";
import { Packs } from "./packs.js";
import { ImportExport } from "./import-export.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PUBLIC_DIR = join(__dirname, "..", "public");
const PACKS_DIR = join(__dirname, "..", "packs");

// ── Routes manifest ──────────────────────────────────────────────────────────

const ROUTES = [
  { method: "GET", path: "/health", description: "Health check endpoint" },
  {
    method: "GET",
    path: "/events",
    description: "SSE event stream for live updates",
  },
  {
    method: "GET",
    path: "/api/packs",
    description: "List all available knowledge packs",
  },
  {
    method: "GET",
    path: "/api/packs/:name",
    description: "Get pack details and claims by name",
  },
  {
    method: "POST",
    path: "/api/import",
    description: "Import a pack into a target claims file",
  },
  {
    method: "GET",
    path: "/api/search",
    description: "Search claims by ?q, ?type, ?evidence, ?limit",
  },
  {
    method: "POST",
    path: "/api/refresh",
    description: "Reload packs from disk",
  },
  {
    method: "GET",
    path: "/api/docs",
    description: "This API documentation page",
  },
];

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((res) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1048576) {
        res(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        res(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        res(null);
      }
    });
    req.on("error", () => res(null));
  });
}

// ── start() — server factory (all side-effecty code lives here) ──────────────

export function start({
  port = 9095,
  root = process.cwd(),
  corsOrigin = null,
  verbose = false,
  installCrashHandlers = true,
  installSignalHandlers = true,
} = {}) {
  const PORT = typeof port === "string" ? parseInt(port, 10) : port;
  const ROOT = resolve(root);
  const CORS_ORIGIN = corsOrigin;

  // ── Crash handlers ──
  if (installCrashHandlers) {
    process.on("uncaughtException", (err) => {
      process.stderr.write(
        `[${new Date().toISOString()}] FATAL: ${err.stack || err}\n`,
      );
      process.exit(1);
    });
    process.on("unhandledRejection", (reason) => {
      process.stderr.write(
        `[${new Date().toISOString()}] WARN unhandledRejection: ${reason}\n`,
      );
    });
  }

  // ── Verbose logging ──
  function vlog(...a) {
    if (!verbose) return;
    const ts = new Date().toISOString();
    process.stderr.write(`[${ts}] silo: ${a.join(" ")}\n`);
  }

  const store = new Store();
  const search = new Search(store);
  const packs = new Packs(store);
  const io = new ImportExport(store);

  // ── State ──
  const state = {
    packs: [],
    searchResults: [],
  };

  const sseClients = new Set();

  function broadcast(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(data);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  function loadPacks() {
    return packs.list();
  }

  function refreshState() {
    state.packs = loadPacks();
    broadcast({ type: "state", data: state });
  }

  // ── HTTP server ──
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // CORS (only when --cors is passed)
    if (CORS_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS" && CORS_ORIGIN) {
      res.writeHead(204);
      res.end();
      return;
    }

    vlog("request", req.method, url.pathname);

    // ── API: docs ──
    if (req.method === "GET" && url.pathname === "/api/docs") {
      const html = `<!DOCTYPE html><html><head><title>silo API</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e8ecf1;max-width:800px;margin:40px auto;padding:0 20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#9ca3af}code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>silo API</h1><p>${ROUTES.length} endpoints</p>
<table><tr><th>Method</th><th>Path</th><th>Description</th></tr>
${ROUTES.map((r) => "<tr><td><code>" + r.method + "</code></td><td><code>" + r.path + "</code></td><td>" + r.description + "</td></tr>").join("")}
</table></body></html>`;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }

    // ── Health check ──
    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, {
        status: "ok",
        uptime: process.uptime(),
        packs: state.packs.length,
      });
      return;
    }

    // ── SSE endpoint ──
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "state", data: state })}\n\n`);
      const heartbeat = setInterval(() => {
        try {
          res.write(": heartbeat\n\n");
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);
      sseClients.add(res);
      vlog("sse", `client connected (${sseClients.size} total)`);
      req.on("close", () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
        vlog("sse", `client disconnected (${sseClients.size} total)`);
      });
      return;
    }

    // ── API: list packs ──
    if (req.method === "GET" && url.pathname === "/api/packs") {
      const packList = loadPacks();
      jsonResponse(res, 200, { packs: packList });
      return;
    }

    // ── API: get pack details ──
    if (req.method === "GET" && url.pathname.startsWith("/api/packs/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/packs/".length));
      if (!name) {
        jsonResponse(res, 400, { error: "missing pack name" });
        return;
      }

      const pack = packs.get(name);
      if (!pack) {
        jsonResponse(res, 404, { error: `pack "${name}" not found` });
        return;
      }

      jsonResponse(res, 200, {
        id: name,
        name: pack.name,
        description: pack.description,
        version: pack.version,
        claimCount: (pack.claims || []).length,
        claims: pack.claims || [],
      });
      return;
    }

    // ── API: import pack ──
    if (req.method === "POST" && url.pathname === "/api/import") {
      try {
        const body = await readBody(req);
        const { pack: packName, targetDir } = body;
        if (!packName || !targetDir) {
          jsonResponse(res, 400, { error: "missing pack or targetDir" });
          return;
        }

        const absTarget = resolve(targetDir);
        if (!absTarget.startsWith(ROOT)) {
          jsonResponse(res, 400, {
            error: "target directory must be within the project root",
          });
          return;
        }

        const targetPath = resolve(absTarget, "claims.json");
        // Ensure the target file exists

        const result = io.pull(packName, targetPath);
        refreshState();
        jsonResponse(res, 200, {
          success: true,
          imported: result.imported,
          skippedDuplicates: result.skippedDuplicates,
          totalClaims: result.totalClaims,
        });
      } catch (err) {
        jsonResponse(res, 500, { error: err.message });
      }
      return;
    }

    // ── API: search ──
    if (req.method === "GET" && url.pathname === "/api/search") {
      const q = url.searchParams.get("q") || "";
      const type = url.searchParams.get("type") || undefined;
      const evidence = url.searchParams.get("evidence") || undefined;
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);

      if (!q) {
        jsonResponse(res, 200, { query: q, results: [] });
        return;
      }

      // Search built-in packs too
      const results = [];

      // Search silo store
      const storeResults = search.query(q, { type, evidence, limit });
      results.push(...storeResults);

      // Also search directly in packs/ directory
      if (existsSync(PACKS_DIR)) {
        for (const file of readdirSync(PACKS_DIR)) {
          if (!file.endsWith(".json")) continue;
          try {
            const data = JSON.parse(
              readFileSync(join(PACKS_DIR, file), "utf-8"),
            );
            const packName = data.name || file.replace(".json", "");
            for (const claim of data.claims || []) {
              if (type && claim.type !== type) continue;
              if (evidence && claim.evidence !== evidence) continue;
              const searchable = [
                claim.content || claim.text || "",
                claim.type || "",
                claim.topic || "",
                (claim.tags || []).join(" "),
              ]
                .join(" ")
                .toLowerCase();

              const tokens = q
                .toLowerCase()
                .split(/\s+/)
                .filter((t) => t.length > 1);
              let score = 0;
              for (const token of tokens) {
                if (searchable.includes(token)) {
                  score += 1;
                  if (
                    searchable.includes(` ${token} `) ||
                    searchable.startsWith(`${token} `)
                  ) {
                    score += 0.5;
                  }
                }
              }
              if (score > 0) {
                results.push({ claim, collection: `pack:${packName}`, score });
              }
            }
          } catch {
            /* skip malformed */
          }
        }
      }

      // Deduplicate by claim ID, keep highest score
      const seen = new Map();
      for (const r of results) {
        const key = r.claim.id || JSON.stringify(r.claim);
        if (!seen.has(key) || seen.get(key).score < r.score) {
          seen.set(key, r);
        }
      }

      const deduped = [...seen.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      jsonResponse(res, 200, { query: q, results: deduped });
      return;
    }

    // ── API: refresh ──
    if (req.method === "POST" && url.pathname === "/api/refresh") {
      refreshState();
      jsonResponse(res, 200, state);
      return;
    }

    // ── Static files ──
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const resolved = resolve(PUBLIC_DIR, "." + filePath);
    if (!resolved.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }

    if (existsSync(resolved) && statSync(resolved).isFile()) {
      const ext = extname(resolved);
      const mime = MIME[ext] || "application/octet-stream";
      try {
        const content = readFileSync(resolved);
        res.writeHead(200, { "Content-Type": mime });
        res.end(content);
      } catch {
        res.writeHead(500);
        res.end("read error");
      }
      return;
    }

    // ── 404 ──
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  // ── File watching (fingerprint-based polling) ──
  let lastFingerprint = "";
  function computeFingerprint() {
    const parts = [];
    try {
      if (existsSync(PACKS_DIR)) {
        for (const file of readdirSync(PACKS_DIR)) {
          if (!file.endsWith(".json")) continue;
          try {
            const s = statSync(join(PACKS_DIR, file));
            parts.push(file + ":" + s.mtimeMs);
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* skip */
    }
    return parts.join("|");
  }

  lastFingerprint = computeFingerprint();
  const watchInterval = setInterval(() => {
    const fp = computeFingerprint();
    if (fp !== lastFingerprint) {
      lastFingerprint = fp;
      refreshState();
      vlog("watcher", "packs changed, state refreshed");
    }
  }, 5000);
  // Don't keep the event loop alive purely for watcher polling
  if (watchInterval.unref) watchInterval.unref();

  // ── Graceful shutdown ──
  const shutdown = (signal) => {
    console.log(`\nsilo: ${signal} received, shutting down...`);
    clearInterval(watchInterval);
    for (const res of sseClients) {
      try {
        res.end();
      } catch {}
    }
    sseClients.clear();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  if (installSignalHandlers) {
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  // ── Start ──
  refreshState();

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `silo: port ${PORT} is already in use. Try --port <other>.`,
      );
    } else if (err.code === "EACCES") {
      console.error(`silo: port ${PORT} requires elevated privileges.`);
    } else {
      console.error(`silo: server error: ${err.message}`);
    }
    process.exit(1);
  });

  server.listen(PORT, "127.0.0.1", () => {
    vlog("listen", `port=${PORT}`, `root=${ROOT}`);
    console.log(`silo: serving on http://localhost:${PORT}`);
    console.log(`  packs: ${state.packs.length} available`);
    console.log(`  root:  ${ROOT}`);
  });

  return { server, port: PORT };
}

// ── Entry-point guard: only boot when run as a CLI ──────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  function arg(name, fallback) {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  }
  const verbose =
    process.argv.includes("--verbose") || process.argv.includes("-v");
  start({
    port: parseInt(arg("port", "9095"), 10),
    root: arg("root", process.cwd()),
    corsOrigin: arg("cors", null),
    verbose,
  });
}
