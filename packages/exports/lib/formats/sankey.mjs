/**
 * mill format: sankey
 *
 * Converts compilation.json claims to Sankey JSON for D3-sankey.
 * Three-column flow: type -> evidence_tier -> status.
 * Zero dependencies — node built-in only.
 */

export const name = "sankey";
export const extension = ".json";
export const mimeType = "application/json; charset=utf-8";
export const description =
  "Claims as Sankey flow JSON (type -> evidence tier -> status)";

/**
 * Convert a compilation object to Sankey JSON.
 * @param {object} compilation - The compilation.json content
 * @returns {string} JSON output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];

  // Count flows: type -> evidence, evidence -> status
  const typeToEvidence = {};
  const evidenceToStatus = {};
  const nodeSet = new Set();

  for (const claim of claims) {
    const type = "type:" + (claim.type || "other");
    const evidence = "evidence:" + getEvidence(claim) || "evidence:unknown";
    const status = "status:" + (claim.status || "unknown");

    nodeSet.add(type);
    nodeSet.add(evidence);
    nodeSet.add(status);

    // type -> evidence link
    const teKey = `${type}|||${evidence}`;
    typeToEvidence[teKey] = (typeToEvidence[teKey] || 0) + 1;

    // evidence -> status link
    const esKey = `${evidence}|||${status}`;
    evidenceToStatus[esKey] = (evidenceToStatus[esKey] || 0) + 1;
  }

  const nodes = Array.from(nodeSet)
    .sort()
    .map((id) => ({ id }));

  const links = [];

  for (const [key, value] of Object.entries(typeToEvidence)) {
    const [source, target] = key.split("|||");
    links.push({ source, target, value });
  }

  for (const [key, value] of Object.entries(evidenceToStatus)) {
    const [source, target] = key.split("|||");
    links.push({ source, target, value });
  }

  const result = { nodes, links };

  return JSON.stringify(result, null, 2) + "\n";
}

function getEvidence(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || claim.evidence_tier || "";
  }
  return claim.evidence_tier || "";
}
