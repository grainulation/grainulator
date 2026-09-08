#!/usr/bin/env node
/**
 * build-pdf.js — Convert markdown to PDF via npx md-to-pdf
 *
 * Usage:
 *   barn build-pdf <markdown-file>
 *   barn build-pdf output/brief.md
 *
 * Uses npx to invoke md-to-pdf, so no local install is required.
 * Zero npm dependencies (Node built-in only).
 */

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Convert a markdown file to PDF via `npx md-to-pdf`.
 * Exported so consumers can call this programmatically; CLI entry
 * below runs it when this file is the process entry point.
 *
 * @param {string} target - Path to a markdown file.
 * @returns {string} Path to the generated PDF.
 */
export function buildPdf(target) {
  if (!target) throw new Error("buildPdf: target path is required");
  if (!existsSync(target)) throw new Error(`File not found: ${target}`);
  // execFile is shell-free; target path can contain spaces / quotes safely.
  execFileSync("npx", ["md-to-pdf", target], { stdio: "inherit" });
  return target.replace(/\.md$/, ".pdf");
}

// CLI entry — guarded so `import "@grainulation/barn/build-pdf"` from a
// consumer doesn't execute argv parsing or process.exit() at import time.
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];

  if (!target || target === "--help" || target === "-h") {
    console.log(`build-pdf — convert markdown to PDF

Usage:
  barn build-pdf <markdown-file>

Example:
  barn build-pdf output/brief.md

Uses npx md-to-pdf under the hood. No local install needed.`);
    process.exit(target ? 0 : 1);
  }

  try {
    const pdfPath = buildPdf(target);
    console.log(`PDF generated: ${pdfPath}`);
  } catch (e) {
    console.error("PDF generation failed:", e.message);
    process.exit(1);
  }
}
