/**
 * Shared helpers for mill format converters.
 *
 * Only genuinely-duplicated utilities live here. Format-specific escapers
 * (XML, SQL, YAML, CSV, BibTeX, DOT-id, etc.) intentionally remain co-located
 * with their converters because their escape semantics differ.
 *
 * Zero dependencies — pure functions only.
 */

/**
 * Canonical claim-type color palette used by HTML-rendering formats
 * (html-report, slide-deck). Hex values match the historical inline copies.
 */
export const typeColors = Object.freeze({
  constraint: "#e74c3c",
  factual: "#3498db",
  recommendation: "#2ecc71",
  risk: "#f39c12",
  estimate: "#9b59b6",
  feedback: "#1abc9c",
  unknown: "#95a5a6",
});

/**
 * HTML-escape for user-supplied strings interpolated into HTML attribute
 * values and text content. Matches the inline `esc()` that was duplicated
 * verbatim in html-report.mjs, slide-deck.mjs, and executive-summary.mjs.
 *
 * NOTE: This does NOT escape apostrophes. XML emitters (opml, graphml) and
 * the static publisher use different variants and keep their own copies.
 */
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Uppercase the first character of a string. Matches the identical inline
 * `capitalize()` that was duplicated across 7 format files.
 */
export function capitalize(str) {
  if (str == null || str.length === 0) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Treat arbitrary claim/metadata strings as text in Markdown exports.
 * Escaping HTML prevents raw elements; consumer renderers still own URL and
 * plugin policies. This returns a copy and never changes the evidence ledger.
 */
export function escapeMarkdownData(value) {
  if (typeof value === "string")
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  if (Array.isArray(value)) return value.map(escapeMarkdownData);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        escapeMarkdownData(item),
      ]),
    );
  return value;
}
