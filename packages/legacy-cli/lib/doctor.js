const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { getInstallable } = require('./ecosystem');

/**
 * Health check.
 *
 * Scans the system for installed grainulation tools using multiple
 * detection methods: global npm, npx cache, local node_modules,
 * source checkout, and npx --no-install availability.
 */

/**
 * Try to detect a package via global npm install.
 * Returns { version, method } or null.
 */
function checkGlobal(packageName) {
  try {
    const out = execFileSync('npm', ['list', '-g', packageName, '--depth=0'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 5000,
    });
    const match = out.match(new RegExp(`${escapeRegex(packageName)}@(\\S+)`));
    return match ? { version: match[1], method: 'global' } : null;
  } catch {
    return null;
  }
}

/**
 * Check if the package exists in the npx cache (_npx directories).
 * Returns { version, method } or null.
 */
function checkNpxCache(packageName) {
  try {
    const prefix = execFileSync('npm', ['config', 'get', 'cache'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const npxDir = path.join(prefix, '_npx');
    if (!existsSync(npxDir)) return null;

    // npx cache has hash-named directories, each with node_modules
    const entries = readdirSync(npxDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgJson = path.join(npxDir, entry.name, 'node_modules', packageName, 'package.json');
      if (existsSync(pkgJson)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
          return { version: pkg.version || 'installed', method: 'npx cache' };
        } catch {
          return { version: 'installed', method: 'npx cache' };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if the package exists in local node_modules (project-level install).
 * Returns { version, method } or null.
 */
function checkLocal(packageName) {
  try {
    const pkgJson = path.join(process.cwd(), 'node_modules', packageName, 'package.json');
    if (existsSync(pkgJson)) {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
      return { version: pkg.version || 'installed', method: 'local' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if the package is being run from a source/git checkout.
 * Looks for package.json in common source locations.
 * Returns { version, method } or null.
 */
function checkSource(packageName) {
  const candidates = [
    // Sibling directory (monorepo or co-located checkouts)
    path.join(process.cwd(), '..', packageName.replace(/^@[^/]+\//, '')),
    path.join(process.cwd(), '..', packageName.replace(/^@[^/]+\//, ''), 'package.json'),
    // Packages dir (monorepo)
    path.join(process.cwd(), 'packages', packageName.replace(/^@[^/]+\//, '')),
  ];
  for (const candidate of candidates) {
    const pkgJson = candidate.endsWith('package.json') ? candidate : path.join(candidate, 'package.json');
    if (existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
        if (pkg.name === packageName) {
          return { version: pkg.version || 'installed', method: 'source' };
        }
      } catch {
        // not a match, continue
      }
    }
  }
  return null;
}

/**
 * Try `npx --no-install <package> --version` to check availability
 * without downloading anything.
 * Returns { version, method } or null.
 */
function checkNpxNoInstall(packageName) {
  try {
    const out = execFileSync('npx', ['--no-install', packageName, '--version'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    // Expect a version-like string
    const match = out.match(/v?(\d+\.\d+\.\d+\S*)/);
    return match ? { version: match[1], method: 'npx' } : null;
  } catch {
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect a package using all available methods, in priority order.
 * Returns { version, method } or null.
 */
function detect(packageName) {
  return (
    checkGlobal(packageName) ||
    checkNpxCache(packageName) ||
    checkLocal(packageName) ||
    checkSource(packageName) ||
    checkNpxNoInstall(packageName)
  );
}

/**
 * Legacy API: returns version string or null.
 * Kept for backward compatibility with tests.
 */
function getVersion(packageName) {
  const result = detect(packageName);
  return result ? result.version : null;
}

function getNodeVersion() {
  return process.version;
}

function getNpmVersion() {
  try {
    return execFileSync('npm', ['--version'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'not found';
  }
}

function getPnpmVersion() {
  try {
    return execFileSync('pnpm', ['--version'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function getBiomeVersion() {
  try {
    const out = execFileSync('npx', ['biome', '--version'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const match = out.match(/(\d+\.\d+\.\d+\S*)/);
    return match ? match[1] : out;
  } catch {
    return null;
  }
}

function getHooksPath() {
  try {
    return execFileSync('git', ['config', 'core.hooksPath'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function run(opts) {
  const json = opts?.json;
  const tools = getInstallable();

  const pnpmVersion = getPnpmVersion();
  const biomeVersion = getBiomeVersion();
  const hooksPath = getHooksPath();

  if (json) {
    const toolResults = [];
    for (const tool of tools) {
      const result = detect(tool.package);
      toolResults.push({
        name: tool.name,
        package: tool.package,
        installed: !!result,
        version: result ? result.version : null,
        method: result ? result.method : null,
      });
    }
    console.log(
      JSON.stringify({
        environment: {
          node: getNodeVersion(),
          npm: getNpmVersion(),
          pnpm: pnpmVersion,
          biome: biomeVersion,
          hooksPath: hooksPath,
        },
        tools: toolResults,
        installed: toolResults.filter((t) => t.installed).length,
        missing: toolResults.filter((t) => !t.installed).length,
      }),
    );
    return;
  }

  let installed = 0;
  let missing = 0;

  console.log('');
  console.log('  \x1b[1;33mgrainulation doctor\x1b[0m');
  console.log('  Checking ecosystem health...');
  console.log('');

  // Environment
  console.log('  \x1b[2mEnvironment:\x1b[0m');
  console.log(`    Node     ${getNodeVersion()}`);
  console.log(`    npm      v${getNpmVersion()}`);
  if (pnpmVersion) {
    console.log(`    pnpm     v${pnpmVersion}`);
  } else {
    console.log('    pnpm     \x1b[2mnot found\x1b[0m');
  }
  console.log('');

  // DX tooling
  console.log('  \x1b[2mDX tooling:\x1b[0m');
  if (biomeVersion) {
    console.log(`    \x1b[32m\u2713\x1b[0m Biome     v${biomeVersion}`);
  } else {
    console.log('    \x1b[2m\u2717 Biome     not found (pnpm install to set up)\x1b[0m');
  }
  if (hooksPath) {
    console.log(`    \x1b[32m\u2713\x1b[0m Git hooks  ${hooksPath}`);
  } else {
    console.log('    \x1b[2m\u2717 Git hooks  not configured (run: git config core.hooksPath .githooks)\x1b[0m');
  }
  console.log('');

  // Tools
  console.log('  \x1b[2mTools:\x1b[0m');
  for (const tool of tools) {
    const result = detect(tool.package);
    if (result) {
      installed++;
      const ver = `v${result.version}`.padEnd(10);
      console.log(`    \x1b[32m\u2713\x1b[0m ${tool.name.padEnd(12)} ${ver} \x1b[2m(${result.method})\x1b[0m`);
    } else {
      missing++;
      console.log(`    \x1b[2m\u2717 ${tool.name.padEnd(12)} --          (not found)\x1b[0m`);
    }
  }

  console.log('');

  // Summary
  if (missing === tools.length) {
    console.log('  \x1b[33mNo grainulation tools found.\x1b[0m');
    console.log('  Start with: npx @grainulation/wheat init');
  } else if (missing > 0) {
    console.log(`  \x1b[32m${installed} found\x1b[0m, \x1b[2m${missing} not found\x1b[0m`);
    console.log('  Run \x1b[1mgrainulation setup\x1b[0m to install what you need.');
  } else {
    console.log('  \x1b[32mAll tools found. Full ecosystem ready.\x1b[0m');
  }

  console.log('');
}

module.exports = {
  run,
  getVersion,
  detect,
  getPnpmVersion,
  getBiomeVersion,
  getHooksPath,
};
