#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Codex Agent Plugins start MCP inside the plugin directory, not the project.
// Bind explicitly instead of guessing a workspace or weakening path containment.
if (Number(process.versions.node.split('.')[0]) < 24) {
  process.stderr.write(`Grainulator requires Node.js 24 or later (25 preferred); found ${process.version}. Restart Codex with a supported Node.js on PATH.\n`);
  process.exitCode = 1;
} else {
  const selected = process.env.GRAINULATOR_WORKSPACE;
  let configurationError;
  if (!selected || !path.isAbsolute(selected)) {
    configurationError = 'Set GRAINULATOR_WORKSPACE to an absolute project directory before starting Codex, for example GRAINULATOR_WORKSPACE=/absolute/project codex. Restart the host after setting it. No workspace files were accessed.';
  } else {
    try {
      if (!fs.statSync(selected).isDirectory()) throw new Error('not a directory');
    } catch {
      configurationError = `GRAINULATOR_WORKSPACE must name an existing project directory: ${selected}. Restart Codex with a valid workspace. No workspace files were accessed.`;
    }
  }
  if (configurationError) process.stderr.write(`Grainulator configuration required: ${configurationError}\n`);
  const {startServer} = await import('../lib/grainulator-mcp.js');
  startServer({dir: configurationError ? process.cwd() : selected, configurationError});
}
