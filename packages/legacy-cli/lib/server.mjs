#!/usr/bin/env node

/**
 * grainulation serve — local HTTP server for the ecosystem control center
 *
 * Tool catalog, doctor health checks, scaffold actions, and
 * cross-tool navigation. SSE for live updates.
 * Zero npm dependencies (node:http only).
 *
 * Usage:
 *   grainulation serve [--port 9098]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pm = require('./pm.js');

// ── Crash handlers ──
process.on('uncaughtException', (err) => {
  process.stderr.write(`[${new Date().toISOString()}] FATAL: ${err.stack || err}\n`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[${new Date().toISOString()}] WARN unhandledRejection: ${reason}\n`);
});

const PUBLIC_DIR = join(__dirname, '..', 'public');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = parseInt(arg('port', '9098'), 10);
const CORS_ORIGIN = arg('cors', null);
const SPRINT_ROOT = arg('root', null); // forwarded to tools as --root

// ── Verbose logging ──────────────────────────────────────────────────────────

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] grainulation: ${a.join(' ')}\n`);
}

// ── Routes manifest ──────────────────────────────────────────────────────────

const ROUTES = [
  { method: 'GET', path: '/events', description: 'SSE event stream for live updates' },
  { method: 'GET', path: '/api/ecosystem', description: 'List all tools with install status' },
  { method: 'GET', path: '/api/doctor', description: 'Run health checks on ecosystem' },
  { method: 'GET', path: '/api/tools/:name', description: 'Get details for a specific tool' },
  { method: 'POST', path: '/api/scaffold', description: 'Create a new sprint directory' },
  { method: 'POST', path: '/api/pm/start', description: 'Start a tool by name' },
  { method: 'POST', path: '/api/pm/stop', description: 'Stop a tool by name' },
  { method: 'POST', path: '/api/pm/up', description: 'Start all tools' },
  { method: 'POST', path: '/api/pm/down', description: 'Stop all tools' },
  { method: 'GET', path: '/api/pm/ps', description: 'Get status of all tool processes' },
  { method: 'GET', path: '/api/docs', description: 'This API documentation page' },
];

// ── Tool registry ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'wheat',
    pkg: '@grainulation/wheat',
    port: 9091,
    accent: '#fbbf24',
    role: 'Research sprint engine',
    category: 'core',
  },
  {
    name: 'barn',
    pkg: '@grainulation/barn',
    port: 9093,
    accent: '#f43f5e',
    role: 'Design system & templates',
    category: 'foundation',
  },
  {
    name: 'mill',
    pkg: '@grainulation/mill',
    port: 9094,
    accent: '#a78bfa',
    role: 'Export & publish engine',
    category: 'output',
  },
  {
    name: 'silo',
    pkg: '@grainulation/silo',
    port: 9095,
    accent: '#6ee7b7',
    role: 'Reusable claim libraries',
    category: 'storage',
  },
  {
    name: 'harvest',
    pkg: '@grainulation/harvest',
    port: 9096,
    accent: '#fb923c',
    role: 'Analytics & retrospectives',
    category: 'analytics',
  },
  {
    name: 'orchard',
    pkg: '@grainulation/orchard',
    port: 9097,
    accent: '#14b8a6',
    role: 'Multi-sprint orchestrator',
    category: 'orchestration',
  },
  {
    name: 'grainulation',
    pkg: '@grainulation/grainulation',
    port: 9098,
    accent: '#9ca3af',
    role: 'Ecosystem entry point',
    category: 'meta',
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  ecosystem: [],
  doctorResults: null,
  lastCheck: null,
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

// ── Doctor — health checks ────────────────────────────────────────────────────

function detectTool(pkg) {
  // 0. Self-detect: grainulation is always installed (it's running this code)
  if (pkg === '@grainulation/grainulation' || pkg === 'grainulation') {
    const selfPkg = join(__dirname, '..', 'package.json');
    try {
      const p = JSON.parse(readFileSync(selfPkg, 'utf8'));
      return { installed: true, version: p.version || '1.0.0', method: 'self' };
    } catch {
      return { installed: true, version: '1.0.0', method: 'self' };
    }
  }

  // 1. Global npm
  try {
    const out = execFileSync('npm', ['list', '-g', pkg, '--depth=0'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
    });
    const match = out.match(new RegExp(`${escapeRegex(pkg)}@(\\S+)`));
    if (match) return { installed: true, version: match[1], method: 'global' };
  } catch {
    /* not found */
  }

  // 2. npx cache
  try {
    const prefix = execFileSync('npm', ['config', 'get', 'cache'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
    const npxDir = join(prefix, '_npx');
    if (existsSync(npxDir)) {
      const entries = readdirSync(npxDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pkgJson = join(npxDir, entry.name, 'node_modules', pkg, 'package.json');
        if (existsSync(pkgJson)) {
          try {
            const p = JSON.parse(readFileSync(pkgJson, 'utf8'));
            return { installed: true, version: p.version || 'installed', method: 'npx-cache' };
          } catch {
            return { installed: true, version: 'installed', method: 'npx-cache' };
          }
        }
      }
    }
  } catch {
    /* not found */
  }

  // 3. Local node_modules
  const localPkg = join(process.cwd(), 'node_modules', pkg, 'package.json');
  if (existsSync(localPkg)) {
    try {
      const p = JSON.parse(readFileSync(localPkg, 'utf8'));
      return { installed: true, version: p.version || 'installed', method: 'local' };
    } catch {
      /* ignore */
    }
  }

  // 4. Sibling source directory
  const siblingDir = join(__dirname, '..', '..', pkg.replace(/^@[^/]+\//, ''));
  const siblingPkg = join(siblingDir, 'package.json');
  if (existsSync(siblingPkg)) {
    try {
      const p = JSON.parse(readFileSync(siblingPkg, 'utf8'));
      if (p.name === pkg) {
        return { installed: true, version: p.version || 'source', method: 'source' };
      }
    } catch {
      /* ignore */
    }
  }

  return { installed: false, version: null, method: null };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runDoctor() {
  const nodeVersion = process.version;
  let npmVersion = 'unknown';
  try {
    npmVersion = execFileSync('npm', ['--version'], { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf-8' }).trim();
  } catch {
    /* ignore */
  }

  const checks = [];

  // Environment checks
  checks.push({
    name: 'Node.js',
    status: parseInt(nodeVersion.slice(1), 10) >= 18 ? 'pass' : 'warning',
    detail: nodeVersion,
    category: 'environment',
  });

  checks.push({
    name: 'npm',
    status: npmVersion !== 'unknown' ? 'pass' : 'fail',
    detail: `v${npmVersion}`,
    category: 'environment',
  });

  // Tool checks
  const toolStatuses = [];
  for (const tool of TOOLS) {
    const result = detectTool(tool.pkg);
    const status = result.installed ? 'pass' : tool.category === 'core' ? 'warning' : 'info';

    checks.push({
      name: tool.name,
      status,
      detail: result.installed ? `v${result.version} (${result.method})` : 'not installed',
      category: 'tools',
    });

    toolStatuses.push({
      ...tool,
      installed: result.installed,
      version: result.version,
      method: result.method,
    });
  }

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warning').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;

  return {
    checks,
    toolStatuses,
    summary: { pass: passCount, warning: warnCount, fail: failCount, total: checks.length },
    nodeVersion,
    npmVersion,
    timestamp: new Date().toISOString(),
  };
}

// ── Ecosystem — aggregate status ──────────────────────────────────────────────

function getEcosystem() {
  return TOOLS.map((tool) => {
    const result = detectTool(tool.pkg);
    return {
      ...tool,
      installed: result.installed,
      version: result.version,
      method: result.method,
      url: `http://localhost:${tool.port}`,
    };
  });
}

// ── Scaffold — create project directory ───────────────────────────────────────

function scaffold(targetDir, options = {}) {
  const dir = resolve(targetDir);
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    return { ok: false, error: 'Directory already exists and is not empty' };
  }

  mkdirSync(dir, { recursive: true });

  // claims.json (atomic write-then-rename)
  const claimsData = `${JSON.stringify(
    {
      claims: [],
      meta: { created: new Date().toISOString(), tool: 'grainulation' },
    },
    null,
    2,
  )}\n`;
  const tmpClaims = join(dir, `claims.json.tmp.${process.pid}`);
  writeFileSync(tmpClaims, claimsData);
  renameSync(tmpClaims, join(dir, 'claims.json'));

  // CLAUDE.md
  const question = options.question || 'What should we build?';
  writeFileSync(
    join(dir, 'CLAUDE.md'),
    `# Sprint\n\n**Question:** ${question}\n\n**Constraints:**\n- (add constraints here)\n\n**Done looks like:** (describe the output)\n`,
  );

  // orchard.json (if multi-sprint, atomic write-then-rename)
  if (options.includeOrchard) {
    const orchardData = `${JSON.stringify(
      {
        sprints: [],
        settings: { sync_interval: 'manual' },
      },
      null,
      2,
    )}\n`;
    const tmpOrchard = join(dir, `orchard.json.tmp.${process.pid}`);
    writeFileSync(tmpOrchard, orchardData);
    renameSync(tmpOrchard, join(dir, 'orchard.json'));
  }

  return { ok: true, path: dir, files: ['claims.json', 'CLAUDE.md'] };
}

// ── Refresh state ─────────────────────────────────────────────────────────────

function refreshState() {
  state.ecosystem = getEcosystem();
  state.doctorResults = runDoctor();
  state.lastCheck = new Date().toISOString();
  broadcast({ type: 'state', data: state });
}

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS (only when --cors is passed)
  if (CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS' && CORS_ORIGIN) {
    res.writeHead(204);
    res.end();
    return;
  }

  vlog('request', req.method, url.pathname);

  // ── API: docs ──
  if (req.method === 'GET' && url.pathname === '/api/docs') {
    const html = `<!DOCTYPE html><html><head><title>grainulation API</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e8ecf1;max-width:800px;margin:40px auto;padding:0 20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#9ca3af}code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>grainulation API</h1><p>${ROUTES.length} endpoints</p>
<table><tr><th>Method</th><th>Path</th><th>Description</th></tr>
${ROUTES.map((r) => `<tr><td><code>${r.method}</code></td><td><code>${r.path}</code></td><td>${r.description}</td></tr>`).join('')}
</table></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // ── SSE ──
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'state', data: state })}\n\n`);
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);
    sseClients.add(res);
    vlog('sse', `client connected (${sseClients.size} total)`);
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
      vlog('sse', `client disconnected (${sseClients.size} total)`);
    });
    return;
  }

  // ── API: ecosystem ──
  if (req.method === 'GET' && url.pathname === '/api/ecosystem') {
    json(res, { tools: state.ecosystem, lastCheck: state.lastCheck });
    return;
  }

  // ── API: doctor ──
  if (req.method === 'GET' && url.pathname === '/api/doctor') {
    // Run fresh doctor check
    const results = runDoctor();
    json(res, results);
    return;
  }

  // ── API: tool detail ──
  if (req.method === 'GET' && url.pathname.startsWith('/api/tools/')) {
    const name = url.pathname.split('/').pop();
    const tool = state.ecosystem.find((t) => t.name === name);
    if (!tool) {
      json(res, { error: 'Tool not found' }, 404);
      return;
    }
    json(res, tool);
    return;
  }

  // ── API: PM — start a tool ──
  if (req.method === 'POST' && url.pathname === '/api/pm/start') {
    const body = await readBody(req);
    const toolName = body.tool;
    if (!toolName) {
      json(res, { error: 'Missing tool name' }, 400);
      return;
    }
    try {
      const rootArgs = body.root || SPRINT_ROOT ? ['--root', resolve(body.root || SPRINT_ROOT)] : [];
      const result = pm.startTool(toolName, rootArgs);
      json(res, { ok: true, ...result });
      setTimeout(refreshState, 1500);
    } catch (err) {
      json(res, { ok: false, error: err.message }, 400);
    }
    return;
  }

  // ── API: PM — stop a tool ──
  if (req.method === 'POST' && url.pathname === '/api/pm/stop') {
    const body = await readBody(req);
    const toolName = body.tool;
    if (!toolName) {
      json(res, { error: 'Missing tool name' }, 400);
      return;
    }
    try {
      const result = pm.stopTool(toolName);
      json(res, { ok: true, ...result });
      setTimeout(refreshState, 500);
    } catch (err) {
      json(res, { ok: false, error: err.message }, 400);
    }
    return;
  }

  // ── API: PM — start all tools ──
  if (req.method === 'POST' && url.pathname === '/api/pm/up') {
    try {
      const rootArgs = SPRINT_ROOT ? ['--root', resolve(SPRINT_ROOT)] : [];
      const results = pm.up(['all'], rootArgs);
      json(res, { ok: true, results });
      setTimeout(refreshState, 2000);
    } catch (err) {
      json(res, { ok: false, error: err.message }, 500);
    }
    return;
  }

  // ── API: PM — stop all tools ──
  if (req.method === 'POST' && url.pathname === '/api/pm/down') {
    try {
      const results = pm.down();
      json(res, { ok: true, results });
      setTimeout(refreshState, 500);
    } catch (err) {
      json(res, { ok: false, error: err.message }, 500);
    }
    return;
  }

  // ── API: PM — ps (process status) ──
  if (req.method === 'GET' && url.pathname === '/api/pm/ps') {
    try {
      const results = await pm.ps();
      json(res, { ok: true, processes: results });
    } catch (err) {
      json(res, { ok: false, error: err.message }, 500);
    }
    return;
  }

  // ── API: scaffold ──
  if (req.method === 'POST' && url.pathname === '/api/scaffold') {
    const body = await readBody(req);
    if (!body.path) {
      json(res, { error: 'Missing path' }, 400);
      return;
    }
    const result = scaffold(body.path, body);
    json(res, result, result.ok ? 200 : 400);
    return;
  }

  // ── Static files ──
  const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const resolved = resolve(PUBLIC_DIR, `.${filePath}`);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  if (existsSync(resolved) && statSync(resolved).isFile()) {
    const ext = extname(resolved);
    const content = readFileSync(resolved);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\ngrainulation: ${signal} received, shutting down...`);
  for (const res of sseClients) {
    try {
      res.end();
    } catch {}
  }
  sseClients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ─────────────────────────────────────────────────────────────────────

refreshState();

server.listen(PORT, '127.0.0.1', () => {
  vlog('listen', `port=${PORT}`);
  const installed = state.ecosystem.filter((t) => t.installed).length;
  console.log(`grainulation: serving on http://localhost:${PORT}`);
  console.log(`  tools: ${installed}/${TOOLS.length} installed`);
  console.log(
    `  doctor: ${state.doctorResults.summary.pass} pass, ${state.doctorResults.summary.warning} warn, ${state.doctorResults.summary.fail} fail`,
  );
});
