"use strict";

const fs = require("node:fs");

/** Normalize supported sprint data without guessing or merging another ledger. */
function normalizeSource(data) {
  if (Array.isArray(data)) data = { claims: data };
  if (!data || typeof data !== "object") {
    throw new Error("Expected claims or compilation JSON. Export claims.json, or run grainulator compile --dir <sprint> first.");
  }
  for (const field of ["claims", "resolved_claims"]) {
    if (data[field] !== undefined && !Array.isArray(data[field])) {
      throw new Error(`${field} must be an array. Export a valid claims.json or recompile the sprint.`);
    }
  }
  const claims = data.claims?.length ? data.claims : data.resolved_claims ?? data.claims;
  if (!claims) {
    throw new Error("No claims array found. Export claims.json, or run grainulator compile --dir <sprint> to regenerate compilation.json.");
  }
  for (const claim of claims) {
    if (!claim || typeof claim !== "object" || Array.isArray(claim) ||
        ![claim.content, claim.text].some(value => typeof value === "string" && value.trim())) {
      throw new Error("Claim content is missing or invalid. Export the original claims.json, or run grainulator compile --dir <sprint> to regenerate compilation.json with full claim content.");
    }
  }
  return {
    ...data,
    claims,
    meta: data.meta || data.sprint_meta || {},
    conflicts: data.conflicts || data.conflict_graph || [],
    certificate: data.certificate || data.compilation_certificate || {},
  };
}

function loadSource(inputPath) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read sprint JSON from ${inputPath}: ${error.message}`);
  }
  return normalizeSource(data);
}

module.exports = { normalizeSource, loadSource };
