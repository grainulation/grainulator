/**
 * Sprint phase constants — single source of truth for claim-ID prefixes
 * and the corresponding phase labels.
 *
 * Wheat, harvest, orchard, grainulator all use the same ID scheme
 * (d001, r042, p003, etc.). This module centralizes the mapping so
 * consumers don't hardcode it or drift.
 *
 * Usage (ESM):
 *   import { PHASE_PREFIXES, PHASE_NAMES, phaseFromClaimId, isValidPhase }
 *     from "./phases.js";
 */

/** Claim-ID prefix → phase name. Longest prefixes FIRST so lookup is unambiguous. */
export const PHASE_PREFIXES = Object.freeze({
  cal: "calibration",
  burn: "control-burn",
  d: "define",
  r: "research",
  p: "prototype",
  e: "evaluate",
  f: "feedback",
  x: "challenge",
  w: "witness",
});

/** Canonical phase names in the order sprints typically progress. */
export const PHASE_NAMES = Object.freeze([
  "define",
  "research",
  "prototype",
  "evaluate",
  "feedback",
  "challenge",
  "witness",
  "calibration",
  "control-burn",
]);

/** True if `phase` is a recognized phase name. */
export function isValidPhase(phase) {
  return PHASE_NAMES.includes(phase);
}

/**
 * Extract the phase name from a claim ID like "r042" or "burn-003".
 * Returns null if the prefix doesn't match any known phase.
 *
 * Handles multi-char prefixes (cal, burn) before single-char fallbacks
 * so "cal001" resolves to "calibration", not "control-burn" or anything
 * starting with c.
 */
export function phaseFromClaimId(claimId) {
  if (typeof claimId !== "string" || !claimId.length) return null;
  // Try multi-char prefixes first (order matters)
  const multi = ["burn", "cal"];
  for (const p of multi) {
    if (claimId.startsWith(p)) {
      return PHASE_PREFIXES[p] ?? null;
    }
  }
  // Fall back to single-char prefix
  const firstChar = claimId[0];
  return PHASE_PREFIXES[firstChar] ?? null;
}

/**
 * Inverse: given a phase name, return its canonical prefix. Useful when
 * constructing new claim IDs programmatically.
 */
export function prefixForPhase(phase) {
  for (const [prefix, name] of Object.entries(PHASE_PREFIXES)) {
    if (name === phase) return prefix;
  }
  return null;
}
