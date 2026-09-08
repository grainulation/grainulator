/**
 * mill format: ris
 *
 * Converts compilation.json claims to RIS tagged citation format.
 * Each claim becomes a TY-ER record block.
 * Zero dependencies — node built-in only.
 */

export const name = "ris";
export const extension = ".ris";
export const mimeType = "application/x-research-info-systems; charset=utf-8";
export const description =
  "Claims as RIS citation records (one TY-ER block per claim)";

/**
 * Convert a compilation object to RIS.
 * @param {object} compilation - The compilation.json content
 * @returns {string} RIS output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];
  const meta = compilation.meta || {};
  const author = meta.sprint ? `wheat sprint: ${meta.sprint}` : "wheat sprint";
  const year = new Date().getFullYear().toString();

  if (claims.length === 0) {
    return "";
  }

  const records = claims.map((claim) => claimToRecord(claim, author, year));
  return records.join("\n") + "\n";
}

function claimToRecord(claim, author, year) {
  const id = String(claim.id || "unknown");
  const title = claim.content || claim.text || "";
  const type = claim.type || "";
  const evidence =
    typeof claim.evidence === "string"
      ? claim.evidence
      : (claim.evidence?.tier ?? claim.evidence_tier ?? "");
  const status = claim.status || "";
  const tags = Array.isArray(claim.tags) ? claim.tags : [];
  const confidence =
    claim.confidence != null ? `, confidence: ${claim.confidence}` : "";

  const noteParts =
    [
      type ? `type: ${type}` : "",
      evidence ? `evidence: ${evidence}` : "",
      status ? `status: ${status}` : "",
    ]
      .filter(Boolean)
      .join(", ") + confidence;

  const lines = [
    `TY  - GEN`,
    `ID  - ${id}`,
    `TI  - ${title}`,
    `AU  - ${author}`,
    `PY  - ${year}`,
  ];

  for (const tag of tags) {
    lines.push(`KW  - ${tag}`);
  }

  if (noteParts) {
    lines.push(`N1  - ${noteParts}`);
  }

  lines.push(`ER  - `);
  lines.push("");

  return lines.join("\n");
}
