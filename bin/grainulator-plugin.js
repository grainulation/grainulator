#!/usr/bin/env node
import {loadWorkspace} from '../lib/workspace-config.js';

// Codex Agent Plugins start MCP inside the plugin directory, not the project.
// Bind explicitly instead of guessing a workspace or weakening path containment.
if (Number(process.versions.node.split('.')[0]) < 24) {
  process.stderr.write(`Grainulator requires Node.js 24 or later (25 preferred); found ${process.version}. Restart Codex with a supported Node.js on PATH.\n`);
  process.exitCode = 1;
} else {
  let selected;
  let configurationError;
  try { selected = loadWorkspace().workspace; }
  catch (error) { configurationError = `${error.message} Configure an absolute GRAINULATOR_WORKSPACE or use grainulator setup --dir /absolute/project. No workspace files were accessed.`; }
  if (configurationError) process.stderr.write(`Grainulator configuration required: ${configurationError}\n`);
  const {startServer} = await import('../lib/grainulator-mcp.js');
  startServer({dir: configurationError ? process.cwd() : selected, configurationError});
}
