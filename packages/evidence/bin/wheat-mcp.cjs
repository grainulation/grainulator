#!/usr/bin/env node
/**
 * wheat-mcp (CJS) — Dedicated MCP server entry point
 *
 * CJS wrapper that dynamically imports the ESM serve-mcp module.
 * Claude Code's plugin transport reliably keeps CJS-spawned processes
 * alive but drops ESM processes. This file bridges the gap.
 */

const dirIdx = process.argv.indexOf("--dir");
const dir =
	dirIdx !== -1 && process.argv[dirIdx + 1]
		? process.argv[dirIdx + 1]
		: process.cwd();

// Dynamic import of ESM module from CJS
import("../lib/serve-mcp.js").then((mod) => {
	mod.startServer(dir);
});
