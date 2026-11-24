// Generated from typescript/packages/evidence/lib/load-claims.ts; edit that source and run npm run build:types.
import projectConfig from "../../shared/lib/project-config.cjs";
import { assertEvidenceTarget } from "./evidence-target.js";
/**
 * Shared claims.json loader with schema migration
 *
 * All consumers that read claims.json should use this helper to ensure
 * the data is migrated to the current schema version before processing.
 *
 * Zero npm dependencies.
 */
import fs from "fs";
import path from "path";
import { checkAndMigrateSchema } from "../compiler/evidence-compiler.js";
import { readBoundedRegularFile } from "./passages.js";
export function loadClaims(dir, opts = {}) {
	const config = projectConfig.evidenceConfig(dir);
	const filename = opts.filename || config.compiler.claims;
	const claimsPath = path.resolve(config.origin, filename);
	if (!fs.existsSync(claimsPath)) {
		return { data: null, errors: [], path: claimsPath };
	}
	let raw, rawBytes;
	try {
		if (opts.maxBytes !== undefined) {
			if (!Number.isSafeInteger(opts.maxBytes) || opts.maxBytes <= 0)
				throw new Error("maxBytes must be a positive safe integer.");
			const read = readBoundedRegularFile(claimsPath, opts.maxBytes);
			if (!read.ok) throw new Error(`Claims file is unusable (${read.code}).`);
			rawBytes = read.data;
			raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
		} else raw = fs.readFileSync(claimsPath, "utf8");
	} catch (err) {
		return {
			data: null,
			errors: [
				{
					code: "E_READ",
					message: `Failed to read ${filename}: ${err.message}`,
				},
			],
			path: claimsPath,
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return {
			data: null,
			errors: [
				{
					code: "E_PARSE",
					message: `${filename} is not valid JSON: ${err.message}`,
				},
			],
			path: claimsPath,
		};
	}
	try {
		assertEvidenceTarget(dir, parsed);
	} catch (error) {
		return {
			data: null,
			errors: [
				{
					code: error.code,
					message: error.message,
				},
			],
			path: claimsPath,
		};
	}
	// Run schema migration
	const result = checkAndMigrateSchema(parsed);
	// Reads never rewrite the ledger. Mutations persist migrations under the transaction lock.
	return {
		// The loader preserves the parsed document; compiler validation checks claims.
		data: result.errors.length > 0 ? null : result.data,
		errors: result.errors,
		path: claimsPath,
		...(rawBytes !== undefined ? { raw, raw_bytes: rawBytes } : {}),
	};
}
