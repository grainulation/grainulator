/**
 * CLI helpers — argv parsing, flag extraction, JSON loading, verbose logging.
 *
 * Minimal set of utilities every tool in the ecosystem re-implements. All
 * functions are pure + stateless; vlog is controlled by a module-level flag
 * set at CLI startup.
 *
 * Usage (ESM):
 *   import { parseFlags, flag, flagList, loadJSON, setVerbose, vlog } from "./cli.js";
 */

import { readFileSync } from "node:fs";

let _verbose = false;

/**
 * Enable or disable verbose logging. Most tools call this at CLI startup
 * based on --verbose or -v flags.
 */
export function setVerbose(on) {
  _verbose = Boolean(on);
}

/** Log a line to stderr if verbose mode is on. */
export function vlog(name, ...args) {
  if (!_verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] ${name} ${args.join(" ")}\n`);
}

/**
 * Parse argv into a flag map. Handles:
 *   --key value    → { key: "value" }
 *   --key          → { key: true }
 *   --key=value    → { key: "value" }
 *
 * Repeated keys overwrite (last wins). Positional args are ignored.
 *
 * @param {string[]} [argv] — defaults to process.argv.slice(2)
 * @returns {Record<string, string|true>}
 */
export function parseFlags(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

/**
 * Extract a single flag from argv. Returns the value or undefined.
 * Shortcut for one-off lookups without building a full flag map.
 */
export function flag(name, argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  return flags[name];
}

/**
 * Extract a comma-separated list flag. `--tags a,b,c` → ["a", "b", "c"].
 * Returns [] if the flag is missing.
 */
export function flagList(name, argv = process.argv.slice(2)) {
  const value = flag(name, argv);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read and parse a JSON file. Returns the parsed value on success, or
 * `fallback` if the file is missing or malformed.
 *
 * Use this at read-only paths (config loading, cache reads). For write
 * paths, use @grainulation/barn/atomic.
 */
export function loadJSON(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

/**
 * Detect whether a token looks like a flag. Useful when advancing argv
 * manually without calling parseFlags.
 */
export function isFlag(s) {
  return typeof s === "string" && s.startsWith("--");
}
