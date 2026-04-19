#!/usr/bin/env node
/**
 * Sync version: package.json is the source of truth.
 * Writes the same version into .claude-plugin/plugin.json and .claude-plugin/marketplace.json (plugin entry).
 * Fails with non-zero exit if files are missing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;

const pluginPath = resolve(root, ".claude-plugin/plugin.json");
const marketPath = resolve(root, ".claude-plugin/marketplace.json");

function writeJSON(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, "\t") + "\n");
}

const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
if (plugin.version !== version) {
  plugin.version = version;
  writeJSON(pluginPath, plugin);
  console.log(`plugin.json: ${version}`);
}

const market = JSON.parse(readFileSync(marketPath, "utf8"));
let changed = false;
for (const p of market.plugins || []) {
  if (p.name === "grainulator" && p.version !== version) {
    p.version = version;
    changed = true;
  }
}
if (changed) {
  writeJSON(marketPath, market);
  console.log(`marketplace.json: ${version}`);
}

console.log(`synced to ${version}`);
