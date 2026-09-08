/**
 * mill format: rss
 *
 * Converts compilation.json claims to an Atom XML feed.
 * Each claim becomes a feed entry with category and content.
 * Zero dependencies — node built-in only.
 */

export const name = "rss";
export const extension = ".xml";
export const mimeType = "application/atom+xml; charset=utf-8";
export const description = "Claims as Atom XML feed (one entry per claim)";

/**
 * Convert a compilation object to Atom XML.
 * @param {object} compilation - The compilation.json content
 * @returns {string} Atom XML output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];
  const meta = compilation.meta || {};
  const sprintName = meta.sprint || "unnamed";
  const updated = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const lines = [];
  lines.push(`<?xml version="1.0" encoding="utf-8"?>`);
  lines.push(`<feed xmlns="http://www.w3.org/2005/Atom">`);
  lines.push(`  <title>${escapeXml(`Sprint: ${sprintName}`)}</title>`);
  lines.push(`  <id>urn:wheat:sprint:${escapeXml(sprintName)}</id>`);
  lines.push(`  <updated>${updated}</updated>`);

  if (meta.question) {
    lines.push(`  <subtitle>${escapeXml(meta.question)}</subtitle>`);
  }

  for (const claim of claims) {
    lines.push(claimToEntry(claim));
  }

  lines.push(`</feed>`);
  lines.push("");

  return lines.join("\n");
}

function claimToEntry(claim) {
  const id = String(claim.id || "unknown");
  const text = claim.content || claim.text || "";
  const type = claim.type || "";
  const status = claim.status || "";
  const evidence =
    typeof claim.evidence === "string"
      ? claim.evidence
      : (claim.evidence?.tier ?? claim.evidence_tier ?? "");
  const tags = Array.isArray(claim.tags) ? claim.tags : [];
  const updated = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const summaryParts = [
    type ? `type: ${type}` : "",
    evidence ? `evidence: ${evidence}` : "",
    status ? `status: ${status}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [];
  lines.push(`  <entry>`);
  lines.push(`    <title>${escapeXml(`${id}: ${truncate(text, 80)}`)}</title>`);
  lines.push(`    <id>urn:wheat:${escapeXml(id)}</id>`);
  lines.push(`    <updated>${updated}</updated>`);
  lines.push(`    <content type="text">${escapeXml(text)}</content>`);

  if (summaryParts) {
    lines.push(`    <summary>${escapeXml(summaryParts)}</summary>`);
  }

  if (type) {
    lines.push(`    <category term="${escapeXml(type)}"/>`);
  }

  for (const tag of tags) {
    lines.push(`    <category term="${escapeXml(tag)}"/>`);
  }

  lines.push(`  </entry>`);

  return lines.join("\n");
}

function escapeXml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}
