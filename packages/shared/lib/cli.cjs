/**
 * cli.cjs — CommonJS mirror of lib/cli.js.
 */

"use strict";

const fs = require("node:fs");

let _verbose = false;

function setVerbose(on) {
  _verbose = Boolean(on);
}

function vlog(name, ...args) {
  if (!_verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] ${name} ${args.join(" ")}\n`);
}

function parseFlags(argv = process.argv.slice(2)) {
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

function flag(name, argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  return flags[name];
}

function flagList(name, argv = process.argv.slice(2)) {
  const value = flag(name, argv);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function isFlag(s) {
  return typeof s === "string" && s.startsWith("--");
}

module.exports = {
  parseFlags,
  flag,
  flagList,
  loadJSON,
  setVerbose,
  vlog,
  isFlag,
};
