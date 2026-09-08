/**
 * mill format: csv
 *
 * Converts compilation.json claims to CSV.
 * Columns: id, type, topic, content, evidence_tier, evidence_source, confidence, status
 * Zero dependencies — node built-in only.
 */

export const name = "csv";
export const extension = ".csv";
export const mimeType = "text/csv; charset=utf-8";
export const description =
  "Claims as CSV spreadsheet (id, type, topic, content, evidence, status)";

const COLUMNS = [
  "id",
  "type",
  "topic",
  "content",
  "evidence_tier",
  "evidence_source",
  "confidence",
  "status",
  "tags",
  "created",
];

/**
 * Convert a compilation object to CSV.
 * @param {object} compilation - The compilation.json content
 * @returns {string} CSV output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];

  if (claims.length === 0) {
    return COLUMNS.join(",") + "\n";
  }

  const header = COLUMNS.join(",");
  const rows = claims.map(claimToRow);

  return [header, ...rows].join("\n") + "\n";
}

function claimToRow(claim) {
  return COLUMNS.map((col) => {
    switch (col) {
      case "content":
        // Claims may use 'text' or 'content' for the main body
        return escapeField(claim.content || claim.text || "");
      case "topic":
        // Use claim.topic directly, or fall back to first tag
        return escapeField(
          claim.topic || (Array.isArray(claim.tags) ? claim.tags[0] || "" : ""),
        );
      case "evidence_tier":
        // evidence may be a string (tier directly) or object { tier, source }
        if (typeof claim.evidence === "string")
          return escapeField(claim.evidence);
        return escapeField(claim.evidence?.tier ?? claim.evidence_tier ?? "");
      case "evidence_source":
        // source may be an object { origin, artifact } or a string
        if (typeof claim.source === "object" && claim.source !== null) {
          return escapeField(
            claim.source.origin || claim.source.artifact || "",
          );
        }
        if (typeof claim.evidence === "object" && claim.evidence?.source) {
          return escapeField(claim.evidence.source);
        }
        return escapeField(claim.source ?? "");
      case "tags":
        return escapeField(
          Array.isArray(claim.tags) ? claim.tags.join("; ") : "",
        );
      case "confidence":
        return claim.confidence != null ? String(claim.confidence) : "";
      default:
        return escapeField(claim[col]);
    }
  }).join(",");
}

function escapeField(value) {
  if (value == null) return "";
  let str = String(value);
  // CWE-1236: Prevent CSV injection by prefixing formula-triggering characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
