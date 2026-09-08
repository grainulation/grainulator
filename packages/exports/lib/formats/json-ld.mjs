/**
 * mill format: json-ld
 *
 * Wraps compilation.json in JSON-LD using schema.org/Report vocabulary.
 * Zero dependencies — node built-in only.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildReport } = require("../json-ld-common.js");

export const name = "json-ld";
export const extension = ".jsonld";
export const mimeType = "application/ld+json; charset=utf-8";
export const description = "JSON-LD semantic export (schema.org/Report)";

/**
 * Convert a compilation object to JSON-LD.
 * @param {object} compilation - The compilation.json content
 * @returns {string} JSON-LD string
 */
export function convert(compilation) {
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
  const certificate = compilation.certificate || {};

  return JSON.stringify(buildReport(meta, claims, certificate), null, 2);
}
