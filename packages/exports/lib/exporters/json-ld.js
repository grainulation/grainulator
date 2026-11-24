// Generated from typescript/packages/exports/lib/exporters/json-ld.ts; edit that source and run npm run build:types.
"use strict";
("use strict");
const importedModule1 = require("../output-safety.js");
const { assertSafeOutput } = importedModule1;
const importedModule2 = require("../source-data.js");
const { loadSource } = importedModule2;
const fs = require("node:fs");
const path = require("node:path");
const importedModule3 = require("../json-ld-common.js");
const { buildReport } = importedModule3;
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
		question: "Grainulator Sprint Claims",
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
