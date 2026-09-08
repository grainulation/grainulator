#!/usr/bin/env node
/**
 * wheat-mcp — Dedicated MCP server entry point
 *
 * Skips the CLI dispatch chain (bin/wheat.js) and starts the MCP server
 * directly. This avoids the async import overhead, install-prompt, and
 * arg parsing that can cause connection timeouts in Claude Code's
 * plugin transport (30s stdio initialization timeout).
 *
 * Usage:
 *   node bin/wheat-mcp.js [--dir <path>]
 *   npx -y -p @grainulation/wheat wheat-mcp [--dir <path>]
 *
 * Zero npm dependencies.
 */

import { startServer } from "../lib/serve-mcp.js";

const dirIdx = process.argv.indexOf("--dir");
const dir =
	dirIdx !== -1 && process.argv[dirIdx + 1]
		? process.argv[dirIdx + 1]
		: process.cwd();

startServer(dir);
