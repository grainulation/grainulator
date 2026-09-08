#!/usr/bin/env node
/**
 * barn serve — local HTTP server for the barn UI
 *
 * Two-column template browser with sprint auto-detection.
 * SSE for live updates, POST endpoints for actions.
 * Zero npm dependencies (node:http only).
 *
 * Usage:
 *   barn serve [--port 9093] [--root /path/to/repo]
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { stat, readdir } from "node:fs/promises";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { loadTemplates as _loadTemplates } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Crash handlers ──
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

const PKG = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);
const PUBLIC_DIR = join(__dirname, "..", "public");
const TEMPLATES_DIR = join(__dirname, "..", "templates");
const TOOLS_DIR = join(__dirname, "..", "tools");

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = parseInt(arg("port", "9093"), 10);
const ROOT = resolve(arg("root", process.cwd()));
const CORS_ORIGIN = arg("cors", null);

// ── Verbose logging ──────────────────────────────────────────────────────────

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] barn: ${a.join(" ")}\n`);
}

// ── Routes manifest ──────────────────────────────────────────────────────────

const ROUTES = [
  {
    method: "GET",
    path: "/health",
    description: "Health check (tool, version, port, uptime)",
  },
  {
    method: "GET",
    path: "/events",
    description: "SSE event stream for live updates",
  },
  {
    method: "GET",
    path: "/api/state",
    description: "Current state (templates, sprints, manifest)",
  },
  {
    method: "GET",
    path: "/api/template",
    description: "Template content by ?name parameter",
  },
  {
    method: "GET",
    path: "/api/search",
    description:
      "Search templates by ?q=<query> (name, description, placeholders, features)",
  },
  {
    method: "POST",
    path: "/api/refresh",
    description: "Refresh state from disk",
  },
  {
    method: "GET",
    path: "/api/docs",
    description: "This API documentation page",
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

let state = {
  templates: [],
  sprints: [],
  activeSprint: null,
  manifest: null,
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

// ── Data loading ──────────────────────────────────────────────────────────────

function loadTemplates() {
  vlog("read", TEMPLATES_DIR);
  return _loadTemplates(TEMPLATES_DIR);
}

function loadSprints() {
  const mod = join(TOOLS_DIR, "detect-sprints.js");
  if (!existsSync(mod)) return Promise.resolve({ sprints: [], active: null });

  return new Promise((res) => {
    execFile(
      "node",
      [mod, "--json", "--root", ROOT],
      {
        timeout: 10000,
        stdio: ["ignore", "pipe", "pipe"],
      },
      (err, stdout) => {
        if (err) {
          res({ sprints: [], active: null });
          return;
        }
        try {
          const data = JSON.parse(stdout);
          res({
            sprints: data.sprints || [],
            active:
              (data.sprints || []).find((s) => s.status === "active") || null,
          });
        } catch {
          res({ sprints: [], active: null });
        }
      },
    );
  });
}

function loadManifest() {
  const manifestPath = join(ROOT, "wheat-manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

let refreshPending = null;
async function refreshState() {
  if (refreshPending) return refreshPending;
  refreshPending = (async () => {
    state.templates = await loadTemplates();
    const sprintData = await loadSprints();
    state.sprints = sprintData.sprints;
    state.activeSprint = sprintData.active;
    state.manifest = loadManifest();
    broadcast({ type: "state", data: state });
  })();
  try {
    return await refreshPending;
  } finally {
    refreshPending = null;
  }
}

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers (only when --cors is passed)
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

  // ── Health check ──
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        tool: "barn",
        version: PKG.version,
        port: PORT,
        uptime: process.uptime(),
      }),
    );
    return;
  }

  // ── API: docs ──
  if (req.method === "GET" && url.pathname === "/api/docs") {
    const html = `<!DOCTYPE html><html><head><title>barn API</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e8ecf1;max-width:800px;margin:40px auto;padding:0 20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#9ca3af}code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>barn API</h1><p>${ROUTES.length} endpoints</p>
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

  // ── API: state ──
  if (req.method === "GET" && url.pathname === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }

  // ── API: search templates ──
  if (req.method === "GET" && url.pathname === "/api/search") {
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();
    if (!q) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state.templates));
      return;
    }
    const filtered = state.templates.filter((tpl) => {
      const haystack = [
        tpl.name,
        tpl.title,
        tpl.description,
        ...tpl.placeholders,
        ...tpl.features,
        ...tpl.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(filtered));
    return;
  }

  // ── API: template content ──
  if (req.method === "GET" && url.pathname === "/api/template") {
    const name = url.searchParams.get("name");
    if (!name) {
      res.writeHead(400);
      res.end("missing name");
      return;
    }
    const filePath = resolve(TEMPLATES_DIR, name + ".html");
    if (!filePath.startsWith(TEMPLATES_DIR)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(readFileSync(filePath, "utf8"));
    return;
  }

  // ── API: refresh ──
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    await refreshState();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }

  // ── Static files ──
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;

  // Prevent directory traversal
  const resolved = resolve(PUBLIC_DIR, "." + filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  if (existsSync(resolved) && statSync(resolved).isFile()) {
    const ext = extname(resolved);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
    });
    res.end(readFileSync(resolved));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

// ── File watching ─────────────────────────────────────────────────────────────

// Build a fingerprint of filenames + mtimes for change detection
async function dirFingerprint(dir) {
  if (!existsSync(dir)) return "";
  const files = await readdir(dir);
  const parts = [];
  for (const f of files) {
    if (!f.endsWith(".html") && !f.endsWith(".json")) continue;
    try {
      const s = await stat(join(dir, f));
      parts.push(`${f}:${s.mtimeMs}`);
    } catch {
      /* removed between readdir and stat */
    }
  }
  return parts.sort().join("|");
}

async function claimsFingerprint() {
  const claimsPath = join(ROOT, "claims.json");
  try {
    const s = await stat(claimsPath);
    return `claims:${s.mtimeMs}`;
  } catch {
    return "";
  }
}

let lastTemplatesFP = "";
let lastClaimsFP = "";

const watchInterval = setInterval(async () => {
  try {
    const [tFP, cFP] = await Promise.all([
      dirFingerprint(TEMPLATES_DIR),
      claimsFingerprint(),
    ]);
    if (tFP !== lastTemplatesFP || cFP !== lastClaimsFP) {
      lastTemplatesFP = tFP;
      lastClaimsFP = cFP;
      await refreshState();
    }
  } catch {
    /* ignore polling errors */
  }
}, 2000);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\nbarn: ${signal} received, shutting down...`);
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
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start ─────────────────────────────────────────────────────────────────────

await refreshState();
// Seed fingerprints so the poller doesn't re-trigger immediately
[lastTemplatesFP, lastClaimsFP] = await Promise.all([
  dirFingerprint(TEMPLATES_DIR),
  claimsFingerprint(),
]);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`barn: port ${PORT} already in use — try --port <other>`);
    process.exit(1);
  }
  if (err.code === "EACCES") {
    console.error(`barn: permission denied for port ${PORT}`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "127.0.0.1", () => {
  vlog("listen", `port=${PORT}`, `root=${ROOT}`);
  console.log(`barn: serving on http://localhost:${PORT}`);
  console.log(`  templates: ${state.templates.length} found`);
  console.log(`  sprints: ${state.sprints.length} detected`);
  if (state.activeSprint) {
    console.log(
      `  active: ${state.activeSprint.name} (${state.activeSprint.phase})`,
    );
  }
  console.log(`  root: ${ROOT}`);
});
