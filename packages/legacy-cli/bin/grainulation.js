#!/usr/bin/env node

/**
 * grainulation
 *
 * The unified entry point for the grainulation ecosystem.
 * Routes to the right tool based on what you need.
 *
 * Usage:
 *   grainulation                  Show ecosystem overview
 *   grainulation doctor           Check which tools are installed
 *   grainulation setup            Interactive setup wizard
 *   grainulation serve            Start the ecosystem control center
 *   grainulation <tool> [args]    Delegate to a grainulation tool
 */

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const jsonMode = process.argv.includes('--json');
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] grainulation: ${a.join(' ')}\n`);
}

const command = process.argv[2];
vlog('startup', `command=${command || '(none)'}`, `cwd=${process.cwd()}`);

// Serve command — start the HTTP server (ESM module)
if (command === 'serve') {
  const path = require('node:path');
  const { spawn } = require('node:child_process');
  const serverPath = path.join(__dirname, '..', 'lib', 'server.mjs');

  // Forward remaining args to the server
  const serverArgs = process.argv.slice(3);
  const child = spawn(process.execPath, [serverPath, ...serverArgs], {
    stdio: 'inherit',
  });

  child.on('close', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error(`grainulation: failed to start server: ${err.message}`);
    process.exit(1);
  });
} else {
  const { route } = require('../lib/router');
  // Strip --json from args before routing (it's handled as a mode flag)
  const args = process.argv.slice(2).filter((a) => a !== '--json');
  route(args, { json: jsonMode });
}
