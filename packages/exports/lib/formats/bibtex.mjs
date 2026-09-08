/**
 * mill format: bibtex
 *
 * Converts compilation.json claims to BibTeX .bib entries.
 * Each claim becomes an @misc entry with metadata in note/keywords fields.
 * Zero dependencies — node built-in only.
 */

export const name = "bibtex";
export const extension = ".bib";
export const mimeType = "application/x-bibtex; charset=utf-8";
export const description =
  "Claims as BibTeX bibliography entries (@misc per claim)";

/**
 * Convert a compilation object to BibTeX.
 * @param {object} compilation - The compilation.json content
 * @returns {string} BibTeX output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];
  const meta = compilation.meta || {};
  const year = new Date().getFullYear().toString();
  const author = meta.sprint ? `wheat sprint: ${meta.sprint}` : "wheat sprint";

  if (claims.length === 0) {
    return `% No claims in compilation\n`;
  }

  const entries = claims.map((claim) => claimToEntry(claim, author, year));
  return entries.join("\n\n") + "\n";
}

function claimToEntry(claim, author, year) {
  const id = String(claim.id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const title = escapeBibtex(claim.content || claim.text || "");
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

  const keywordsLine =
    tags.length > 0
      ? `\n  keywords = {${tags.map(escapeBibtex).join(", ")}},`
      : "";

  return [
    `@misc{claim_${id},`,
    `  title = {${title}},`,
    `  author = {${escapeBibtex(author)}},`,
    `  year = {${year}},`,
    `  note = {${escapeBibtex(noteParts)}},` + keywordsLine,
    `}`,
  ].join("\n");
}

function escapeBibtex(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}
