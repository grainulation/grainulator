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
 *   grainulation <tool> [args]    Delegate to a grainulation tool
 */

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const jsonMode = process.argv.includes('--json');
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] grainulation: ${a.join(' ')}\n`);
}

const args = process.argv.slice(2).filter((a) => a !== '--json');
const command = args[0];
vlog('startup', `command=${command || '(none)'}`, `cwd=${process.cwd()}`);

if (command === 'serve' || command === 'up') {
  console.error(
    'The component browser dashboard has been retired. Use the CLI or MCP tools; grainulator preview starts the local research playground.',
  );
  process.exit(1);
}
const { route } = require('../lib/router');
route(args, { json: jsonMode });
