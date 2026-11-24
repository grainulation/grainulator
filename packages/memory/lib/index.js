// Generated from typescript/packages/memory/lib/index.ts; edit that source and run npm run build:types.
/**
 * index.js — Unified entry point for @grainulation/grainulator-memory
 *
 * Re-exports all public modules so consumers can import from a single path.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export { Confluence } from "./confluence.js";
export { DEFAULT_CACHE_DIR, FetchCache } from "./fetch-cache.js";
export { Graph } from "./graph.js";
export { ImportExport } from "./import-export.js";
export { Packs } from "./packs.js";
export { Search } from "./search.js";
export { smartFetch } from "./smart-fetch.js";
export { DEFAULT_MEMORY_DIR, resolveMemoryDir, Store } from "./store.js";
export { Templates } from "./templates.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);
export const name = "memory";
export const version = pkg.version;
export const description = pkg.description;
