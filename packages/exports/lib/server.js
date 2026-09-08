#!/usr/bin/env node
/**
 * mill serve — local HTTP server for the mill export workbench UI
 *
 * Live preview of artifact exports, SSE for file-change updates,
 * REST API for format listing, export execution, and job history.
 * Zero npm dependencies (node:http only).
 *
 * Usage:
 *   mill serve [--port 9094] [--source /path/to/sprint]
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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

const PUBLIC_DIR = join(__dirname, "..", "public");

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = parseInt(arg("port", "9094"), 10);
const SOURCE = resolve(arg("source", process.cwd()));
const CORS_ORIGIN = arg("cors", null);

// ── Verbose logging ──────────────────────────────────────────────────────────

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] mill: ${a.join(" ")}\n`);
}

// ── Routes manifest ──────────────────────────────────────────────────────────

const ROUTES = [
  {
    method: "GET",
    path: "/events",
    description: "SSE event stream for live updates",
  },
  {
    method: "GET",
    path: "/api/state",
    description: "Current state (source, formats, history)",
  },
  {
    method: "GET",
    path: "/api/formats",
    description: "List available export formats",
  },
  {
    method: "POST",
    path: "/api/export",
    description: "Export claims to a target format",
  },
  {
    method: "GET",
    path: "/api/preview",
    description: "Preview export output by ?format",
  },
  {
    method: "GET",
    path: "/api/download",
    description: "Download exported file by ?format",
  },
  { method: "GET", path: "/api/history", description: "Export job history" },
  {
    method: "POST",
    path: "/api/refresh",
    description: "Reload source data from disk",
  },
  {
    method: "GET",
    path: "/api/docs",
    description: "This API documentation page",
  },
  { method: "GET", path: "/health", description: "Health check endpoint" },
];

// ── Format modules ────────────────────────────────────────────────────────────

const formats = {};
const formatModules = [
  "markdown",
  "csv",
  "json-ld",
  "html-report",
  "executive-summary",
  "slide-deck",
  "ndjson",
  "typescript-defs",
  "yaml",
  "sql",
  "evidence-matrix",
  "bibtex",
  "ris",
  "changelog",
  "rss",
  "jira-csv",
  "github-issues",
  "opml",
  "obsidian",
  "graphml",
  "dot",
  "treemap",
  "sankey",
  "static-site",
];

for (const mod of formatModules) {
  try {
    const m = await import(`./formats/${mod}.mjs`);
    formats[m.name] = {
      name: m.name,
      extension: m.extension,
      mimeType: m.mimeType,
      description: m.description,
      convert: m.convert,
    };
  } catch (e) {
    console.error(`mill: failed to load format "${mod}": ${e.message}`);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

const exportHistory = [];
let compilation = null;
let claims = null;
let sourceFiles = {};

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

// ── Source loading ────────────────────────────────────────────────────────────

async function loadSource() {
  const files = {};
  vlog("read", `loading source from ${SOURCE}`);

  // Look for compilation.json
  const compilationPath = join(SOURCE, "compilation.json");
  if (existsSync(compilationPath)) {
    try {
      compilation = JSON.parse(await readFile(compilationPath, "utf8"));
      const s = await stat(compilationPath);
      files["compilation.json"] = {
        path: compilationPath,
        size: s.size,
        modified: s.mtime.toISOString(),
      };
    } catch (e) {
      compilation = null;
      vlog("warn", `failed to parse compilation.json: ${e.message}`);
    }
  }

  // Look for claims.json
  const claimsPath = join(SOURCE, "claims.json");
  if (existsSync(claimsPath)) {
    try {
      const raw = JSON.parse(await readFile(claimsPath, "utf8"));
      claims = Array.isArray(raw) ? raw : raw.claims || [];
      const s = await stat(claimsPath);
      files["claims.json"] = {
        path: claimsPath,
        size: s.size,
        modified: s.mtime.toISOString(),
      };
    } catch (e) {
      claims = null;
      vlog("warn", `failed to parse claims.json: ${e.message}`);
    }
  }

  // If compilation.json is the wheat compiler output (no .claims key),
  // or if there's no compilation at all, synthesize from claims.json
  if (claims) {
    const compilationHasClaims =
      compilation && Array.isArray(compilation.claims);
    if (!compilationHasClaims) {
      // Extract meta from claims.json if present
      const claimsRaw = JSON.parse(
        await readFile(join(SOURCE, "claims.json"), "utf8"),
      );
      const meta = claimsRaw.meta || {};

      // Merge compiler certificate if available
      const cert = compilation
        ? {
            compiled_at: compilation.compiled_at,
            sha256: compilation.claims_hash,
            claim_count: claims.length,
            compiler_version: compilation.compiler_version,
            status: compilation.status,
          }
        : {};

      compilation = {
        meta,
        claims,
        conflicts: compilation?.conflict_graph || [],
        certificate: cert,
      };
    }
  }

  sourceFiles = files;
}

function buildState() {
  return {
    source: SOURCE,
    sourceFiles,
    formats: Object.values(formats).map((f) => ({
      name: f.name,
      extension: f.extension,
      mimeType: f.mimeType,
      description: f.description,
    })),
    hasCompilation: compilation !== null,
    claimCount: compilation?.claims?.length || 0,
    historyCount: exportHistory.length,
  };
}

// ── Export execution ──────────────────────────────────────────────────────────

function runExport(formatName, options = {}) {
  const fmt = formats[formatName];
  if (!fmt) {
    return { error: `Unknown format: ${formatName}` };
  }
  if (!compilation) {
    return {
      error:
        "No compilation data available. Ensure compilation.json or claims.json exists in the source directory.",
    };
  }

  try {
    const startTime = Date.now();
    const output = fmt.convert(compilation);
    const duration = Date.now() - startTime;

    const job = {
      id: randomUUID().slice(0, 8),
      format: formatName,
      extension: fmt.extension,
      mimeType: fmt.mimeType,
      claimCount: compilation.claims?.length || 0,
      outputSize: Buffer.byteLength(output, "utf8"),
      duration,
      timestamp: new Date().toISOString(),
      options,
    };

    exportHistory.unshift(job);
    // Keep last 50 jobs
    if (exportHistory.length > 50) exportHistory.length = 50;

    broadcast({ type: "export-complete", data: job });

    return { job, output };
  } catch (err) {
    return { error: `Export failed: ${err.message}` };
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
  ".ico": "image/x-icon",
};

// ── Body parser ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((res, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1048576) {
        res(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        res(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        res(null);
      }
    });
    req.on("error", reject);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

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

  // ── Health check ──
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: process.uptime(),
        formats: Object.keys(formats).length,
      }),
    );
    return;
  }

  // ── API: docs ──
  if (req.method === "GET" && url.pathname === "/api/docs") {
    const html = `<!DOCTYPE html><html><head><title>mill API</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e8ecf1;max-width:800px;margin:40px auto;padding:0 20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#9ca3af}code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>mill API</h1><p>${ROUTES.length} endpoints</p>
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
      `data: ${JSON.stringify({ type: "state", data: buildState() })}\n\n`,
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

  // ── API: state ──
  if (req.method === "GET" && url.pathname === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(buildState()));
    return;
  }

  // ── API: formats ──
  if (req.method === "GET" && url.pathname === "/api/formats") {
    const formatList = Object.values(formats).map((f) => ({
      name: f.name,
      extension: f.extension,
      mimeType: f.mimeType,
      description: f.description,
      schema_version: "1.0.0",
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ formats: formatList }));
    return;
  }

  // ── API: export ──
  if (req.method === "POST" && url.pathname === "/api/export") {
    const body = await readBody(req);
    if (!body || !body.format) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: 'Missing "format" in request body' }));
      return;
    }

    const result = runExport(body.format, body.options || {});
    if (result.error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        job: result.job,
        output: result.output,
      }),
    );
    return;
  }

  // ── API: preview (GET with query param) ──
  if (req.method === "GET" && url.pathname === "/api/preview") {
    const formatName = url.searchParams.get("format");
    if (!formatName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: 'Missing "format" query parameter' }));
      return;
    }

    const result = runExport(formatName);
    if (result.error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: result.error }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        format: formatName,
        output: result.output,
        size: result.job.outputSize,
      }),
    );
    return;
  }

  // ── API: download (returns the raw file) ──
  if (req.method === "GET" && url.pathname === "/api/download") {
    const formatName = url.searchParams.get("format");
    if (!formatName) {
      res.writeHead(400);
      res.end("Missing format");
      return;
    }

    const fmt = formats[formatName];
    if (!fmt) {
      res.writeHead(400);
      res.end("Unknown format");
      return;
    }

    const result = runExport(formatName);
    if (result.error) {
      res.writeHead(400);
      res.end(result.error);
      return;
    }

    const filename = `export${fmt.extension}`;
    res.writeHead(200, {
      "Content-Type": fmt.mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.end(result.output);
    return;
  }

  // ── API: history ──
  if (req.method === "GET" && url.pathname === "/api/history") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ history: exportHistory }));
    return;
  }

  // ── API: refresh ──
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    await loadSource();
    broadcast({ type: "state", data: buildState() });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(buildState()));
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

// ── File watching (fingerprint-based polling) ─────────────────────────────────

let lastFingerprint = "";
function computeFingerprint() {
  const names = ["compilation.json", "claims.json"];
  const parts = [];
  for (const name of names) {
    const fp = join(SOURCE, name);
    try {
      const s = statSync(fp);
      parts.push(name + ":" + s.mtimeMs);
    } catch {
      /* skip */
    }
  }
  return parts.join("|");
}

function startWatcher() {
  lastFingerprint = computeFingerprint();
  setInterval(() => {
    const fp = computeFingerprint();
    if (fp !== lastFingerprint) {
      lastFingerprint = fp;
      loadSource();
      broadcast({ type: "source-changed", data: buildState() });
    }
  }, 2000);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\nmill: ${signal} received, shutting down...`);
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

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`mill: port ${PORT} is already in use. Try --port <other>.`);
  } else if (err.code === "EACCES") {
    console.error(`mill: port ${PORT} requires elevated privileges.`);
  } else {
    console.error(`mill: server error: ${err.message}`);
  }
  process.exit(1);
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (!existsSync(SOURCE)) {
  console.error(`mill: source directory not found: ${SOURCE}`);
  console.error("  Use --source <dir> to specify the sprint directory.");
  process.exit(1);
}

await loadSource();
startWatcher();

server.listen(PORT, "127.0.0.1", () => {
  vlog("listen", `port=${PORT}`, `source=${SOURCE}`);
  console.log(`mill: serving on http://localhost:${PORT}`);
  console.log(`  source: ${SOURCE}`);
  console.log(`  formats: ${Object.keys(formats).join(", ")}`);
  if (compilation) {
    console.log(`  claims: ${compilation.claims?.length || 0}`);
  } else {
    console.log(`  claims: no compilation data found`);
  }
  console.log(
    `  files: ${Object.keys(sourceFiles).join(", ") || "none detected"}`,
  );
});
