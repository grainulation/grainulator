/**
 * @grainulation/barn — public API surface
 *
 * Exports:
 *   name, version          — package metadata
 *   loadTemplates(dir)     — scan a directory for .html templates + .json sidecars
 *   detectSprints(root)    — git-based sprint detection (re-export)
 *   generateManifest(opts) — build wheat-manifest.json topic map (re-export)
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

export const name = pkg.name;
export const version = pkg.version;

/**
 * Scan a directory for .html templates and optional .json sidecar metadata.
 * Pure function — no side effects, no logging, no server state.
 *
 * @param {string} templatesDir — absolute path to the templates directory
 * @returns {Array<object>} — array of template metadata objects
 */
export function loadTemplates(templatesDir) {
  const templates = [];
  if (!existsSync(templatesDir)) return templates;

  for (const file of readdirSync(templatesDir)) {
    if (!file.endsWith(".html")) continue;
    const filePath = join(templatesDir, file);
    const content = readFileSync(filePath, "utf8");
    const tplName = file.replace(".html", "");

    // Extract placeholders
    const placeholders = [...new Set(content.match(/\{\{[A-Z_]+\}\}/g) || [])];

    // Extract description from first comment
    const commentMatch = content.match(/<!--\s*(.*?)\s*-->/);
    let description = commentMatch ? commentMatch[1] : "";

    // Count lines and size
    const lines = content.split("\n").length;
    const size = statSync(filePath).size;

    // Detect features
    const features = [];
    if (content.includes("scroll-snap")) features.push("scroll-snap");
    if (content.includes("@media")) features.push("responsive");
    if (content.includes("var(--")) features.push("css-variables");
    if (content.includes("<table")) features.push("tables");
    if (content.includes(".card")) features.push("cards");
    if (content.includes(".slide")) features.push("slides");

    // Merge optional template.json metadata
    const metaPath = join(templatesDir, tplName + ".json");
    let title = tplName;
    let tags = [];
    let author = "";
    let tplVersion = "";
    let exportPresets = [];
    let seedPacks = [];
    let scaffoldConfig = null;
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        if (meta.title) title = meta.title;
        if (meta.description) description = meta.description;
        if (Array.isArray(meta.tags)) tags = meta.tags;
        if (meta.author) author = meta.author;
        if (meta.version) tplVersion = meta.version;
        if (Array.isArray(meta.exportPresets))
          exportPresets = meta.exportPresets;
        if (Array.isArray(meta.seedPacks)) seedPacks = meta.seedPacks;
        if (meta.scaffoldConfig && typeof meta.scaffoldConfig === "object")
          scaffoldConfig = meta.scaffoldConfig;
      } catch {
        // skip malformed sidecar
      }
    }

    templates.push({
      name: tplName,
      file,
      title,
      placeholders,
      description,
      lines,
      size,
      features,
      tags,
      author,
      version: tplVersion,
      exportPresets,
      seedPacks,
      scaffoldConfig,
    });
  }
  return templates;
}

// Re-export tools
export { detectSprints } from "../tools/detect-sprints.js";
export { generateManifest } from "../tools/generate-manifest.js";

// Shared utilities — absorbed from duplicated code across the ecosystem.
// See claims r100–r117 in the dedup-barn-absorb sprint.
export {
  jsonRpcResponse,
  jsonRpcError,
  JSON_RPC_ERRORS,
  parseJsonRpc,
  buildInitializeResult,
} from "./mcp.js";

export {
  isInsideDir,
  resolveSafe,
  assertInsideDir,
  relativeInside,
} from "./paths.js";

export { atomicWrite, atomicWriteJSON } from "./atomic.js";

export {
  parseFlags,
  flag,
  flagList,
  loadJSON,
  setVerbose,
  vlog,
  isFlag,
} from "./cli.js";

export {
  PHASE_PREFIXES,
  PHASE_NAMES,
  isValidPhase,
  phaseFromClaimId,
  prefixForPhase,
} from "./phases.js";

export {
  loadSprintClaims,
  loadSprintCompilation,
  sprintSummary,
  summarize,
} from "./sprints.js";
