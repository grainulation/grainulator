#!/usr/bin/env node
/**
 * barn — CLI for grainulation/barn tools
 *
 * Usage:
 *   barn <command> [options]
 *
 * Commands:
 *   detect-sprints    Find sprint directories in a repo
 *   generate-manifest Build wheat-manifest.json topic map
 *   build-pdf         Convert markdown to PDF via npx md-to-pdf
 *   help              Show this help message
 *
 * Zero npm dependencies (Node built-in only).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fork } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(__dirname, "..", "tools");

const LIB_DIR = join(__dirname, "..", "lib");

// ── --version / -v ───────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const command = args[0];

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
  process.stderr.write(`[${ts}] barn: ${a.join(" ")}\n`);
}
export { vlog, verbose };

const commands = {
  "detect-sprints": "detect-sprints.js",
  "generate-manifest": "generate-manifest.js",
  "build-pdf": "build-pdf.js",
  "sync-assets": "sync-assets.js",
  "llms-txt-lint": "seo/llms-txt-lint.js",
};

vlog("startup", `command=${command || "(none)"}`, `cwd=${process.cwd()}`);

if (
  !command ||
  command === "help" ||
  command === "--help" ||
  command === "-h"
) {
  console.log(`barn — open tools for structured research

Usage:
  barn <command> [options]

Commands:
  serve                        Start the template browser UI
  detect-sprints               Find sprint directories in a repo
  generate-manifest            Build wheat-manifest.json topic map
  build-pdf <file>             Convert markdown to PDF via npx md-to-pdf
  sync-assets --target <dir>   Vendor shared SEO/print primitives into a site/
  llms-txt-lint                Cross-link lint ecosystem llms.txt files
  help                         Show this help message

Examples:
  barn serve --port 9093 --root /path/to/repo
  barn detect-sprints --json
  barn detect-sprints --active
  barn generate-manifest --root /path/to/repo
  barn build-pdf output/brief.md
  barn sync-assets --target ./site
  barn llms-txt-lint

Options:
  --version, -v   Print version and exit
  --verbose        Enable verbose logging to stderr

Zero npm dependencies. Node built-in only.`);
  process.exit(0);
}

// ── serve command (lib/server.js) ──
if (command === "serve") {
  const serverPath = join(LIB_DIR, "server.js");
  const child = fork(serverPath, args.slice(1), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.on("SIGINT", () => child.kill("SIGINT"));
} else if (commands[command]) {
  const toolPath = join(TOOLS_DIR, commands[command]);
  const child = fork(toolPath, args.slice(1), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.error(`barn: unknown command: ${command}`);
  console.error(`Run "barn help" for available commands.`);
  process.exit(1);
}
