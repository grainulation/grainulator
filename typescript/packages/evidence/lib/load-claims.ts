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
export interface SourceRange {
	path: string;
	start_line: number;
	end_line: number;
	file_sha256: string;
	excerpt_sha256: string;
}
interface ObservationBase {
	id: string;
	supersedes?: string;
}
export type Observation =
	| (ObservationBase & SourceRange & { kind: "source"; captured_at: string })
	| (ObservationBase & {
			kind: "execution";
			argv: string[];
			inputs: SourceRange[];
			inputs_sha256: string;
			input_changed: boolean;
			exit_code: number | null;
			failure: string | null;
	  });
export interface FindingAudit {
	revision: number;
	verdict: string;
	resolution: string;
	duplicate_of: string | null;
	observation_id?: string;
	resolution_observation_id?: string;
}
export interface LedgerSource {
	origin: string;
	artifact?: string | null;
	connector?: string | null;
	witnessed_claim?: string | null;
	relationship?: string;
	passage?: unknown;
	passage_sha256?: string;
	quote?: string;
	import_fingerprint?: string;
	[extension: string]: unknown;
}
export interface LedgerClaim {
	id: string;
	type: string;
	topic: string;
	content: string;
	source: LedgerSource | string;
	evidence: string;
	status: string;
	phase_added?: string;
	timestamp?: string;
	tags?: string[];
	conflicts_with?: string[];
	resolved_by?: string | null;
	supersedes?: string;
	confidence?: unknown;
	premises?: { claim_id: string; claim_sha256: string }[];
	observations?: Observation[];
	audit?: FindingAudit;
	resolution?: { winner: string; reason: string | null; resolved_at: string };
	maintenance_history?: {
		action: string;
		at: string;
		[detail: string]: unknown;
	}[];
}
export interface LedgerMeta {
	question?: string;
	phase?: string;
	initiated?: string;
	audience?: string[];
	connectors?: string[];
	excluded_topics?: string[];
	schema_version?: string;
	acceptance_history?: {
		at: string;
		previous_question?: string | undefined;
		reason: string;
	}[];
}
export interface Ledger {
	schema_version?: string;
	schema?: string;
	meta?: LedgerMeta;
	claims: LedgerClaim[];
}
export interface LedgerDiagnostic {
	code: string;
	message: string;
	claims?: string[];
}
interface LoadedClaims {
	data: Ledger | null;
	errors: LedgerDiagnostic[];
	path: string;
	raw?: string;
	raw_bytes?: Buffer;
}
export function loadClaims(
	dir: string,
	opts: { filename?: string; maxBytes?: number } = {},
): LoadedClaims {
	const config = projectConfig.evidenceConfig(dir);
	const filename = opts.filename || config.compiler.claims;
	const claimsPath = path.resolve(config.origin, filename);

	if (!fs.existsSync(claimsPath)) {
		return { data: null, errors: [], path: claimsPath };
	}

	let raw: string, rawBytes: Buffer | undefined;
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
					message: `Failed to read ${filename}: ${(err as Error).message}`,
				},
			],
			path: claimsPath,
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return {
			data: null,
			errors: [
				{
					code: "E_PARSE",
					message: `${filename} is not valid JSON: ${(err as Error).message}`,
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
					code: (error as NodeJS.ErrnoException).code!,
					message: (error as Error).message,
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
		data: result.errors.length > 0 ? null : (result.data as Ledger),
		errors: result.errors,
		path: claimsPath,
		...(rawBytes !== undefined ? { raw, raw_bytes: rawBytes } : {}),
	};
}
