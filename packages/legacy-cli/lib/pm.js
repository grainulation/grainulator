/**
 * Process Manager — start, stop, and monitor grainulation tools.
 *
 * Each tool runs its own HTTP server on a known port.
 * This module spawns/kills them and probes ports for health.
 */

const { spawn, execFileSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const http = require('node:http');
const { getByName, getInstallable } = require('./ecosystem');

// PID tracking directory
const PM_DIR = join(require('node:os').homedir(), '.grainulation');
const PID_DIR = join(PM_DIR, 'pids');
const CONFIG_FILE = join(PM_DIR, 'config.json');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function ensureDirs() {
  if (!existsSync(PM_DIR)) mkdirSync(PM_DIR, { recursive: true });
  if (!existsSync(PID_DIR)) mkdirSync(PID_DIR, { recursive: true });
}

function pidFile(toolName) {
  return join(PID_DIR, `${toolName}.pid`);
}

function readPid(toolName) {
  const f = pidFile(toolName);
  if (!existsSync(f)) return null;
  try {
    const pid = parseInt(readFileSync(f, 'utf8').trim(), 10);
    if (Number.isNaN(pid)) return null;
    // Check if process is alive
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function writePid(toolName, pid) {
  ensureDirs();
  writeFileSync(pidFile(toolName), String(pid));
}

function removePid(toolName) {
  const f = pidFile(toolName);
  try {
    require('node:fs').unlinkSync(f);
  } catch {}
}

/**
 * Probe a port to check if a tool is responding.
 * Returns a promise that resolves to { alive, statusCode, latencyMs } or { alive: false }.
 */
function probe(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: timeoutMs }, (res) => {
      const latencyMs = Date.now() - start;
      // Consume body
      res.resume();
      resolve({ alive: true, statusCode: res.statusCode, latencyMs });
    });
    req.on('error', () => resolve({ alive: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ alive: false });
    });
  });
}

/**
 * Find the bin path for a tool — prefers source checkout, falls back to npx.
 */
function findBin(tool) {
  const shortName = tool.package.replace(/^@[^/]+\//, '');
  const candidates = [join(__dirname, '..', '..', shortName), join(process.cwd(), '..', shortName)];
  for (const dir of candidates) {
    try {
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.name !== tool.package) continue;
      if (pkg.bin) {
        const binFile = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
        if (binFile) {
          const binPath = require('node:path').resolve(dir, binFile);
          if (existsSync(binPath)) return { cmd: process.execPath, args: [binPath] };
        }
      }
    } catch {}
  }
  return { cmd: 'npx', args: [tool.package] };
}

/**
 * Start a tool's server. Returns { pid, port } or throws.
 */
function startTool(toolName, extraArgs = []) {
  const tool = getByName(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  if (toolName === 'grainulation') throw new Error('Use "grainulation serve" directly');

  // Check if already running
  const existing = readPid(toolName);
  if (existing) {
    return { pid: existing, port: tool.port, alreadyRunning: true };
  }

  // Auto-inject --root and --dir from config if not explicitly provided
  const hasRoot = extraArgs.includes('--root') || extraArgs.includes('--dir');
  let rootArgs = [];
  if (!hasRoot) {
    const cfg = loadConfig();
    if (cfg.sprintRoot) rootArgs = ['--root', cfg.sprintRoot, '--dir', cfg.sprintRoot];
  }

  const bin = findBin(tool);
  const args = [...bin.args, ...tool.serveCmd, '--port', String(tool.port), ...rootArgs, ...extraArgs];

  const child = spawn(bin.cmd, args, {
    stdio: 'ignore',
    detached: true,
    shell: false,
  });

  child.unref();
  writePid(toolName, child.pid);

  return { pid: child.pid, port: tool.port, alreadyRunning: false };
}

/**
 * Find a process listening on a port by checking lsof (macOS/Linux).
 * Returns the PID or null.
 */
function findPidByPort(port) {
  try {
    const out = execFileSync('lsof', ['-ti', `:${port}`], {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pids = out
      .toString()
      .trim()
      .split('\n')
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
    // Return the first PID that isn't our own process
    return pids.find((p) => p !== process.pid) || null;
  } catch {
    return null;
  }
}

/**
 * Stop a tool by killing its PID.
 * Falls back to finding the process by port if no PID file exists.
 */
function stopTool(toolName) {
  let pid = readPid(toolName);

  // Fallback: find process by port if no PID file
  if (!pid) {
    const tool = getByName(toolName);
    if (tool) pid = findPidByPort(tool.port);
    if (!pid) return { stopped: false, reason: 'not running' };
  }

  try {
    process.kill(pid, 'SIGTERM');
    removePid(toolName);
    return { stopped: true, pid };
  } catch {
    removePid(toolName);
    return { stopped: false, reason: 'process already dead' };
  }
}

/**
 * Get status of all tools — probes ports in parallel.
 */
async function ps() {
  const tools = getInstallable();
  const results = await Promise.all(
    tools.map(async (tool) => {
      const pid = readPid(tool.name);
      const health = await probe(tool.port);
      return {
        name: tool.name,
        port: tool.port,
        role: tool.role,
        pid: pid || null,
        alive: health.alive,
        latencyMs: health.latencyMs || null,
        statusCode: health.statusCode || null,
      };
    }),
  );
  return results;
}

/**
 * Start multiple tools. Default set: wheat.
 * 'all' starts everything except grainulation itself.
 */
function up(toolNames, extraArgs = []) {
  const defaults = ['wheat'];
  const names =
    !toolNames || toolNames.length === 0
      ? defaults
      : toolNames[0] === 'all'
        ? getInstallable().map((t) => t.name)
        : toolNames;

  const results = [];
  for (const name of names) {
    try {
      const r = startTool(name, extraArgs);
      results.push({ name, ...r });
    } catch (err) {
      results.push({ name, error: err.message });
    }
  }
  return results;
}

/**
 * Stop multiple tools. Default: stop all running.
 */
function down(toolNames) {
  const names = !toolNames || toolNames.length === 0 ? getInstallable().map((t) => t.name) : toolNames;

  const results = [];
  for (const name of names) {
    const r = stopTool(name);
    results.push({ name, ...r });
  }
  return results;
}

module.exports = { startTool, stopTool, ps, up, down, probe, readPid };
