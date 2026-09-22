#!/usr/bin/env node
import { tryReadStaticFile } from "../../shared/lib/fs-safe.cjs";
/**
 * orchard serve -- local HTTP server for the orchard portfolio dashboard
 *
 * Multi-sprint portfolio dashboard with dependency tracking,
 * cross-sprint conflict detection, and timeline views.
 * SSE for live updates, POST endpoints for actions.
 * Zero npm dependencies (node:http only).
 *
 * Usage:
 *   orchard serve [--port 9097] [--root /path/to/repo]
 *
 * Programmatic:
 *   import { start } from '@grainulation/orchard/server';
 *   const { server, port } = start({ port: 9097, root: process.cwd() });
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { watch as fsWatch } from "node:fs";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSafe } from "../../shared/lib/paths.js";
import { claimsPaths } from "./dashboard.js";
import { generateMermaid } from "./planner.js";
import { filterBySeverity as filterConflictsBySeverity } from "./conflicts.js";
import * as hackathonLib from "./hackathon.js";
import * as decomposeLib from "./decompose.js";

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
    path: "/api/portfolio",
    description: "Sprint portfolio with status and metadata",
  },
  {
    method: "GET",
    path: "/api/dependencies",
    description: "Sprint dependency graph (nodes + edges)",
  },
  {
    method: "GET",
    path: "/api/dependencies/mermaid",
    description: "Sprint dependency graph as Mermaid DAG",
  },
  {
    method: "GET",
    path: "/api/conflicts",
    description:
      "Cross-sprint claim conflicts (?severity=critical|warning|info)",
  },
  {
    method: "GET",
    path: "/api/timeline",
    description: "Sprint phase timeline with dates",
  },
  {
    method: "GET",
    path: "/api/hackathon",
    description: "Hackathon timer and leaderboard",
  },
  {
    method: "POST",
    path: "/api/decompose",
    description: "Auto-decompose a question into sub-sprints",
  },
  {
    method: "POST",
    path: "/api/scan",
    description: "Rescan directories for sprint changes",
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

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((res, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        res(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        res({});
      }
    });
    req.on("error", reject);
  });
}

// Resolve ROOT: walk up from initial to find claims.json or orchard.json
function resolveRoot(initial) {
  if (
    existsSync(join(initial, "claims.json")) ||
    existsSync(join(initial, "orchard.json"))
  )
    return initial;
  let dir = initial;
  for (let i = 0; i < 5; i++) {
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
    if (
      existsSync(join(dir, "claims.json")) ||
      existsSync(join(dir, "orchard.json"))
    )
      return dir;
  }
  return initial;
}

// ── Scanner — find sprint directories ─────────────────────────────────────────

function scanForSprints(rootDir) {
  const sprints = [];
  const orchardJson = join(rootDir, "orchard.json");

  // If there's an orchard.json, use its sprint list as hints
  let configSprints = [];
  if (existsSync(orchardJson)) {
    try {
      const config = JSON.parse(readFileSync(orchardJson, "utf8"));
      configSprints = config.sprints || [];
    } catch {
      /* ignore */
    }
  }

  // Also scan directory tree for claims.json files (up to 3 levels deep)
  const seen = new Set();
  function walk(dir, depth) {
    if (depth > 3) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") || entry.name === "node_modules")
          continue;
        const sub = join(dir, entry.name);
        const claimsPath = join(sub, "claims.json");
        if (existsSync(claimsPath) && !seen.has(sub)) {
          seen.add(sub);
          sprints.push(readSprintDir(sub));
        }
        walk(sub, depth + 1);
      }
    } catch {
      /* permission errors, etc */
    }
  }

  // Add configured sprints first
  for (const cs of configSprints) {
    const absPath = resolve(rootDir, cs.path || cs);
    if (existsSync(absPath) && !seen.has(absPath)) {
      seen.add(absPath);
      const info = readSprintDir(absPath);
      // Merge config metadata
      if (cs.assigned_to) info.assignedTo = cs.assigned_to;
      if (cs.deadline) info.deadline = cs.deadline;
      if (cs.status) info.configStatus = cs.status;
      if (cs.depends_on) info.dependsOn = cs.depends_on;
      sprints.push(info);
    }
  }

  walk(rootDir, 0);
  return sprints;
}

function readSprintDir(dir) {
  const name = dir.split("/").pop();
  const info = {
    path: dir,
    name,
    phase: "unknown",
    status: "unknown",
    claimCount: 0,
    claimTypes: {},
    hasCompilation: false,
    lastModified: null,
    question: null,
    assignedTo: null,
    deadline: null,
    dependsOn: [],
    configStatus: null,
    tags: [],
  };

  // Read claims.json
  const claimsPath = join(dir, "claims.json");
  if (existsSync(claimsPath)) {
    try {
      const raw = JSON.parse(readFileSync(claimsPath, "utf8"));
      const claims = Array.isArray(raw) ? raw : raw.claims || [];
      info.claimCount = claims.length;

      // Count types
      for (const c of claims) {
        const t = c.type || "unknown";
        info.claimTypes[t] = (info.claimTypes[t] || 0) + 1;
        // Collect tags
        for (const tag of c.tags || []) {
          if (!info.tags.includes(tag)) info.tags.push(tag);
        }
      }

      // Infer phase from claim ID prefixes
      const prefixes = claims
        .map((c) => (c.id || "").replace(/\d+$/, ""))
        .filter(Boolean);
      if (prefixes.some((p) => p.startsWith("cal"))) info.phase = "calibrate";
      else if (prefixes.some((p) => p === "f")) info.phase = "feedback";
      else if (prefixes.some((p) => p === "e")) info.phase = "evaluate";
      else if (prefixes.some((p) => p === "p")) info.phase = "prototype";
      else if (prefixes.some((p) => p === "x" || p === "w"))
        info.phase = "challenge";
      else if (prefixes.some((p) => p === "r")) info.phase = "research";
      else if (prefixes.some((p) => p === "d")) info.phase = "define";

      const stat = statSync(claimsPath);
      info.lastModified = stat.mtime.toISOString();
    } catch {
      /* ignore parse errors */
    }
  }

  // Check compilation
  const compilationPath = join(dir, "compilation.json");
  if (existsSync(compilationPath)) {
    info.hasCompilation = true;
    try {
      const comp = JSON.parse(readFileSync(compilationPath, "utf8"));
      if (comp.question) info.question = comp.question;
    } catch {
      /* ignore */
    }
  }

  // Check CLAUDE.md for question
  if (!info.question) {
    const claudePath = join(dir, "CLAUDE.md");
    if (existsSync(claudePath)) {
      try {
        const md = readFileSync(claudePath, "utf8");
        const match = md.match(/\*\*Question:\*\*\s*(.+)/);
        if (match) info.question = match[1].trim();
      } catch {
        /* ignore */
      }
    }
  }

  // Infer status
  if (info.claimCount === 0) info.status = "not-started";
  else if (info.hasCompilation) info.status = "compiled";
  else info.status = "active";

  return info;
}

// ── Dependencies — detect cross-sprint references ─────────────────────────────

function buildDependencies(sprints, rootDir) {
  const nodes = sprints.map((s) => ({
    id: s.path,
    name: s.name,
    phase: s.phase,
    status: s.configStatus || s.status,
    claimCount: s.claimCount,
  }));

  const edges = [];
  const sprintPaths = new Set(sprints.map((s) => s.path));

  for (const sprint of sprints) {
    // Check explicit depends_on from orchard.json
    for (const dep of sprint.dependsOn || []) {
      const resolved_dep = resolve(rootDir, dep);
      if (sprintPaths.has(resolved_dep)) {
        edges.push({ from: resolved_dep, to: sprint.path, type: "explicit" });
      }
    }

    // Check claims for cross-references (claim IDs from other sprints)
    const claimsPath_dep = join(sprint.path, "claims.json");
    if (!existsSync(claimsPath_dep)) continue;

    try {
      const raw = JSON.parse(readFileSync(claimsPath_dep, "utf8"));
      const claims = Array.isArray(raw) ? raw : raw.claims || [];
      const text = JSON.stringify(claims);

      for (const other of sprints) {
        if (other.path === sprint.path) continue;
        const otherName = other.name;
        // Check if claims mention other sprint by name or path
        if (text.includes(otherName) && otherName.length > 3) {
          const exists = edges.some(
            (e) =>
              e.from === other.path &&
              e.to === sprint.path &&
              e.type === "reference",
          );
          if (!exists) {
            edges.push({
              from: other.path,
              to: sprint.path,
              type: "reference",
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { nodes, edges };
}

// ── Conflicts — find cross-sprint contradictions ──────────────────────────────

function detectConflicts(sprints) {
  const allClaims = [];

  for (const sprint of sprints) {
    const claimsPath = join(sprint.path, "claims.json");
    if (!existsSync(claimsPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(claimsPath, "utf8"));
      const claims = Array.isArray(raw) ? raw : raw.claims || [];
      for (const c of claims) {
        allClaims.push({
          ...c,
          _sprint: sprint.name,
          _sprintPath: sprint.path,
        });
      }
    } catch {
      /* ignore */
    }
  }

  const conflicts = [];
  const byTag = new Map();

  for (const claim of allClaims) {
    for (const tag of claim.tags || []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(claim);
    }
  }

  for (const [tag, claims] of byTag) {
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i];
        const b = claims[j];
        if (a._sprintPath === b._sprintPath) continue;

        // Opposing recommendations
        if (a.type === "recommendation" && b.type === "recommendation") {
          if (couldContradict(a.text, b.text)) {
            conflicts.push({
              type: "opposing-recommendations",
              tag,
              claimA: {
                id: a.id,
                text: (a.text || "").substring(0, 120),
                sprint: a._sprint,
              },
              claimB: {
                id: b.id,
                text: (b.text || "").substring(0, 120),
                sprint: b._sprint,
              },
              severity: "high",
            });
          }
        }

        // Constraint vs recommendation
        if (
          (a.type === "constraint" && b.type === "recommendation") ||
          (a.type === "recommendation" && b.type === "constraint")
        ) {
          conflicts.push({
            type: "constraint-tension",
            tag,
            claimA: {
              id: a.id,
              text: (a.text || "").substring(0, 120),
              sprint: a._sprint,
              type: a.type,
            },
            claimB: {
              id: b.id,
              text: (b.text || "").substring(0, 120),
              sprint: b._sprint,
              type: b.type,
            },
            severity: "medium",
          });
        }
      }
    }
  }

  return conflicts;
}

function couldContradict(textA, textB) {
  if (!textA || !textB) return false;
  const negators = [
    "not",
    "no",
    "never",
    "avoid",
    "instead",
    "rather",
    "without",
    "don't",
  ];
  const aWords = new Set(textA.toLowerCase().split(/\s+/));
  const bWords = new Set(textB.toLowerCase().split(/\s+/));
  const aNeg = negators.some((n) => aWords.has(n));
  const bNeg = negators.some((n) => bWords.has(n));
  return aNeg !== bNeg;
}

// ── Timeline — extract phase transitions ──────────────────────────────────────

function buildTimeline(sprints) {
  return sprints.map((s) => {
    const phases = [];
    const claimsPath = join(s.path, "claims.json");

    if (existsSync(claimsPath)) {
      try {
        const raw = JSON.parse(readFileSync(claimsPath, "utf8"));
        const claims = Array.isArray(raw) ? raw : raw.claims || [];

        // Group claims by prefix to detect phase transitions
        const phaseMap = new Map();
        for (const c of claims) {
          const prefix = (c.id || "").replace(/\d+$/, "");
          const date = c.created || c.date || null;
          if (!prefix) continue;

          const phaseName =
            prefix === "d"
              ? "define"
              : prefix === "r"
                ? "research"
                : prefix === "p"
                  ? "prototype"
                  : prefix === "e"
                    ? "evaluate"
                    : prefix === "f"
                      ? "feedback"
                      : prefix === "x"
                        ? "challenge"
                        : prefix === "w"
                          ? "witness"
                          : prefix.startsWith("cal")
                            ? "calibrate"
                            : "other";

          if (!phaseMap.has(phaseName)) {
            phaseMap.set(phaseName, {
              name: phaseName,
              claimCount: 0,
              firstDate: date,
              lastDate: date,
            });
          }
          const p = phaseMap.get(phaseName);
          p.claimCount++;
          if (date && (!p.firstDate || date < p.firstDate)) p.firstDate = date;
          if (date && (!p.lastDate || date > p.lastDate)) p.lastDate = date;
        }

        phases.push(...phaseMap.values());
      } catch {
        /* ignore */
      }
    }

    return {
      name: s.name,
      path: s.path,
      status: s.configStatus || s.status,
      deadline: s.deadline,
      phases,
      lastModified: s.lastModified,
    };
  });
}

// ── start() — server factory (all side-effecty code lives here) ──────────────

export function start({
  port = 9097,
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
    process.stderr.write(`[${ts}] orchard: ${a.join(" ")}\n`);
  }

  // ── State ──
  const state = {
    portfolio: [],
    dependencies: { nodes: [], edges: [] },
    conflicts: [],
    timeline: [],
    lastScan: null,
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
    const sprints = scanForSprints(ROOT);
    state.portfolio = sprints.map((s) => ({
      name: s.name,
      path: s.path,
      phase: s.phase,
      status: s.configStatus || s.status,
      claimCount: s.claimCount,
      claimTypes: s.claimTypes,
      hasCompilation: s.hasCompilation,
      question: s.question,
      assignedTo: s.assignedTo,
      deadline: s.deadline,
      lastModified: s.lastModified,
      tags: s.tags.slice(0, 10),
    }));
    state.dependencies = buildDependencies(sprints, ROOT);
    state.conflicts = detectConflicts(sprints);
    state.timeline = buildTimeline(sprints);
    state.lastScan = new Date().toISOString();
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
      const html = `<!DOCTYPE html><html><head><title>orchard API</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e8ecf1;max-width:800px;margin:40px auto;padding:0 20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#9ca3af}code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>orchard API</h1><p>${ROUTES.length} endpoints</p>
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

    // ── API: portfolio ──
    if (req.method === "GET" && url.pathname === "/api/portfolio") {
      json(res, { portfolio: state.portfolio, lastScan: state.lastScan });
      return;
    }

    // ── API: dependencies ──
    if (req.method === "GET" && url.pathname === "/api/dependencies") {
      json(res, state.dependencies);
      return;
    }

    // ── API: dependencies/mermaid ──
    if (req.method === "GET" && url.pathname === "/api/dependencies/mermaid") {
      // Build an orchard-style config from server state for generateMermaid
      const orchardJson = join(ROOT, "orchard.json");
      let config = { sprints: [] };
      if (existsSync(orchardJson)) {
        try {
          config = JSON.parse(readFileSync(orchardJson, "utf8"));
        } catch {
          /* ignore */
        }
      }
      const mermaid = generateMermaid(config);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(mermaid);
      return;
    }

    // ── API: conflicts ──
    if (req.method === "GET" && url.pathname === "/api/conflicts") {
      const severity = url.searchParams.get("severity") || "info";
      const filtered = filterConflictsBySeverity(state.conflicts, severity);
      json(res, { conflicts: filtered, count: filtered.length });
      return;
    }

    // ── API: hackathon ──
    if (req.method === "GET" && url.pathname === "/api/hackathon") {
      const timer = hackathonLib.timerStatus(ROOT);
      const board = hackathonLib.leaderboard(ROOT);
      json(res, { timer, leaderboard: board });
      return;
    }

    // ── API: decompose ──
    if (req.method === "POST" && url.pathname === "/api/decompose") {
      const body = await readBody(req);
      const question = body.question;
      if (!question) {
        json(res, { error: "question field required" }, 400);
        return;
      }
      const apply = body.apply === true;
      if (apply) {
        const sprints = decomposeLib.applyDecomposition(ROOT, question, {
          maxSprints: body.maxSprints,
        });
        refreshState();
        json(res, { applied: true, sprints });
      } else {
        const sprints = decomposeLib.decompose(question, {
          maxSprints: body.maxSprints,
        });
        json(res, { preview: true, sprints });
      }
      return;
    }

    // ── API: timeline ──
    if (req.method === "GET" && url.pathname === "/api/timeline") {
      json(res, { timeline: state.timeline });
      return;
    }

    // ── API: scan ──
    if (req.method === "POST" && url.pathname === "/api/scan") {
      refreshState();
      json(res, {
        ok: true,
        sprintCount: state.portfolio.length,
        lastScan: state.lastScan,
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
    console.log(`\norchard: ${signal} received, shutting down...`);
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
      console.error(`\norchard: port ${PORT} is already in use.`);
      console.error(`  Try: orchard serve --port ${Number(PORT) + 1}`);
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
    console.log(`orchard: serving on http://localhost:${PORT}`);
    console.log(`  sprints: ${state.portfolio.length} found`);
    console.log(`  conflicts: ${state.conflicts.length} detected`);
    console.log(`  root: ${ROOT}`);
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
    port: parseInt(arg("port", "9097"), 10),
    root: arg("root", process.cwd()),
    corsOrigin: arg("cors", null),
    verbose,
  });
}
