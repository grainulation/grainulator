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
import { checkAndMigrateSchema } from "../compiler/wheat-compiler.js";
import { readBoundedRegularFile } from "./passages.js";

/**
 * Load and migrate claims.json from a directory.
 *
 * @param {string} dir - Directory containing claims.json
 * @param {object} [opts] - Options
 * @param {string} [opts.filename='claims.json'] - Claims filename override
 * @param {number} [opts.maxBytes] - Optional bounded, regular-file-only read
 * @returns {{ data: object|null, errors: Array<{code: string, message: string}>, path: string, raw?: string, raw_bytes?: Buffer }}
 *   - data: the full claims object (with schema_version, meta, claims) or null if file missing/invalid
 *   - errors: migration errors (empty array on success)
 *   - path: resolved file path
 *   - raw/raw_bytes: bounded mode only; decoded parsing text and exact file bytes
 *     are separate because UTF-8 decoding can consume an optional BOM.
 */
export function loadClaims(dir, opts = {}) {
	const filename = opts.filename || "claims.json";
	const claimsPath = path.join(dir, filename);

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

	// Run schema migration
	const result = checkAndMigrateSchema(parsed);

	// Reads never rewrite the ledger. Mutations persist migrations under the transaction lock.

	return {
		data: result.errors.length > 0 ? null : result.data,
		errors: result.errors,
		path: claimsPath,
		...(opts.maxBytes !== undefined ? { raw, raw_bytes: rawBytes } : {}),
	};
}
