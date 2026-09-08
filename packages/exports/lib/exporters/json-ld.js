"use strict";
const { assertSafeOutput } = require("../output-safety.js");
const { loadSource } = require("../source-data.js");

const fs = require("node:fs");
const path = require("node:path");
const { buildReport } = require("../json-ld-common.js");

/**
 * Export claims.json to JSON-LD format.
 * Uses shared schema.org/Report vocabulary from json-ld-common.js.
 */

function deriveOutputPath(inputPath, explicit) {
  if (explicit) return explicit;
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}.jsonld`);
}

async function exportJsonLd(inputPath, outputPath) {
  const data = loadSource(inputPath);
  const claims = data.claims;

  if (claims.length === 0) {
    throw new Error("No claims found in input file.");
  }

  const meta = data.meta || {
    sprint: "unknown",
    question: "Wheat Sprint Claims",
  };
  const certificate = data.certificate || {};
  const doc = buildReport(meta, claims, certificate);

  const out = deriveOutputPath(inputPath, outputPath);
  assertSafeOutput(out, [inputPath]);
  const tmp = out + ".tmp." + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, out);

  return {
    outputPath: out,
    message: `JSON-LD written to ${out} (${claims.length} claims)`,
  };
}

module.exports = {
  name: "json-ld",
  description: "Export claims JSON to JSON-LD for semantic web",
  export: exportJsonLd,
};
