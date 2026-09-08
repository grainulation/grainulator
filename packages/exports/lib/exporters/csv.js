"use strict";
const { assertSafeOutput } = require("../output-safety.js");
const { loadSource } = require("../source-data.js");

const fs = require("node:fs");
const path = require("node:path");

/**
 * Export claims.json to CSV.
 * Handles nested fields by flattening to dot-notation columns.
 */

const CSV_COLUMNS = [
  "id",
  "type",
  "text",
  "confidence",
  "evidence_tier",
  "source",
  "status",
  "created",
  "tags",
];

function escapeCsvField(value) {
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

function claimToRow(claim) {
  return CSV_COLUMNS.map((col) => {
    if (col === "tags") {
      return escapeCsvField(
        Array.isArray(claim.tags) ? claim.tags.join("; ") : "",
      );
    }
    if (col === "text") return escapeCsvField(claim.content ?? claim.text ?? "");
    if (col === "created") return escapeCsvField(claim.timestamp ?? claim.created ?? "");
    if (col === "evidence_tier") {
      return escapeCsvField(typeof claim.evidence === "string" ? claim.evidence : claim.evidence?.tier ?? claim.evidence_tier ?? "");
    }
    if (col === "source") {
      const source = claim.evidence?.source ?? claim.source ?? "";
      return escapeCsvField(source && typeof source === "object" ? source.artifact || source.origin || JSON.stringify(source) : source);
    }
    return escapeCsvField(claim[col]);
  }).join(",");
}

function deriveOutputPath(inputPath, explicit) {
  if (explicit) return explicit;
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}.csv`);
}

async function exportCsv(inputPath, outputPath) {
  const data = loadSource(inputPath);
  const claims = data.claims;

  if (claims.length === 0) {
    throw new Error("No claims found in input file.");
  }

  const header = CSV_COLUMNS.join(",");
  const rows = claims.map(claimToRow);
  const csv = [header, ...rows].join("\n") + "\n";

  const out = deriveOutputPath(inputPath, outputPath);
  assertSafeOutput(out, [inputPath]);
  fs.writeFileSync(out, csv, "utf-8");

  return {
    outputPath: out,
    message: `CSV written to ${out} (${claims.length} claims)`,
  };
}

module.exports = {
  name: "csv",
  description: "Export claims JSON to CSV",
  export: exportCsv,
};
