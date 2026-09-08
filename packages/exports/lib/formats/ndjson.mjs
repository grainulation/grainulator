/**
 * mill format: ndjson
 *
 * One JSON object per line (Newline Delimited JSON).
 * Each line is a claim with all fields preserved.
 * Zero dependencies — node built-in only.
 */

export const name = "ndjson";
export const extension = ".ndjson";
export const mimeType = "application/x-ndjson";
export const description = "Newline-delimited JSON — one claim object per line";

/**
 * Convert a compilation object to NDJSON.
 * @param {object} compilation - The compilation.json content
 * @returns {string} NDJSON output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];

  if (claims.length === 0) return "";

  return claims.map((c) => JSON.stringify(c)).join("\n") + "\n";
}
