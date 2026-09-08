/**
 * phases.cjs — CommonJS mirror of lib/phases.js.
 */

"use strict";

const PHASE_PREFIXES = Object.freeze({
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

const PHASE_NAMES = Object.freeze([
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

function isValidPhase(phase) {
  return PHASE_NAMES.includes(phase);
}

function phaseFromClaimId(claimId) {
  if (typeof claimId !== "string" || !claimId.length) return null;
  const multi = ["burn", "cal"];
  for (const p of multi) {
    if (claimId.startsWith(p)) {
      return PHASE_PREFIXES[p] || null;
    }
  }
  const firstChar = claimId[0];
  return PHASE_PREFIXES[firstChar] || null;
}

function prefixForPhase(phase) {
  for (const [prefix, name] of Object.entries(PHASE_PREFIXES)) {
    if (name === phase) return prefix;
  }
  return null;
}

module.exports = {
  PHASE_PREFIXES,
  PHASE_NAMES,
  isValidPhase,
  phaseFromClaimId,
  prefixForPhase,
};
