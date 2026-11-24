import type { ExportClaim } from "../export-types.js";

("use strict");
import importedModule1 = require("../output-safety.js");
const { assertSafeOutput } = importedModule1;
import importedModule2 = require("../source-data.js");
const { loadSource } = importedModule2;

import fs = require("node:fs");
import path = require("node:path");

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

function escapeCsvField(value: unknown) {
	if (value == null) return "";
	let str = String(value);
	// CWE-1236: Prevent CSV injection by prefixing formula-triggering characters
	if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(str)) {
		str = "'" + str;
	}
	if (
		str.includes(",") ||
		str.includes('"') ||
		str.includes("\n") ||
		str.includes("\r")
	) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function claimToRow(claim: ExportClaim) {
	return CSV_COLUMNS.map((col) => {
		if (col === "tags") {
			return escapeCsvField(
				Array.isArray(claim.tags) ? claim.tags.join("; ") : "",
			);
		}
		if (col === "text")
			return escapeCsvField(claim.content ?? claim.text ?? "");
		if (col === "created")
			return escapeCsvField(claim.timestamp ?? claim.created ?? "");
		if (col === "evidence_tier") {
			return escapeCsvField(
				typeof claim.evidence === "string"
					? claim.evidence
					: (claim.evidence?.tier ?? claim.evidence_tier ?? ""),
			);
		}
		if (col === "source") {
			const source =
				(typeof claim.evidence === "object"
					? claim.evidence?.source
					: undefined) ??
				claim.source ??
				"";
			return escapeCsvField(
				source && typeof source === "object"
					? ("artifact" in source ? source.artifact : undefined) ||
							("origin" in source ? source.origin : undefined) ||
							JSON.stringify(source)
					: source,
			);
		}
		return escapeCsvField(claim[col]);
	}).join(",");
}

function deriveOutputPath(inputPath: string, explicit?: string | null) {
	if (explicit) return explicit;
	const dir = path.dirname(inputPath);
	const base = path.basename(inputPath, path.extname(inputPath));
	return path.join(dir, `${base}.csv`);
}

async function exportCsv(inputPath: string, outputPath?: string | null) {
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

export = {
	name: "csv",
	description: "Export claims JSON to CSV",
	export: exportCsv,
};
