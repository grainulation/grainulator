/**
 * Legacy process cleanup — stop and inspect previously launched tools.
 *
 * The component HTTP dashboards are retired. This module only inspects and
 * stops historical processes; startup entry points report retirement.
 */

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const http = require('node:http');
const { getInstallable } = require('./ecosystem');

// PID tracking directory
const PM_DIR = join(require('node:os').homedir(), '.grainulation');
const PID_DIR = join(PM_DIR, 'pids');
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

/** Retired browser apps cannot be relaunched. Historical PIDs remain inspectable. */
function startTool() {
  throw new Error(
    'The component browser dashboard has been retired. Use the CLI or MCP tools; grainulator preview starts the local research playground.',
  );
}

/**
 * Verify that a running PID matches the expected tool package or command.
 */
function isOwnedToolProcess(pid, toolName) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    }).toLowerCase();
    const shortName = toolName.toLowerCase();
    return cmd.includes(shortName) || cmd.includes(`@grainulation/${shortName}`);
  } catch {
    return false;
  }
}

/**
 * Stop a tool by killing its PID.
 * Only stops verified owned processes tracked by PID file.
 */
function stopTool(toolName) {
  const pid = readPid(toolName);
  if (!pid) return { stopped: false, reason: 'not running' };

  if (!isOwnedToolProcess(pid, toolName)) {
    removePid(toolName);
    return { stopped: false, reason: 'unmatched process' };
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
 * Report retirement for requested startup operations, without launching tools.
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
