/** Complete normalized evidence for downstream tools; no presentation layer. */
export const name = "json";
export const extension = ".json";
export const mimeType = "application/json; charset=utf-8";
export const description = "Complete evidence, sources, provenance and verification metadata";

export function convert(compilation) {
  return `${JSON.stringify(compilation, null, 2)}\n`;
}
