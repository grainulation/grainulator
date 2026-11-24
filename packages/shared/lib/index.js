// Generated from typescript/packages/shared/lib/index.ts; edit that source and run npm run build:types.
/**
 * @grainulation/grainulator-shared — public API surface
 *
 * Exports:
 *   name, version          — package metadata
 *   detectSprints(root)    — git-based sprint detection (re-export)
 *   generateManifest(opts) — build .grainulator/evidence/manifest.json topic map (re-export)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
export { atomicWrite, atomicWriteJSON } from "./atomic.js";
export {
	flag,
	flagList,
	isFlag,
	loadJSON,
	parseFlags,
	setVerbose,
	vlog,
} from "./cli.js";
// Shared utilities — absorbed from duplicated code across the ecosystem.
// See claims r100–r117 in the dedup-shared-absorb sprint.
export {
	buildInitializeResult,
	JSON_RPC_ERRORS,
	jsonRpcError,
	jsonRpcResponse,
	parseJsonRpc,
} from "./mcp.js";
export {
	assertInsideDir,
	isInsideDir,
	relativeInside,
	resolveSafe,
} from "./paths.js";
export {
	isValidPhase,
	PHASE_NAMES,
	PHASE_PREFIXES,
	phaseFromClaimId,
	prefixForPhase,
} from "./phases.js";
export {
	loadSprintClaims,
	loadSprintCompilation,
	sprintSummary,
	summarize,
} from "./sprints.js";
