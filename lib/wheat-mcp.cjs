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
const path = require("node:path");
const os = require("node:os");

const home = os.homedir();
const nvmDir = process.env.NVM_DIR || path.join(home, ".nvm");
const extraPaths = [
	"/usr/local/bin",
	"/opt/homebrew/bin",
	path.join(home, ".volta", "bin"),
];
try {
	const versions = require("node:fs").readdirSync(
		path.join(nvmDir, "versions", "node"),
	);
	for (const v of versions) {
		extraPaths.push(path.join(nvmDir, "versions", "node", v, "bin"));
	}
} catch {}

const child = spawn(
	"npx",
	["-y", "@grainulation/wheat", "mcp", "--dir", process.cwd()],
	{
		stdio: ["pipe", "pipe", "inherit"],
		env: {
			...process.env,
			PATH:
				extraPaths.join(path.delimiter) +
				path.delimiter +
				(process.env.PATH || ""),
		},
	},
);

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

child.on("close", (code) => process.exit(code || 0));
child.on("error", (err) => {
	process.stderr.write(`wheat-mcp proxy error: ${err.message}\n`);
	process.exit(1);
});
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
