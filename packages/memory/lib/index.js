/**
 * index.js — Unified entry point for @grainulation/silo
 *
 * Re-exports all public modules so consumers can import from a single path.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export { Store, DEFAULT_SILO_DIR, DEFAULT_MEMORY_DIR, resolveMemoryDir } from "./store.js";
export { Search } from "./search.js";
export { Packs } from "./packs.js";
export { ImportExport } from "./import-export.js";
export { Templates } from "./templates.js";
export { Graph } from "./graph.js";
export { Confluence } from "./confluence.js";
export { smartFetch } from "./smart-fetch.js";
export { FetchCache, DEFAULT_CACHE_DIR } from "./fetch-cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

export const name = "silo";
export const version = pkg.version;
export const description = pkg.description;
