import type { ExportFormat } from "./export-types.js";

("use strict");

import fs = require("node:fs");
import path = require("node:path");
import importedModule1 = require("node:url");
const { pathToFileURL } = importedModule1;
import importedModule2 = require("./source-data.js");
const { loadSource } = importedModule2;
import importedModule3 = require("./output-safety.js");
const { assertSafeOutput } = importedModule3;

import csv = require("./exporters/csv.js");
import markdown = require("./exporters/markdown.js");
import jsonLd = require("./exporters/json-ld.js");
import clipboard = require("./publishers/clipboard.js");

// Legacy CJS exporters. The convert pipeline still uses these for the retained
// original data formats; the broader format catalogue is the ESM files in
// lib/formats/*.mjs (discovered below).
const EXPORTERS: Record<string, ExportFormat> = {
	csv,
	markdown,
	"json-ld": jsonLd,
};

const PUBLISHERS: Record<string, typeof clipboard> = {
	clipboard,
};

const FORMATS_DIR = path.join(__dirname, "formats");

/**
 * Detect the likely format of an input file by extension.
 */
function detectFormat(filePath: string) {
	const ext = (filePath.split(".").pop() || "").toLowerCase();
	const map: Record<string, string> = {
		html: "html",
		htm: "html",
		md: "markdown",
		json: "json",
		csv: "csv",
		jsonld: "json-ld",
	};
	return map[ext] || "unknown";
}

function getExporter(name: string) {
	return Object.hasOwn(EXPORTERS, name) ? EXPORTERS[name] : null;
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
async function resolveFormat(name: string) {
	const cjs = Object.hasOwn(EXPORTERS, name) ? EXPORTERS[name] : null;
	if (cjs) return cjs;
	if (!listExportFormats().includes(name)) return null;
	const esmPath = path.join(FORMATS_DIR, `${name}.mjs`);
	if (!fs.existsSync(esmPath)) return null;
	const mod = await import(pathToFileURL(esmPath).href);
	if (typeof mod.convert !== "function") return null;
	const fmtName = mod.name || name;
	const ext = mod.extension || ".txt";
	return {
		name: fmtName,
		extension: ext,
		mimeType: mod.mimeType,
		description: mod.description,
		convert: mod.convert,
		// Bridge to the CJS exporter shape used by bin/exports.js export/convert.
		export: async (inputPath: string, outputPath?: string | null) => {
			const data = loadSource(inputPath);
			const output = mod.convert(data);
			const outFile =
				outputPath ||
				inputPath.replace(/\.[^.]+$/, "") +
					(ext.startsWith(".") ? ext : "." + ext);
			assertSafeOutput(outFile, [inputPath]);
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

function getPublisher(name: string) {
	return Object.hasOwn(PUBLISHERS, name) ? PUBLISHERS[name] : null;
}

function listExportFormats() {
	const cjsNames = Object.keys(EXPORTERS);
	let esmNames: string[] = [];
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

export = {
	detectFormat,
	getExporter,
	resolveFormat,
	getPublisher,
	listExportFormats,
	listPublishTargets,
};
