"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pdf = require("./exporters/pdf.js");
const csv = require("./exporters/csv.js");
const markdown = require("./exporters/markdown.js");
const jsonLd = require("./exporters/json-ld.js");
const static_ = require("./publishers/static.js");
const clipboard = require("./publishers/clipboard.js");

// Legacy CJS exporters. The convert pipeline still uses these for the four
// original formats; the broader format catalogue is the ESM files in
// lib/formats/*.mjs (discovered below).
const EXPORTERS = {
  pdf,
  csv,
  markdown,
  "json-ld": jsonLd,
};

const PUBLISHERS = {
  static: static_,
  clipboard,
};

const FORMATS_DIR = path.join(__dirname, "formats");

/**
 * Detect the likely format of an input file by extension.
 */
function detectFormat(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const map = {
    html: "html",
    htm: "html",
    md: "markdown",
    json: "json",
    csv: "csv",
    jsonld: "json-ld",
  };
  return map[ext] || "unknown";
}

function getExporter(name) {
  return EXPORTERS[name] || null;
}

/**
 * Async exporter resolver that returns a CJS exporter when one exists
 * for `name`, otherwise dynamically imports the matching ESM format
 * module from lib/formats/<name>.mjs and wraps it in a CJS-style
 * exporter shim (same `.export(inputPath, outputPath)` surface).
 * Returns null if neither path resolves. Used by the CLI `export` /
 * `convert` commands so they accept the full catalogue reported by
 * listExportFormats().
 */
async function resolveFormat(name) {
  const cjs = EXPORTERS[name];
  if (cjs) return cjs;
  const esmPath = path.join(FORMATS_DIR, `${name}.mjs`);
  if (!fs.existsSync(esmPath)) return null;
  const mod = await import(`file://${esmPath}`);
  if (typeof mod.convert !== "function") return null;
  const fmtName = mod.name || name;
  const ext = mod.extension || ".txt";
  return {
    name: fmtName,
    extension: ext,
    mimeType: mod.mimeType,
    description: mod.description,
    convert: mod.convert,
    // Bridge to the CJS exporter shape used by bin/mill.js export/convert.
    export: async (inputPath, outputPath) => {
      const raw = fs.readFileSync(inputPath, "utf8");
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
      const output = mod.convert(data);
      const outFile =
        outputPath ||
        inputPath.replace(/\.[^.]+$/, "") +
          (ext.startsWith(".") ? ext : "." + ext);
      fs.writeFileSync(outFile, output);
      const bytes = Buffer.byteLength(output);
      return {
        format: fmtName,
        file: outFile,
        bytes,
        message: `Wrote ${fmtName} to ${outFile} (${bytes} bytes)`,
      };
    },
  };
}

function getPublisher(name) {
  return PUBLISHERS[name] || null;
}

function listExportFormats() {
  const cjsNames = Object.keys(EXPORTERS);
  let esmNames = [];
  try {
    esmNames = fs
      .readdirSync(FORMATS_DIR)
      .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
      .map((f) => f.replace(".mjs", ""));
  } catch {
    // No lib/formats/ directory — stay with CJS list only.
  }
  // Dedup in case an ESM format shadows a CJS exporter by name.
  return Array.from(new Set([...cjsNames, ...esmNames])).sort();
}

function listPublishTargets() {
  return Object.keys(PUBLISHERS);
}

module.exports = {
  detectFormat,
  getExporter,
  resolveFormat,
  getPublisher,
  listExportFormats,
  listPublishTargets,
};
