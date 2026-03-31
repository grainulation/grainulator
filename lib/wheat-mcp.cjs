#!/usr/bin/env node
/**
 * CJS MCP proxy for wheat.
 *
 * Claude Code's plugin transport drops ESM-based MCP servers.
 * Mill and silo (CJS) work fine. This CJS script spawns wheat's
 * MCP server as a child process and pipes stdin/stdout.
 *
 * Bundled in the grainulator plugin, invoked via ${CLAUDE_PLUGIN_ROOT}.
 */

const { spawn } = require("node:child_process");

const dir = process.env.WHEAT_ROOT
	? require("node:path").resolve(process.cwd(), process.env.WHEAT_ROOT)
	: process.cwd();

const child = spawn("npx", ["-y", "@grainulation/wheat", "mcp", "--dir", dir], {
	stdio: ["pipe", "pipe", "inherit"],
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

child.on("close", (code) => process.exit(code || 0));
child.on("error", (err) => {
	process.stderr.write(`wheat-mcp proxy error: ${err.message}\n`);
	process.exit(1);
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
