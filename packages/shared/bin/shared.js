#!/usr/bin/env node
/**
 * shared — CLI for grainulation/shared tools
 *
 * Usage:
 *   grainulator utils <command> [options]
 *
 * Commands:
 *   detect-sprints    Find sprint directories in a repo
 *   generate-manifest Build .grainulator/evidence/manifest.json topic map
 *   help              Show this help message
 *
 * Zero npm dependencies (Node built-in only).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fork } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, "..", "tools");


// ── --version / -v ───────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const command = args[0];
if (command === "serve") {
  console.error("The component browser dashboard has been retired. Use the CLI or MCP tools.");
  process.exit(1);
}

if (command === "--version" || command === "-v") {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  );
  console.log(pkg.version);
  process.exit(0);
}

const verbose = process.argv.includes("--verbose");
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] shared: ${a.join(" ")}\n`);
}
export { vlog, verbose };

const commands = {
  "detect-sprints": "detect-sprints.js",
  "generate-manifest": "generate-manifest.js",
};

vlog("startup", `command=${command || "(none)"}`, `cwd=${process.cwd()}`);

if (
  !command ||
  command === "help" ||
  command === "--help" ||
  command === "-h"
) {
  console.log(`grainulator utils — local tools for structured research

Usage:
  grainulator utils <command> [options]

Commands:
  detect-sprints               Find sprint directories in a repo
  generate-manifest            Build .grainulator/evidence/manifest.json topic map
  help                         Show this help message

Examples:
  grainulator utils detect-sprints --json
  grainulator utils detect-sprints --active
  grainulator utils generate-manifest --root /path/to/repo

Options:
  --version, -v   Print version and exit
  --verbose        Enable verbose logging to stderr

Zero npm dependencies. Node built-in only.`);
  process.exit(0);
}

if (commands[command]) {
  const toolPath = join(TOOLS_DIR, commands[command]);
  const child = fork(toolPath, args.slice(1), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.error(`shared: unknown command: ${command}`);
  console.error(`Run "shared help" for available commands.`);
  process.exit(1);
}
