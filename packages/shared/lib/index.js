/**
 * @grainulation/grainulator-shared — public API surface
 *
 * Exports:
 *   name, version          — package metadata
 *   detectSprints(root)    — git-based sprint detection (re-export)
 *   generateManifest(opts) — build .grainulator/evidence/manifest.json topic map (re-export)
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

export const name = pkg.name;
export const version = pkg.version;

// Re-export tools
export { detectSprints } from "../tools/detect-sprints.js";
export { generateManifest } from "../tools/generate-manifest.js";

// Shared utilities — absorbed from duplicated code across the ecosystem.
// See claims r100–r117 in the dedup-shared-absorb sprint.
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
