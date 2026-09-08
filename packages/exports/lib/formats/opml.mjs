/**
 * mill format: opml
 *
 * Converts compilation.json claims to OPML 2.0 outline,
 * grouped by claim type.
 * Zero dependencies — node built-in only.
 */

export const name = "opml";
export const extension = ".opml";
export const mimeType = "text/x-opml; charset=utf-8";
export const description =
  "Claims as OPML 2.0 outline grouped by type (for RSS readers and outliners)";

/**
 * Convert a compilation object to OPML XML.
 * @param {object} compilation - The compilation.json content
 * @returns {string} OPML XML output
 */
export function convert(compilation) {
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
  const sprint = meta.sprint || "unknown";

  const grouped = groupByType(claims);
  const lines = [];

  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<opml version="2.0">');
  lines.push(`  <head><title>${esc(sprint)}</title></head>`);
  lines.push("  <body>");

  const typeOrder = [
    "constraint",
    "factual",
    "estimate",
    "risk",
    "recommendation",
    "feedback",
  ];
  const seen = new Set();

  for (const type of typeOrder) {
    if (grouped[type]) {
      lines.push(...renderGroup(type, grouped[type]));
      seen.add(type);
    }
  }

  // Remaining types not in the predefined order
  for (const type of Object.keys(grouped)) {
    if (!seen.has(type)) {
      lines.push(...renderGroup(type, grouped[type]));
    }
  }

  lines.push("  </body>");
  lines.push("</opml>");

  return lines.join("\n") + "\n";
}

function groupByType(claims) {
  const groups = {};
  for (const claim of claims) {
    const type = claim.type || "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(claim);
  }
  return groups;
}

function renderGroup(type, claims) {
  const label = capitalize(type) + "s";
  const lines = [];

  lines.push(`    <outline text="${esc(label)} (${claims.length})">`);

  for (const claim of claims) {
    const id = claim.id || "???";
    const content = claim.content || claim.text || "";
    const summary = truncate(content, 100);
    const evidence = getEvidence(claim);
    lines.push(
      `      <outline text="${esc(id)}: ${esc(summary)}" _note="evidence: ${esc(evidence)}"/>`,
    );
  }

  lines.push("    </outline>");
  return lines;
}

function getEvidence(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || claim.evidence_tier || "stated";
  }
  return claim.evidence_tier || "stated";
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
