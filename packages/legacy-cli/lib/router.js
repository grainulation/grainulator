const { execFileSync, spawn } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { getByName, getInstallable } = require('./ecosystem');

/**
 * Intent-based router.
 *
 * Given a command or nothing at all, figure out where to send the user.
 */

const DELEGATE_COMMANDS = new Set(getInstallable().map((t) => t.name));

function overviewData() {
  const { TOOLS } = require('./ecosystem');
  return {
    name: 'grainulation',
    description: 'Structured research for decisions that satisfice.',
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      package: tool.package,
      role: tool.role,
      category: tool.category,
      installed: isInstalled(tool.package),
    })),
    commands: ['up', 'down', 'ps', 'init', 'status', 'doctor', '<tool>'],
  };
}

function overview() {
  const { TOOLS } = require('./ecosystem');
  const lines = [
    '',
    '  \x1b[1;33mgrainulation\x1b[0m',
    '  Structured research for decisions that satisfice.',
    '',
    '  \x1b[2mEcosystem:\x1b[0m',
    '',
  ];

  for (const tool of TOOLS) {
    const installed = isInstalled(tool.package);
    const marker = installed ? '\x1b[32m+\x1b[0m' : '\x1b[2m-\x1b[0m';
    const port = tool.port ? `:${tool.port}` : '';
    lines.push(`    ${marker} \x1b[1m${tool.name.padEnd(12)}\x1b[0m ${tool.role.padEnd(28)} \x1b[2m${port}\x1b[0m`);
  }

  lines.push('');
  lines.push('  \x1b[2mProcess management:\x1b[0m');
  lines.push('    grainulation up [tools]  Start tool servers (default: wheat)');
  lines.push('    grainulation down        Stop all running tools');
  lines.push('    grainulation ps          Show running tools, ports, health');
  lines.push('');
  lines.push('  \x1b[2mWorkflow:\x1b[0m');
  lines.push('    grainulation init        Detect context and start a research sprint');
  lines.push('    grainulation status      Cross-tool status: sprints, claims, services');
  lines.push('    grainulation doctor      Check ecosystem health (install detection)');
  lines.push('    grainulation <tool>      Delegate to a grainulation tool');
  lines.push('');
  lines.push('  \x1b[2mStart here:\x1b[0m');
  lines.push('    grainulation up && grainulation init');
  lines.push('');

  return lines.join('\n');
}

function isInstalled(packageName) {
  try {
    if (packageName === 'grainulation') return true;
    execFileSync('npm', ['list', '-g', packageName, '--depth=0'], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    try {
      require.resolve(packageName);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Find a source checkout of a tool (sibling directory).
 * Returns the bin path if found, null otherwise.
 */
function findSourceBin(tool) {
  const shortName = tool.package.replace(/^@[^/]+\//, '');
  const candidates = [path.join(__dirname, '..', '..', shortName), path.join(process.cwd(), '..', shortName)];
  for (const dir of candidates) {
    try {
      const pkgPath = path.join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name !== tool.package) continue;
      // Find the bin entry
      if (pkg.bin) {
        const binFile = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
        if (binFile) {
          const binPath = path.resolve(dir, binFile);
          if (existsSync(binPath)) return binPath;
        }
      }
    } catch {
      // skip
    }
  }
  return null;
}

function delegate(toolName, args) {
  const tool = getByName(toolName);
  if (!tool) {
    console.error(`\x1b[31mgrainulation: unknown tool: ${toolName}\x1b[0m`);
    console.error(`Run \x1b[1mgrainulation\x1b[0m to see available tools.`);
    process.exit(1);
  }

  // Prefer source checkout if available (avoids npm registry round-trip)
  const sourceBin = findSourceBin(tool);
  let cmd, cmdArgs;
  if (sourceBin) {
    cmd = process.execPath;
    cmdArgs = [sourceBin, ...args];
  } else {
    cmd = 'npx';
    cmdArgs = [tool.package, ...args];
  }

  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: false,
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`\x1b[31mgrainulation: failed to run ${tool.package}: ${err.message}\x1b[0m`);
    console.error(`Try: npm install -g ${tool.package}`);
    process.exit(1);
  });
}

/**
 * Detect project context and route to wheat init.
 * Checks for existing claims.json, package.json, git repo, etc.
 */
function init(args, opts) {
  const json = opts?.json;
  const cwd = process.cwd();
  const hasClaims = existsSync(path.join(cwd, 'claims.json'));
  const hasCompilation = existsSync(path.join(cwd, 'compilation.json'));
  const hasGit = existsSync(path.join(cwd, '.git'));
  const hasPkg = existsSync(path.join(cwd, 'package.json'));

  if (json) {
    // Pass --json through to wheat init
    if (hasClaims && hasCompilation) {
      console.log(
        JSON.stringify({
          status: 'exists',
          directory: cwd,
          hasClaims,
          hasCompilation,
        }),
      );
      return;
    }
    if (hasClaims) {
      delegate('wheat', ['compile', '--json', ...args]);
      return;
    }
    const { detect } = require('./doctor');
    const wheatInfo = detect('@grainulation/wheat');
    if (!wheatInfo) {
      console.log(
        JSON.stringify({
          status: 'missing',
          tool: 'wheat',
          install: 'npm install -g @grainulation/wheat',
        }),
      );
      return;
    }
    delegate('wheat', ['init', '--json', ...args]);
    return;
  }

  console.log('');
  console.log('  \x1b[1;33mgrainulation init\x1b[0m');
  console.log('');

  // Context detection
  console.log('  \x1b[2mDetected context:\x1b[0m');
  console.log(`    Directory    ${cwd}`);
  console.log(`    Git repo     ${hasGit ? 'yes' : 'no'}`);
  console.log(`    package.json ${hasPkg ? 'yes' : 'no'}`);
  console.log(`    claims.json  ${hasClaims ? 'yes (existing sprint)' : 'no'}`);
  console.log('');

  if (hasClaims && hasCompilation) {
    console.log('  An active sprint already exists in this directory.');
    console.log('  To continue, use: grainulation wheat compile');
    console.log('  To start fresh, remove claims.json first.');
    console.log('');
    return;
  }

  if (hasClaims) {
    console.log('  Found claims.json but no compilation. Routing to wheat compile.');
    console.log('');
    delegate('wheat', ['compile', ...args]);
    return;
  }

  // Check if wheat is available before delegating
  const { detect } = require('./doctor');
  const wheatInfo = detect('@grainulation/wheat');
  if (!wheatInfo) {
    console.log('  wheat is not installed. Install it first:');
    console.log('    npm install -g @grainulation/wheat');
    console.log('');
    console.log('  Or run interactively:');
    console.log('    grainulation setup');
    console.log('');
    return;
  }

  // Route to wheat init
  console.log('  Routing to wheat init...');
  console.log('');
  delegate('wheat', ['init', ...args]);
}

/**
 * Cross-tool status: which tools are running, active sprints, etc.
 */
function statusData() {
  const cwd = process.cwd();
  const { detect } = require('./doctor');
  const installable = getInstallable();

  const tools = [];
  for (const tool of installable) {
    const result = detect(tool.package);
    tools.push({
      name: tool.name,
      package: tool.package,
      installed: !!result,
      version: result ? result.version : null,
      method: result ? result.method : null,
    });
  }

  const hasClaims = existsSync(path.join(cwd, 'claims.json'));
  const hasCompilation = existsSync(path.join(cwd, 'compilation.json'));
  let sprint = null;

  if (hasClaims) {
    try {
      const claimsRaw = readFileSync(path.join(cwd, 'claims.json'), 'utf-8');
      const claims = JSON.parse(claimsRaw);
      const claimList = Array.isArray(claims) ? claims : claims.claims || [];
      const byType = {};
      for (const c of claimList) {
        const t = c.type || 'unknown';
        byType[t] = (byType[t] || 0) + 1;
      }
      sprint = { claims: claimList.length, byType, compiled: hasCompilation };
    } catch {
      sprint = { error: 'claims.json found but could not be parsed' };
    }
  }

  return {
    directory: cwd,
    tools,
    sprint,
    services: {},
  };
}

function status(opts) {
  if (opts?.json) {
    console.log(JSON.stringify(statusData()));
    return;
  }

  const cwd = process.cwd();
  const { detect } = require('./doctor');

  console.log('');
  console.log('  \x1b[1;33mgrainulation status\x1b[0m');
  console.log('');

  // Installed tools
  console.log('  \x1b[2mInstalled tools:\x1b[0m');
  const installable = getInstallable();
  let installedCount = 0;
  for (const tool of installable) {
    const result = detect(tool.package);
    if (result) {
      installedCount++;
      console.log(`    \x1b[32m+\x1b[0m ${tool.name.padEnd(12)} v${result.version} \x1b[2m(${result.method})\x1b[0m`);
    }
  }
  if (installedCount === 0) {
    console.log('    \x1b[2m(none)\x1b[0m');
  }
  console.log('');

  // Active sprint detection
  console.log('  \x1b[2mCurrent directory:\x1b[0m');
  console.log(`    ${cwd}`);
  console.log('');

  const hasClaims = existsSync(path.join(cwd, 'claims.json'));
  const hasCompilation = existsSync(path.join(cwd, 'compilation.json'));

  if (hasClaims) {
    try {
      const claimsRaw = readFileSync(path.join(cwd, 'claims.json'), 'utf-8');
      const claims = JSON.parse(claimsRaw);
      const claimList = Array.isArray(claims) ? claims : claims.claims || [];
      const total = claimList.length;
      const byType = {};
      for (const c of claimList) {
        const t = c.type || 'unknown';
        byType[t] = (byType[t] || 0) + 1;
      }
      console.log('  \x1b[2mActive sprint:\x1b[0m');
      console.log(`    Claims       ${total}`);
      const typeStr = Object.entries(byType)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (typeStr) {
        console.log(`    Breakdown    ${typeStr}`);
      }
      if (hasCompilation) {
        console.log('    Compiled     yes');
      } else {
        console.log('    Compiled     no (run: grainulation wheat compile)');
      }
    } catch {
      console.log('  \x1b[2mActive sprint:\x1b[0m');
      console.log('    claims.json found but could not be parsed');
    }
  } else {
    console.log('  \x1b[2mNo active sprint in this directory.\x1b[0m');
    console.log('  Start one with: grainulation init');
  }

  console.log('');
}

function route(args, opts) {
  const command = args[0];
  const rest = args.slice(1);
  const json = opts?.json;

  // No args — show overview
  if (!command) {
    if (json) {
      console.log(JSON.stringify(overviewData()));
    } else {
      console.log(overview());
    }
    return;
  }

  // Built-in commands
  if (command === 'doctor') {
    require('./doctor').run({ json });
    return;
  }
  if (command === 'setup') {
    require('./setup').run();
    return;
  }
  if (command === 'init') {
    init(rest, { json });
    return;
  }
  if (command === 'status') {
    status({ json });
    return;
  }

  // Process management
  if (command === 'up') {
    pmUp(rest, { json });
    return;
  }
  if (command === 'down') {
    pmDown(rest, { json });
    return;
  }
  if (command === 'ps') {
    pmPs({ json });
    return;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    if (json) {
      console.log(JSON.stringify(overviewData()));
    } else {
      console.log(overview());
    }
    return;
  }
  if (command === '--version' || command === '-v') {
    const pkg = require('../package.json');
    if (json) {
      console.log(JSON.stringify({ version: pkg.version }));
    } else {
      console.log(`grainulation v${pkg.version}`);
    }
    return;
  }

  // Delegate to a tool — pass --json through
  if (DELEGATE_COMMANDS.has(command)) {
    const delegateArgs = json ? ['--json', ...rest] : rest;
    delegate(command, delegateArgs);
    return;
  }

  // Unknown
  if (json) {
    console.log(JSON.stringify({ error: `unknown command: ${command}` }));
    process.exit(1);
  }
  console.error(`\x1b[31mgrainulation: unknown command: ${command}\x1b[0m`);
  console.log(overview());
  process.exit(1);
}

// --- Process management commands ---

function pmUp(args, opts) {
  const pm = require('./pm');
  const toolNames = args.filter((a) => !a.startsWith('-'));
  const results = pm.up(toolNames.length > 0 ? toolNames : undefined);

  if (opts?.json) {
    console.log(JSON.stringify(results));
    return;
  }

  console.log('');
  console.log('  \x1b[1;33mgrainulation up\x1b[0m');
  console.log('');

  for (const r of results) {
    if (r.error) {
      console.log(`    \x1b[31mx\x1b[0m ${r.name.padEnd(12)} ${r.error}`);
    } else if (r.alreadyRunning) {
      console.log(`    \x1b[33m~\x1b[0m ${r.name.padEnd(12)} already running (pid ${r.pid}, port ${r.port})`);
    } else {
      console.log(`    \x1b[32m+\x1b[0m ${r.name.padEnd(12)} started (pid ${r.pid}, port ${r.port})`);
    }
  }

  console.log('');

  // Wait a moment then probe health
  setTimeout(async () => {
    const statuses = await pm.ps();
    const running = statuses.filter((s) => s.alive);
    if (running.length > 0) {
      console.log('  \x1b[2mHealth check:\x1b[0m');
      for (const s of running) {
        console.log(`    \x1b[32m+\x1b[0m ${s.name.padEnd(12)} :${s.port} (${s.latencyMs}ms)`);
      }
      console.log('');
    }
  }, 2000);
}

function pmDown(args, opts) {
  const pm = require('./pm');
  const toolNames = args.filter((a) => !a.startsWith('-'));
  const results = pm.down(toolNames.length > 0 ? toolNames : undefined);

  if (opts?.json) {
    console.log(JSON.stringify(results));
    return;
  }

  console.log('');
  console.log('  \x1b[1;33mgrainulation down\x1b[0m');
  console.log('');

  let stoppedAny = false;
  for (const r of results) {
    if (r.stopped) {
      stoppedAny = true;
      console.log(`    \x1b[31m-\x1b[0m ${r.name.padEnd(12)} stopped (pid ${r.pid})`);
    }
  }

  if (!stoppedAny) {
    console.log('    \x1b[2mNo running tools to stop.\x1b[0m');
  }

  console.log('');
}

async function pmPs(opts) {
  const pm = require('./pm');
  const statuses = await pm.ps();

  if (opts?.json) {
    console.log(JSON.stringify(statuses));
    return;
  }

  console.log('');
  console.log('  \x1b[1;33mgrainulation ps\x1b[0m');
  console.log('');

  const running = statuses.filter((s) => s.alive);
  const stopped = statuses.filter((s) => !s.alive);

  if (running.length > 0) {
    console.log('  \x1b[2mRunning:\x1b[0m');
    for (const s of running) {
      const pidStr = s.pid ? `pid ${s.pid}` : 'unknown pid';
      const latency = s.latencyMs ? `${s.latencyMs}ms` : '';
      console.log(
        `    \x1b[32m+\x1b[0m ${s.name.padEnd(12)} :${String(s.port).padEnd(6)} ${pidStr.padEnd(14)} ${latency}`,
      );
    }
    console.log('');
  }

  if (stopped.length > 0) {
    console.log('  \x1b[2mStopped:\x1b[0m');
    for (const s of stopped) {
      console.log(`    \x1b[2m- ${s.name.padEnd(12)} :${s.port}\x1b[0m`);
    }
    console.log('');
  }

  if (running.length === 0) {
    console.log('  \x1b[2mNo tools running. Start with: grainulation up\x1b[0m');
    console.log('');
  }
}

module.exports = {
  route,
  overview,
  overviewData,
  isInstalled,
  delegate,
  init,
  status,
  statusData,
  pmUp,
  pmDown,
  pmPs,
};
