#!/usr/bin/env node
import { tryReadStaticFile } from "../../shared/lib/fs-safe.cjs";
/**
 * harvest serve -- local HTTP server for the harvest retrospective dashboard
 *
 * Sprint analytics: type distribution, evidence quality, velocity, decay alerts.
 * SSE for live updates. Zero npm dependencies (node:http only).
 *
 * Usage:
 *   harvest serve [--port 9096] [--root /path/to/sprints]
 *
 * Programmatic:
 *   import { start } from '@grainulation/harvest/server';
 *   const { server, port } = start({ port: 9096, root: process.cwd() });
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { watch as fsWatch } from "node:fs";
import { join, resolve, extname, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { resolveSafe } from "../../shared/lib/paths.js";
import { analyze } from "./analyzer.js";
import { measureVelocity } from "./velocity.js";
import { checkDecay, decayAlerts } from "./decay.js";
import { calibrate } from "./calibration.js";
import { claimsPaths } from "./dashboard.js";
import { analyzeTokens } from "./tokens.js";
import { generateCard, computeReportStats } from "./harvest-card.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PUBLIC_DIR = join(__dirname, "..", "public");

// ── Routes manifest ──────────────────────────────────────────────────────────

const ROUTES = [
  {
    method: "GET",
    path: "/events",
    description: "SSE event stream for live updates",
  },
  {
    method: "GET",
    path: "/api/sprints",
    description: "List discovered sprints with claim counts",
  },
  {
    method: "GET",
    path: "/api/analysis/:name",
    description: "Full analysis of a single sprint",
  },
  {
    method: "GET",
    path: "/api/calibration",
    description:
      "Prediction calibration with Brier score and calibration curve",
  },
  {
    method: "GET",
    path: "/api/decay",
    description: "Find stale claims needing refresh (?days=N)",
  },
  {
    method: "GET",
    path: "/api/decay-alerts",
    description: "Topic-aware decay alerts with tiered urgency",
  },
  {
    method: "GET",
    path: "/api/tokens",
    description: "Token cost tracking and efficiency metrics",
  },
  {
    method: "GET",
    path: "/api/harvest-card",
    description: "Generate Harvest Report SVG card",
  },
  {
    method: "GET",
    path: "/api/harvest-report",
    description: "Harvest Report stats (JSON)",
  },
  {
    method: "GET",
    path: "/api/intelligence",
    description: "Full intelligence report (all features)",
  },
  {
    method: "GET",
    path: "/api/dashboard",
    description: "Combined analytics dashboard summary",
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

// Resolve ROOT: walk up from initial to find a directory with claims.json
function resolveRoot(initial) {
  if (existsSync(join(initial, "claims.json"))) return initial;
  let dir = initial;
  for (let i = 0; i < 5; i++) {
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
    if (existsSync(join(dir, "claims.json"))) return dir;
  }
  return initial; // fall back to original
}

// ── Sprint discovery (pure) ──────────────────────────────────────────────────

function discoverSprints(rootDir) {
  const sprints = [];
  if (!existsSync(rootDir)) return sprints;

  // Include root if it has claims.json
  const directClaims = join(rootDir, "claims.json");
  if (existsSync(directClaims)) {
    sprints.push(loadSingleSprint(rootDir));
  }

  // Scan subdirectories (two levels deep to catch sprints/<name>/claims.json)
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      const childDir = join(rootDir, entry.name);
      const childClaims = join(childDir, "claims.json");
      if (existsSync(childClaims)) {
        sprints.push(loadSingleSprint(childDir));
      }
      // Second level: scan subdirectories of this directory
      try {
        const subEntries = readdirSync(childDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          if (sub.name.startsWith(".")) continue;
          const subDir = join(childDir, sub.name);
          const subClaims = join(subDir, "claims.json");
          if (existsSync(subClaims)) {
            sprints.push(loadSingleSprint(subDir));
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip if unreadable */
  }

  return sprints;
}

function loadSingleSprint(dir) {
  const sprint = {
    name: basename(dir),
    dir,
    claims: [],
    compilation: null,
    gitLog: [],
  };

  const claimsPath = join(dir, "claims.json");
  try {
    const raw = JSON.parse(readFileSync(claimsPath, "utf8"));
    sprint.claims = Array.isArray(raw) ? raw : raw.claims || [];
  } catch {
    /* skip */
  }

  const compilationPath = join(dir, "compilation.json");
  if (existsSync(compilationPath)) {
    try {
      sprint.compilation = JSON.parse(readFileSync(compilationPath, "utf8"));
    } catch {
      /* skip */
    }
  }

  // Git log for velocity
  try {
    // execFile (no shell) — user-controlled cwd can't inject into argv.
    sprint.gitLog = execFileSync(
      "git",
      ["log", "--oneline", "--format=%H|%ai|%s", "--", "claims.json"],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...msg] = line.split("|");
        return { hash, date, message: msg.join("|") };
      });
  } catch {
    sprint.gitLog = [];
  }

  return sprint;
}

// ── start() — server factory (all side-effecty code lives here) ──────────────

export function start({
  port = 9096,
  root = process.cwd(),
  corsOrigin = null,
  verbose = false,
  installCrashHandlers = true,
  installSignalHandlers = true,
} = {}) {
  const PORT = typeof port === "string" ? parseInt(port, 10) : port;
  const ROOT = resolveRoot(resolve(root));
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
    process.stderr.write(`[${ts}] harvest: ${a.join(" ")}\n`);
  }

  // ── State ──
  const state = {
    sprints: [],
    lastRefresh: null,
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

  function refreshState() {
    state.sprints = discoverSprints(ROOT);
    state.lastRefresh = new Date().toISOString();
    broadcast({
      type: "state",
      data: {
        sprintCount: state.sprints.length,
        lastRefresh: state.lastRefresh,
      },
    });
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
      const html = `<!DOCTYPE html><html><head><title>harvest API</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e8ecf1;max-width:800px;margin:40px auto;padding:0 20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#9ca3af}code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>harvest API</h1><p>${ROUTES.length} endpoints</p>
<table><tr><th>Method</th><th>Path</th><th>Description</th></tr>
${ROUTES.map((r) => "<tr><td><code>" + r.method + "</code></td><td><code>" + r.path + "</code></td><td>" + r.description + "</td></tr>").join("")}
</table></body></html>`;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }

    // ── SSE endpoint ──
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(
        `data: ${JSON.stringify({ type: "state", data: { sprintCount: state.sprints.length, lastRefresh: state.lastRefresh } })}\n\n`,
      );
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

    // ── API: list sprints ──
    if (req.method === "GET" && url.pathname === "/api/sprints") {
      refreshState();
      const sprintList = state.sprints.map((s) => ({
        name: s.name,
        dir: s.dir,
        claimCount: s.claims.length,
        hasCompilation: !!s.compilation,
        gitCommits: s.gitLog.length,
      }));
      jsonResponse(res, 200, { sprints: sprintList });
      return;
    }

    // ── API: full analysis of a sprint ──
    if (req.method === "GET" && url.pathname.startsWith("/api/analysis/")) {
      const sprintName = decodeURIComponent(
        url.pathname.slice("/api/analysis/".length),
      );
      if (!sprintName) {
        jsonResponse(res, 400, { error: "missing sprint name" });
        return;
      }

      // Refresh and find the sprint
      refreshState();
      const sprint = state.sprints.find((s) => s.name === sprintName);
      if (!sprint) {
        jsonResponse(res, 404, { error: `sprint "${sprintName}" not found` });
        return;
      }

      const analysis = analyze([sprint]);
      const velocity = measureVelocity([sprint]);

      jsonResponse(res, 200, {
        sprint: sprintName,
        analysis,
        velocity,
      });
      return;
    }

    // ── API: calibration (all sprints) ──
    if (req.method === "GET" && url.pathname === "/api/calibration") {
      refreshState();
      if (state.sprints.length === 0) {
        jsonResponse(res, 200, {
          calibration: { summary: { totalSprints: 0 }, sprints: [] },
        });
        return;
      }
      const result = calibrate(state.sprints);
      jsonResponse(res, 200, { calibration: result });
      return;
    }

    // ── API: decay detection ──
    if (req.method === "GET" && url.pathname === "/api/decay") {
      const days = parseInt(url.searchParams.get("days") || "30", 10);
      refreshState();
      if (state.sprints.length === 0) {
        jsonResponse(res, 200, {
          decay: {
            summary: { totalClaims: 0 },
            stale: [],
            decaying: [],
            unresolved: [],
          },
        });
        return;
      }
      const result = checkDecay(state.sprints, { thresholdDays: days });
      jsonResponse(res, 200, { decay: result });
      return;
    }

    // ── API: topic-aware decay alerts ──
    if (req.method === "GET" && url.pathname === "/api/decay-alerts") {
      refreshState();
      if (state.sprints.length === 0) {
        jsonResponse(res, 200, {
          decayAlerts: {
            summary: { totalAlerts: 0 },
            alerts: [],
            byUrgency: {},
            topicDecayRates: [],
          },
        });
        return;
      }
      const result = decayAlerts(state.sprints);
      jsonResponse(res, 200, { decayAlerts: result });
      return;
    }

    // ── API: token cost tracking ──
    if (req.method === "GET" && url.pathname === "/api/tokens") {
      refreshState();
      if (state.sprints.length === 0) {
        jsonResponse(res, 200, {
          tokens: { summary: { totalSprints: 0 }, perSprint: [] },
        });
        return;
      }
      const result = analyzeTokens(state.sprints);
      jsonResponse(res, 200, { tokens: result });
      return;
    }

    // ── API: Harvest Report SVG card ──
    if (req.method === "GET" && url.pathname === "/api/harvest-card") {
      refreshState();
      if (state.sprints.length === 0) {
        res.writeHead(200, { "Content-Type": "image/svg+xml" });
        res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0d1117"/><text x="600" y="315" fill="#6e7681" font-family="system-ui" font-size="24" text-anchor="middle">No sprint data</text></svg>',
        );
        return;
      }
      const { svg } = generateCard(state.sprints);
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(svg);
      return;
    }

    // ── API: Harvest Report stats (JSON) ──
    if (req.method === "GET" && url.pathname === "/api/harvest-report") {
      refreshState();
      if (state.sprints.length === 0) {
        jsonResponse(res, 200, { report: null });
        return;
      }
      const stats = computeReportStats(state.sprints);
      jsonResponse(res, 200, { report: stats });
      return;
    }

    // ── API: full intelligence report ──
    if (req.method === "GET" && url.pathname === "/api/intelligence") {
      refreshState();
      if (state.sprints.length === 0) {
        jsonResponse(res, 200, { intelligence: null });
        return;
      }
      const result = {
        analysis: analyze(state.sprints),
        calibration: calibrate(state.sprints),
        decayAlerts: decayAlerts(state.sprints),
        tokens: analyzeTokens(state.sprints),
        velocity: measureVelocity(state.sprints),
        harvestReport: computeReportStats(state.sprints),
      };
      jsonResponse(res, 200, { intelligence: result });
      return;
    }

    // ── API: dashboard summary (all sprints combined) ──
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      refreshState();
      if (state.sprints.length === 0) {
        jsonResponse(res, 200, {
          sprintCount: 0,
          totalClaims: 0,
          analysis: null,
          velocity: null,
          decay: null,
        });
        return;
      }
      const analysis = analyze(state.sprints);
      const velocity = measureVelocity(state.sprints);
      const decay = checkDecay(state.sprints, { thresholdDays: 30 });

      jsonResponse(res, 200, {
        sprintCount: state.sprints.length,
        totalClaims: state.sprints.reduce((a, s) => a + s.claims.length, 0),
        analysis,
        velocity,
        decay,
      });
      return;
    }

    // ── Dashboard UI (web app from public/) ──
    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      const indexPath = join(PUBLIC_DIR, "index.html");
      try {
        const html = readFileSync(indexPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error reading dashboard: " + err.message);
      }
      return;
    }

    // ── Static files (public/) ──
    // resolveSafe() resolves symlinks via fs.realpathSync, defeating
    // symlink-planting attacks where a link inside public/ points at /etc.
    let filePath;
    try {
      filePath = resolveSafe(PUBLIC_DIR, "." + url.pathname);
    } catch {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const staticContent = tryReadStaticFile(PUBLIC_DIR, filePath);
    if (staticContent !== null) {
      const ext = extname(filePath);
      const mime = MIME[ext] || "application/octet-stream";
      try {
        const content = staticContent;
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

  // ── Graceful shutdown ──
  const watchers = [];
  const shutdown = (signal) => {
    console.log(`\nharvest: ${signal} received, shutting down...`);
    for (const w of watchers) {
      try {
        w.close();
      } catch {}
    }
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

  // ── Initial state ──
  refreshState();

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nharvest: port ${PORT} is already in use.`);
      console.error(`  Try: harvest serve --port ${Number(PORT) + 1}`);
      console.error(`  Or stop the process using port ${PORT}.\n`);
      process.exit(1);
    }
    throw err;
  });

  // ── File watching for live reload ──
  let debounceTimer = null;
  function onClaimsChange() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      refreshState();
      // Send update event so SSE clients reload
      const updateData = `event: update\ndata: ${JSON.stringify({ type: "update" })}\n\n`;
      for (const client of sseClients) {
        try {
          client.write(updateData);
        } catch {
          sseClients.delete(client);
        }
      }
    }, 500);
  }

  function watchClaims() {
    const paths = claimsPaths(ROOT);
    for (const p of paths) {
      try {
        const w = fsWatch(p, { persistent: false }, () => onClaimsChange());
        watchers.push(w);
      } catch {
        /* file may not exist yet */
      }
    }
    // Watch sprint directories for new claims files
    for (const dir of [ROOT, join(ROOT, "sprints"), join(ROOT, "archive")]) {
      if (!existsSync(dir)) continue;
      try {
        const w = fsWatch(dir, { persistent: false }, (_, filename) => {
          if (
            filename &&
            (filename === "claims.json" || filename.includes("claims"))
          ) {
            onClaimsChange();
          }
        });
        watchers.push(w);
      } catch {
        /* ignore */
      }
    }
  }

  server.listen(PORT, "127.0.0.1", () => {
    vlog("listen", `port=${PORT}`, `root=${ROOT}`);
    console.log(`harvest: serving on http://localhost:${PORT}`);
    console.log(`  sprints: ${state.sprints.length} found`);
    console.log(`  root:    ${ROOT}`);
    watchClaims();
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
    port: parseInt(arg("port", "9096"), 10),
    root: arg("root", process.cwd()),
    corsOrigin: arg("cors", null),
    verbose,
  });
}
