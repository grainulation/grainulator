/**
 * mill format: treemap
 *
 * Converts compilation.json claims to nested JSON for D3 treemap.
 * Claims grouped by type, each with value = confidence (or 1).
 * Zero dependencies — node built-in only.
 */

export const name = "treemap";
export const extension = ".json";
export const mimeType = "application/json; charset=utf-8";
export const description =
  "Claims as nested JSON for D3 treemap visualization (grouped by type)";

/**
 * Convert a compilation object to D3 treemap JSON.
 * @param {object} compilation - The compilation.json content
 * @returns {string} JSON output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];
  const sprintName = compilation.meta?.sprint || "sprint";

  // Group claims by type
  const groups = {};
  for (const claim of claims) {
    const type = claim.type || "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(claim);
  }

  const tree = {
    name: sprintName,
    children: Object.entries(groups).map(([type, group]) => ({
      name: type,
      children: group.map((claim) => {
        const node = {
          name: claim.id || "",
          value: claim.confidence != null ? claim.confidence : 1,
          evidence: getEvidence(claim),
        };

        const content = claim.content || claim.text || "";
        if (content) node.content = content;

        const status = claim.status || "";
        if (status) node.status = status;

        const tags = Array.isArray(claim.tags) ? claim.tags : [];
        if (tags.length > 0) node.tags = tags;

        return node;
      }),
    })),
  };

  return JSON.stringify(tree, null, 2) + "\n";
}

function getEvidence(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || claim.evidence_tier || "";
  }
  return claim.evidence_tier || "";
}
