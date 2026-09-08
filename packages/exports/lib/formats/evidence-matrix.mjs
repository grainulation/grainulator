/**
 * mill format: evidence-matrix
 *
 * Generates a pivot CSV with rows=claim types, columns=evidence tiers, cells=counts.
 * Useful for visualizing evidence coverage across claim categories.
 * Zero dependencies — node built-in only.
 */

export const name = "evidence-matrix";
export const extension = ".csv";
export const mimeType = "text/csv; charset=utf-8";
export const description =
  "Pivot table CSV: claim types vs evidence tiers with counts";

const TIER_ORDER = ["stated", "web", "documented", "tested", "production"];

/**
 * Convert a compilation object to an evidence matrix CSV.
 * @param {object} compilation - The compilation.json content
 * @returns {string} CSV pivot table output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];

  // Build the pivot: type -> tier -> count
  const pivot = {};
  const allTypes = new Set();
  const allTiers = new Set();

  for (const claim of claims) {
    if (claim.status === "reverted") continue;

    const type = claim.type || "unknown";
    const tier = extractTier(claim) || "unknown";

    allTypes.add(type);
    allTiers.add(tier);

    if (!pivot[type]) pivot[type] = {};
    pivot[type][tier] = (pivot[type][tier] || 0) + 1;
  }

  // Build column order: known tiers first (in canonical order), then any extras
  const tierColumns = [];
  for (const t of TIER_ORDER) {
    if (allTiers.has(t)) tierColumns.push(t);
  }
  for (const t of [...allTiers].sort()) {
    if (!tierColumns.includes(t)) tierColumns.push(t);
  }

  // Build row order: sort types alphabetically
  const typeRows = [...allTypes].sort();

  // Generate CSV
  const lines = [];

  // Header
  lines.push(["type", ...tierColumns, "total"].join(","));

  // Data rows
  for (const type of typeRows) {
    const counts = tierColumns.map((tier) => pivot[type]?.[tier] || 0);
    const total = counts.reduce((sum, n) => sum + n, 0);
    lines.push([type, ...counts, total].join(","));
  }

  // Totals row
  const colTotals = tierColumns.map((tier) => {
    let sum = 0;
    for (const type of typeRows) {
      sum += pivot[type]?.[tier] || 0;
    }
    return sum;
  });
  const grandTotal = colTotals.reduce((sum, n) => sum + n, 0);
  lines.push(["total", ...colTotals, grandTotal].join(","));

  return lines.join("\n") + "\n";
}

function extractTier(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || null;
  }
  return claim.evidence_tier || null;
}
