#!/usr/bin/env node
/**
 * Wheat Compiler — Bran-based compilation passes for research claims
 *
 * Reads claims.json, runs validation/conflict/resolution passes,
 * outputs compilation.json that all output artifacts consume.
 *
 * Usage:
 *   node wheat-compiler.js              # compile and write compilation.json
 *   node wheat-compiler.js --check      # compile and exit with error code if blocked
 *   node wheat-compiler.js --summary    # print human-readable summary to stdout
 *   node wheat-compiler.js --gate       # staleness check + readiness gate
 *   node wheat-compiler.js --input X --output Y  # compile arbitrary claims file
 *   node wheat-compiler.js --diff A B   # diff two compilation.json files
 */

import fs from "fs";
import nextActionsModule from "../lib/next-actions.cjs";
import { atomicWriteJSON } from "../../shared/lib/atomic.js";
import crypto from "crypto";
import path from "path";

import { fileURLToPath } from "url";
import { maybeHint } from "../lib/hints.js";

// Sprint detection — git-based, no config pointer needed (p013/f001)
import { detectSprints } from "../../shared/tools/detect-sprints.js";
// Direct manifest generation — avoids subprocess + redundant detectSprints call
import { buildManifest } from "./generate-manifest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── --dir: target directory (defaults to script location for backwards compat) ─
const _dirIdx = process.argv.indexOf("--dir");
const TARGET_DIR =
	_dirIdx !== -1 && process.argv[_dirIdx + 1]
		? path.resolve(process.argv[_dirIdx + 1])
		: __dirname;

// ─── Configuration ──────────────────────────────────────────────────────────
/** @returns {{ dirs: Object<string, string>, compiler: Object<string, string> }} Merged config from wheat.config.json with defaults */
function loadConfig(dir) {
	const configPath = path.join(dir, "wheat.config.json");
	const defaults = {
		dirs: {
			output: "output",
			research: "research",
			prototypes: "prototypes",
			evidence: "evidence",
			templates: "templates",
		},
		compiler: { claims: "claims.json", compilation: "compilation.json" },
	};
	try {
		const raw = fs.readFileSync(configPath, "utf8");
		const config = JSON.parse(raw);
		return {
			dirs: { ...defaults.dirs, ...(config.dirs || {}) },
			compiler: { ...defaults.compiler, ...(config.compiler || {}) },
		};
	} catch {
		return defaults;
	}
}

const config = loadConfig(TARGET_DIR);

// ─── Evidence tier hierarchy (higher = stronger) ─────────────────────────────
/** @type {Object<string, number>} Maps evidence tier names to numeric strength (1–5) */
const EVIDENCE_TIERS = {
	stated: 1,
	web: 2,
	documented: 3,
	tested: 4,
	production: 5,
};

/** @type {string[]} Allowed claim type values */
const VALID_TYPES = [
	"constraint",
	"factual",
	"estimate",
	"risk",
	"recommendation",
	"feedback",
];
// "refuted" is a first-class claim outcome: a claim that was initially
// asserted but later disproven under closer review. Distinct from
// "superseded" (replaced by a newer claim on the same topic) and
// "conflicted" (contradicts another claim but unresolved).
const VALID_STATUSES = [
	"active",
	"superseded",
	"conflicted",
	"resolved",
	"refuted",
];
const VALID_PHASES = [
	"define",
	"research",
	"prototype",
	"evaluate",
	"feedback",
];
// Note: phase ordering for next-action logic uses inline arrays in computeNextActions().
// PHASE_ORDER was previously defined here but was unused — removed to avoid dead code.

// Burn-residue ID prefix — synthetic claims from /control-burn must never persist
const BURN_PREFIX = "burn-";

// ─── Schema Migration Framework [r237] ──────────────────────────────────────
const CURRENT_SCHEMA = "1.0";

/**
 * Ordered list of migration functions. Each entry migrates from one version to the next.
 * Add new entries here as schema evolves: { from: '1.0', to: '1.1', migrate: fn }
 * The migrate function receives the full claimsData object and returns it mutated.
 */
const SCHEMA_MIGRATIONS = [
	// Example for future use:
	// { from: '1.0', to: '1.1', migrate(data) { /* transform data */ return data; } },
];

/**
 * Compare two semver-style version strings (e.g. '1.0', '2.1').
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareVersions(a, b) {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const na = pa[i] || 0;
		const nb = pb[i] || 0;
		if (na < nb) return -1;
		if (na > nb) return 1;
	}
	return 0;
}

/**
 * Validate and migrate schema version. Returns { data, errors }.
 * - Missing schema_version is treated as '1.0' (backwards compat).
 * - If schema_version > CURRENT_SCHEMA, returns a fatal error.
 * - If schema_version < CURRENT_SCHEMA, runs migrations in order.
 */
function checkAndMigrateSchema(claimsData) {
	// schema_version lives at the JSON root (document envelope), not inside meta.
	// init.js writes it at root; we read from root with fallback to meta for
	// backwards compatibility with any files that stored it in meta.
	const fileVersion =
		claimsData.schema_version ||
		(claimsData.meta || {}).schema_version ||
		"1.0";

	// Future version — this compiler cannot handle it
	if (compareVersions(fileVersion, CURRENT_SCHEMA) > 0) {
		return {
			data: claimsData,
			errors: [
				{
					code: "E_SCHEMA_VERSION",
					message: `claims.json uses schema v${fileVersion} but this compiler only supports up to v${CURRENT_SCHEMA}. Run: npx @grainulation/wheat@latest compile`,
				},
			],
		};
	}

	// Run migrations if file version is behind current
	let currentVersion = fileVersion;
	for (const migration of SCHEMA_MIGRATIONS) {
		if (
			compareVersions(currentVersion, migration.from) === 0 &&
			compareVersions(currentVersion, CURRENT_SCHEMA) < 0
		) {
			claimsData = migration.migrate(claimsData);
			currentVersion = migration.to;
			// Write schema_version at root level (document envelope convention)
			claimsData.schema_version = currentVersion;
		}
	}

	return { data: claimsData, errors: [] };
}

export { CURRENT_SCHEMA, SCHEMA_MIGRATIONS, checkAndMigrateSchema };

// Internal utilities — exported for testing only. Not part of the public API
// surface and may be removed or changed without notice.
export const _internals = { compareVersions };

// ─── Pass 1: Schema Validation (+ burn-residue safety check) ────────────────
function validateSchema(claims) {
	const errors = [];
	const requiredFields = [
		"id",
		"type",
		"topic",
		"content",
		"source",
		"evidence",
		"status",
	];

	claims.forEach((claim, i) => {
		// Burn-residue safety check: reject claims with burn- prefix
		if (claim.id && claim.id.startsWith(BURN_PREFIX)) {
			errors.push({
				code: "E_BURN_RESIDUE",
				message: `Claim ${claim.id} has burn- prefix — synthetic claims from /control-burn must not persist in claims.json. Remove it before compiling.`,
				claims: [claim.id],
			});
		}

		requiredFields.forEach((field) => {
			if (
				claim[field] === undefined ||
				claim[field] === null ||
				claim[field] === ""
			) {
				errors.push({
					code: "E_SCHEMA",
					message: `Claim ${
						claim.id || `[index ${i}]`
					} missing required field: ${field}`,
					claims: [claim.id || `index:${i}`],
				});
			}
		});

		// Check for duplicate IDs
		const dupes = claims.filter((c) => c.id === claim.id);
		if (dupes.length > 1 && claims.indexOf(claim) === i) {
			errors.push({
				code: "E_DUPLICATE_ID",
				message: `Duplicate claim ID: ${claim.id}`,
				claims: [claim.id],
			});
		}
	});

	return errors;
}

// ─── Pass 2: Type Checking ───────────────────────────────────────────────────
function validateTypes(claims) {
	const errors = [];

	claims.forEach((claim) => {
		if (!VALID_TYPES.includes(claim.type)) {
			errors.push({
				code: "E_TYPE",
				message: `Claim ${claim.id}: invalid type "${
					claim.type
				}". Must be one of: ${VALID_TYPES.join(", ")}`,
				claims: [claim.id],
			});
		}

		if (!Object.keys(EVIDENCE_TIERS).includes(claim.evidence)) {
			errors.push({
				code: "E_EVIDENCE_TIER",
				message: `Claim ${claim.id}: invalid evidence tier "${
					claim.evidence
				}". Must be one of: ${Object.keys(EVIDENCE_TIERS).join(", ")}`,
				claims: [claim.id],
			});
		}

		if (!VALID_STATUSES.includes(claim.status)) {
			errors.push({
				code: "E_STATUS",
				message: `Claim ${claim.id}: invalid status "${
					claim.status
				}". Must be one of: ${VALID_STATUSES.join(", ")}`,
				claims: [claim.id],
			});
		}
	});

	return errors;
}

// ─── Pass 3: Evidence Tier Sorting (deterministic: tier → id) ────────────────
function sortByEvidenceTier(claims) {
	return [...claims].sort((a, b) => {
		const tierDiff =
			(EVIDENCE_TIERS[b.evidence] || 0) - (EVIDENCE_TIERS[a.evidence] || 0);
		if (tierDiff !== 0) return tierDiff;
		// Deterministic tiebreak: lexicographic by claim ID (stable across runs)
		return (a.id || "").localeCompare(b.id || "");
	});
}

// ─── Pass 4: Conflict Detection ──────────────────────────────────────────────
function detectConflicts(claims) {
	const conflicts = [];
	const activeClaims = claims.filter(
		(c) => c.status === "active" || c.status === "conflicted",
	);

	for (let i = 0; i < activeClaims.length; i++) {
		for (let j = i + 1; j < activeClaims.length; j++) {
			const a = activeClaims[i];
			const b = activeClaims[j];

			// Same topic + explicitly marked as conflicting
			if (a.conflicts_with && a.conflicts_with.includes(b.id)) {
				conflicts.push({ claimA: a.id, claimB: b.id, topic: a.topic });
			} else if (b.conflicts_with && b.conflicts_with.includes(a.id)) {
				conflicts.push({ claimA: a.id, claimB: b.id, topic: a.topic });
			}
		}
	}

	return conflicts;
}

// ─── Pass 5: Auto-Resolution ─────────────────────────────────────────────────
function autoResolve(claims, conflicts) {
	const resolved = [];
	const unresolved = [];

	conflicts.forEach((conflict) => {
		const claimA = claims.find((c) => c.id === conflict.claimA);
		const claimB = claims.find((c) => c.id === conflict.claimB);

		if (!claimA || !claimB) {
			unresolved.push({ ...conflict, reason: "claim_not_found" });
			return;
		}

		const tierA = EVIDENCE_TIERS[claimA.evidence] || 0;
		const tierB = EVIDENCE_TIERS[claimB.evidence] || 0;

		if (tierA > tierB) {
			resolved.push({
				winner: claimA.id,
				loser: claimB.id,
				reason: `evidence_tier: ${claimA.evidence} (${tierA}) > ${claimB.evidence} (${tierB})`,
			});
			claimB.status = "superseded";
			claimB.resolved_by = claimA.id;
		} else if (tierB > tierA) {
			resolved.push({
				winner: claimB.id,
				loser: claimA.id,
				reason: `evidence_tier: ${claimB.evidence} (${tierB}) > ${claimA.evidence} (${tierA})`,
			});
			claimA.status = "superseded";
			claimA.resolved_by = claimB.id;
		} else {
			// Same evidence tier — cannot auto-resolve
			unresolved.push({
				claimA: claimA.id,
				claimB: claimB.id,
				topic: conflict.topic,
				reason: `same_evidence_tier: both ${claimA.evidence}`,
			});
			claimA.status = "conflicted";
			claimB.status = "conflicted";
		}
	});

	return { resolved, unresolved };
}

// ─── Pass 6: Coverage Analysis (enhanced with source/type diversity + corroboration) ─
function analyzeCoverage(claims) {
	const coverage = {};
	const activeClaims = claims.filter(
		(c) => c.status === "active" || c.status === "resolved",
	);

	activeClaims.forEach((claim) => {
		if (!claim.topic) return;

		if (!coverage[claim.topic]) {
			coverage[claim.topic] = {
				claims: 0,
				max_evidence: "stated",
				max_evidence_rank: 0,
				types: new Set(),
				claim_ids: [],
				constraint_count: 0,
				source_origins: new Set(),
			};
		}

		const entry = coverage[claim.topic];
		entry.claims++;
		entry.types.add(claim.type);
		entry.claim_ids.push(claim.id);
		if (claim.type === "constraint" || claim.type === "feedback") {
			entry.constraint_count++;
		}

		// Track source diversity
		if (claim.source && claim.source.origin) {
			entry.source_origins.add(claim.source.origin);
		}

		const tier = EVIDENCE_TIERS[claim.evidence] || 0;
		if (tier > entry.max_evidence_rank) {
			entry.max_evidence = claim.evidence;
			entry.max_evidence_rank = tier;
		}
	});

	// Compute corroboration: how many other claims reference/support each claim.
	// Exclude superseded AND refuted claims — a disproven claim must not lend
	// evidentiary weight to another.
	const corroboration = {};
	const allClaims = claims.filter(
		(c) => c.status !== "superseded" && c.status !== "refuted",
	);
	allClaims.forEach((claim) => {
		corroboration[claim.id] = 0;
	});
	// A claim corroborates another if it has source.witnessed_claim or source.challenged_claim
	// or shares the same topic and type with supporting relationship
	allClaims.forEach((claim) => {
		if (claim.source) {
			if (
				claim.source.witnessed_claim &&
				corroboration[claim.source.witnessed_claim] !== undefined
			) {
				if (
					claim.source.relationship === "full_support" ||
					claim.source.relationship === "partial_support"
				) {
					corroboration[claim.source.witnessed_claim]++;
				}
			}
		}
	});

	// Convert sets to arrays and compute status (deterministic key ordering)
	const result = {};
	Object.entries(coverage)
		.sort(([a], [b]) => a.localeCompare(b))
		.forEach(([topic, entry]) => {
			let status = "weak";
			if (entry.max_evidence_rank >= EVIDENCE_TIERS.tested) status = "strong";
			else if (entry.max_evidence_rank >= EVIDENCE_TIERS.documented)
				status = "moderate";

			// Type diversity: how many of the 6 possible types are present
			const allTypes = [...entry.types].sort();
			const missingTypes = VALID_TYPES.filter((t) => !allTypes.includes(t));

			// Source origins (sorted for determinism)
			const sourceOrigins = [...entry.source_origins].sort();

			result[topic] = {
				claims: entry.claims,
				max_evidence: entry.max_evidence,
				status,
				types: allTypes,
				claim_ids: entry.claim_ids,
				constraint_count: entry.constraint_count,
				// New: source diversity
				source_origins: sourceOrigins,
				source_count: sourceOrigins.length,
				// New: type diversity
				type_diversity: allTypes.length,
				missing_types: missingTypes,
			};
		});

	return { coverage: result, corroboration };
}

// ─── Pass 7: Readiness Check ─────────────────────────────────────────────────
function checkReadiness(errors, unresolvedConflicts, coverage) {
	const blockers = [...errors];

	// Unresolved conflicts are blockers
	unresolvedConflicts.forEach((conflict) => {
		blockers.push({
			code: "E_CONFLICT",
			message: `Unresolved conflict between ${conflict.claimA} and ${conflict.claimB} (topic: ${conflict.topic}) — ${conflict.reason}`,
			claims: [conflict.claimA, conflict.claimB],
		});
	});

	// Weak coverage is a warning, not a blocker (sorted for determinism)
	const warnings = [];
	Object.entries(coverage)
		.sort(([a], [b]) => a.localeCompare(b))
		.forEach(([topic, entry]) => {
			if (entry.status === "weak") {
				// Constraint-dominated topics (>50% constraint/feedback) get a softer warning
				const constraintRatio = (entry.constraint_count || 0) / entry.claims;
				if (constraintRatio > 0.5) {
					warnings.push({
						code: "W_CONSTRAINT_ONLY",
						message: `Topic "${topic}" is constraint-dominated (${entry.constraint_count}/${entry.claims} claims are constraints/feedback) — stated-level evidence is expected`,
						claims: entry.claim_ids,
					});
				} else {
					warnings.push({
						code: "W_WEAK_EVIDENCE",
						message: `Topic "${topic}" has only ${entry.max_evidence}-level evidence (${entry.claims} claims)`,
						claims: entry.claim_ids,
					});
				}
			}

			// Type monoculture warning
			if (entry.type_diversity < 2 && entry.claims >= 1) {
				warnings.push({
					code: "W_TYPE_MONOCULTURE",
					message: `Topic "${topic}" has only ${
						entry.type_diversity
					} claim type(s): ${entry.types.join(
						", ",
					)}. Missing: ${entry.missing_types.join(", ")}`,
					claims: entry.claim_ids,
				});
			}

			// Echo chamber warning: all claims from single source origin
			if (entry.source_count === 1 && entry.claims >= 3) {
				warnings.push({
					code: "W_ECHO_CHAMBER",
					message: `Topic "${topic}" has ${entry.claims} claims but all from a single source origin: ${entry.source_origins[0]}`,
					claims: entry.claim_ids,
				});
			}
		});

	return { blockers, warnings };
}

// ─── Phase Summary ───────────────────────────────────────────────────────────
function summarizePhases(claims) {
	const summary = {};
	VALID_PHASES.forEach((phase) => {
		const phaseClaims = claims.filter((c) => c.phase_added === phase);
		summary[phase] = {
			claims: phaseClaims.length,
			complete: phaseClaims.length > 0,
		};
	});
	return summary;
}

// ─── Canonical JSON — key-order-independent serialization ────────────────────
function canonicalJSON(obj) {
	if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
	if (Array.isArray(obj)) return "[" + obj.map(canonicalJSON).join(",") + "]";
	const keys = Object.keys(obj).sort();
	return (
		"{" +
		keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") +
		"}"
	);
}

// ─── Compilation Certificate ─────────────────────────────────────────────────
export const COMPILER_VERSION = "0.2.1";
export function generateCertificate(claimsData, compilerVersion = COMPILER_VERSION) {
	const hash = crypto
		.createHash("sha256")
		.update(canonicalJSON(claimsData))
		.digest("hex");

	return {
		input_hash: `sha256:${hash}`,
		compiler_version: compilerVersion,
		deterministic: true,
	};
}

// ─── diffCompilations — compare two compilation objects ─────────────────────
/**
 * Compare two compilation objects and return a structured delta.
 * @param {object} before - Earlier compilation.json contents
 * @param {object} after - Later compilation.json contents
 * @returns {object} Delta with new/removed claims, coverage changes, conflict changes
 */
function diffCompilations(before, after) {
	const delta = {
		new_claims: [],
		removed_claims: [],
		status_changes: [],
		coverage_changes: [],
		conflict_changes: {
			new_resolved: [],
			new_unresolved: [],
			removed_resolved: [],
			removed_unresolved: [],
		},
		meta_changes: {},
	};

	// Claim IDs
	const beforeIds = new Set((before.resolved_claims || []).map((c) => c.id));
	const afterIds = new Set((after.resolved_claims || []).map((c) => c.id));

	afterIds.forEach((id) => {
		if (!beforeIds.has(id)) delta.new_claims.push(id);
	});
	beforeIds.forEach((id) => {
		if (!afterIds.has(id)) delta.removed_claims.push(id);
	});

	// Status changes on claims that exist in both
	const beforeClaimsMap = {};
	(before.resolved_claims || []).forEach((c) => {
		beforeClaimsMap[c.id] = c;
	});
	const afterClaimsMap = {};
	(after.resolved_claims || []).forEach((c) => {
		afterClaimsMap[c.id] = c;
	});

	for (const id of beforeIds) {
		if (afterIds.has(id)) {
			const bc = beforeClaimsMap[id];
			const ac = afterClaimsMap[id];
			if (bc.status !== ac.status) {
				delta.status_changes.push({ id, from: bc.status, to: ac.status });
			}
		}
	}

	// Coverage changes
	const beforeCov = before.coverage || {};
	const afterCov = after.coverage || {};
	const allTopics = new Set([
		...Object.keys(beforeCov),
		...Object.keys(afterCov),
	]);
	allTopics.forEach((topic) => {
		const bc = beforeCov[topic];
		const ac = afterCov[topic];
		if (!bc && ac) {
			delta.coverage_changes.push({ topic, type: "added", after: ac });
		} else if (bc && !ac) {
			delta.coverage_changes.push({ topic, type: "removed", before: bc });
		} else if (bc && ac) {
			const changes = {};
			if (bc.max_evidence !== ac.max_evidence)
				changes.max_evidence = { from: bc.max_evidence, to: ac.max_evidence };
			if (bc.status !== ac.status)
				changes.status = { from: bc.status, to: ac.status };
			if (bc.claims !== ac.claims)
				changes.claims = { from: bc.claims, to: ac.claims };
			if (Object.keys(changes).length > 0) {
				delta.coverage_changes.push({ topic, type: "changed", changes });
			}
		}
	});

	// Conflict graph changes
	const beforeResolved = new Set(
		(before.conflict_graph?.resolved || []).map(
			(r) => `${r.winner}>${r.loser}`,
		),
	);
	const afterResolved = new Set(
		(after.conflict_graph?.resolved || []).map((r) => `${r.winner}>${r.loser}`),
	);
	const beforeUnresolved = new Set(
		(before.conflict_graph?.unresolved || []).map(
			(u) => `${u.claimA}|${u.claimB}`,
		),
	);
	const afterUnresolved = new Set(
		(after.conflict_graph?.unresolved || []).map(
			(u) => `${u.claimA}|${u.claimB}`,
		),
	);

	afterResolved.forEach((r) => {
		if (!beforeResolved.has(r)) delta.conflict_changes.new_resolved.push(r);
	});
	beforeResolved.forEach((r) => {
		if (!afterResolved.has(r)) delta.conflict_changes.removed_resolved.push(r);
	});
	afterUnresolved.forEach((u) => {
		if (!beforeUnresolved.has(u)) delta.conflict_changes.new_unresolved.push(u);
	});
	beforeUnresolved.forEach((u) => {
		if (!afterUnresolved.has(u))
			delta.conflict_changes.removed_unresolved.push(u);
	});

	// Meta changes
	if (before.status !== after.status)
		delta.meta_changes.status = { from: before.status, to: after.status };
	if (before.sprint_meta?.phase !== after.sprint_meta?.phase) {
		delta.meta_changes.phase = {
			from: before.sprint_meta?.phase,
			to: after.sprint_meta?.phase,
		};
	}
	if (before.sprint_meta?.total_claims !== after.sprint_meta?.total_claims) {
		delta.meta_changes.total_claims = {
			from: before.sprint_meta?.total_claims,
			to: after.sprint_meta?.total_claims,
		};
	}

	return delta;
}

// ─── Manifest Generation (topic map) ─────────────────────────────────────────
/**
 * Generate wheat-manifest.json by calling buildManifest() directly.
 * No subprocess — reuses the already-imported module and sprint data.
 * Failures are non-fatal (manifest is an optimization, not a correctness requirement).
 */
function generateManifest(_compilation, dir, sprintsInfo) {
	const baseDir = dir || TARGET_DIR;
	try {
		const result = buildManifest(baseDir, { sprintsInfo });
		if (result && process.argv.includes("--summary")) {
			console.log("\nTopic map updated");
			console.log(
				`  Topics: ${result.topicCount}  |  Files: ${result.fileCount}  |  Sprints: ${result.sprintCount}`,
			);
		}
	} catch (err) {
		// Non-fatal: warn but don't block compilation
		console.error(`Warning: manifest generation failed — ${err.message}`);
	}
}

// ─── Main Compilation Pipeline ───────────────────────────────────────────────
/**
 * Run the full compilation pipeline: validate, sort, detect conflicts, resolve, compute coverage.
 * @param {string|null} inputPath - Path to claims.json (null = default from config)
 * @param {string|null} outputPath - Path to write compilation.json (null = default from config)
 * @returns {object} The compiled output object
 */
function compile(inputPath, outputPath, dir, opts = {}) {
	const compilerVersion = COMPILER_VERSION;
	const baseDir = dir || TARGET_DIR;
	const claimsPath = inputPath || path.join(baseDir, config.compiler.claims);
	const compilationOutputPath =
		outputPath || path.join(baseDir, config.compiler.compilation);

	// Read claims
	if (!fs.existsSync(claimsPath)) {
		// Throw instead of process.exit so callers (e.g. the MCP server in
		// lib/serve-mcp.js) can surface the error without the host process
		// dying. The CLI entry point at the bottom of this file wraps
		// compile() in a try/catch that exits on thrown errors.
		throw new Error(
			`${path.basename(claimsPath)} not found. Run "wheat init" to start a sprint.`,
		);
	}

	const raw = fs.readFileSync(claimsPath, "utf8");
	let claimsData;
	try {
		claimsData = JSON.parse(raw);
	} catch (e) {
		throw new Error(
			`${path.basename(claimsPath)} is not valid JSON — ${e.message}`,
		);
	}
	const certificate = generateCertificate(claimsData, compilerVersion);
	// ── Schema version check + migration [r237] ──────────────────────────────
	const migrationResult = checkAndMigrateSchema(claimsData);
	if (migrationResult.errors.length > 0) {
		const messages = migrationResult.errors
			.map((err) => err.message)
			.join("; ");
		throw new Error(messages);
	}
	claimsData = migrationResult.data;

	const claims = claimsData.claims || [];
	const meta = claimsData.meta || {};

	// Run passes
	const schemaErrors = validateSchema(claims);
	const typeErrors = validateTypes(claims);
	const allValidationErrors = [...schemaErrors, ...typeErrors];

	// Only run conflict/resolution if validation passes
	let conflictGraph = { resolved: [], unresolved: [] };
	let coverageResult = { coverage: {}, corroboration: {} };
	let readiness = { blockers: allValidationErrors, warnings: [] };
	let resolvedClaims = claims.filter(
		(c) => c.status === "active" || c.status === "resolved",
	);

	if (allValidationErrors.length === 0) {
		const sortedClaims = sortByEvidenceTier(claims);
		const conflicts = detectConflicts(sortedClaims);
		conflictGraph = autoResolve(claims, conflicts);
		coverageResult = analyzeCoverage(claims);
		readiness = checkReadiness(
			[],
			conflictGraph.unresolved,
			coverageResult.coverage,
		);
		resolvedClaims = claims.filter(
			(c) => c.status === "active" || c.status === "resolved",
		);
	}

	const phaseSummary = summarizePhases(claims);
	// Determine overall status
	const status = readiness.blockers.length > 0 ? "blocked" : "ready";

	// Determine current phase from meta or infer from claims
	const currentPhase = meta.phase || inferPhase(phaseSummary);

	// ── Sprint detection (git-based, non-fatal) ──────────────────────────────
	let sprintsInfo = { active: null, sprints: [] };
	let sprintSummaries = [];
	if (!opts.skipSprintDetection) {
		try {
			sprintsInfo = detectSprints(baseDir);
		} catch (err) {
			// Non-fatal: sprint detection failure should not block compilation
			console.error(`Warning: sprint detection failed — ${err.message}`);
		}

		// Build sprint summaries: active sprint gets full compilation, others get summary entries
		sprintSummaries = sprintsInfo.sprints.map((s) => ({
			name: s.name,
			path: s.path,
			status: s.status,
			phase: s.phase,
			question: s.question,
			claims_count: s.claims_count,
			active_claims: s.active_claims,
			last_git_activity: s.last_git_activity,
			git_commit_count: s.git_commit_count,
		}));
	}

	const compilation = {
		compiled_at: new Date().toISOString(), // Non-deterministic metadata (excluded from certificate)
		claims_hash: certificate.input_hash.slice(7, 14),
		compiler_version: compilerVersion,
		status,
		errors: readiness.blockers,
		warnings: readiness.warnings,
		resolved_claims: resolvedClaims.map((c) => ({
			id: c.id,
			type: c.type,
			topic: c.topic,
			content: c.content,
			evidence: c.evidence,
			confidence: c.confidence,
			status: c.status,
			phase_added: c.phase_added,
			source: c.source,
			conflicts_with: c.conflicts_with,
			resolved_by: c.resolved_by,
			resolution: c.resolution,
			tags: c.tags,
		})),
		conflict_graph: conflictGraph,
		coverage: coverageResult.coverage,
		corroboration: coverageResult.corroboration,
		phase_summary: phaseSummary,
		sprints: sprintSummaries,
		sprint_meta: {
			question: meta.question || "",
			audience: meta.audience || [],
			initiated: meta.initiated || "",
			phase: currentPhase,
			total_claims: claims.length,
			active_claims: claims.filter((c) => c.status === "active").length,
			conflicted_claims: claims.filter((c) => c.status === "conflicted").length,
			superseded_claims: claims.filter((c) => c.status === "superseded").length,
			refuted_claims: claims.filter((c) => c.status === "refuted").length,
			connectors: meta.connectors || [],
			excluded_topics: Array.isArray(meta.excluded_topics) ? meta.excluded_topics : [],
		},
		compilation_certificate: certificate,
	};

	compilation.next_actions = nextActionsModule.nextActions(compilation);

	// Write compilation output
	atomicWriteJSON(compilationOutputPath, compilation, 2);

	// Generate topic-map manifest (wheat-manifest.json)
	// Pass sprintsInfo to avoid re-running detectSprints in manifest generator
	if (!opts.skipSprintDetection) {
		generateManifest(compilation, baseDir, sprintsInfo);
	}

	return compilation;
}

function inferPhase(phaseSummary) {
	// Walk backwards through phases to find the latest completed one
	const phases = ["evaluate", "prototype", "research", "define"];
	for (const phase of phases) {
		if (phaseSummary[phase] && phaseSummary[phase].complete) {
			return phase;
		}
	}
	return "init";
}

// ─── Self-Containment Scanner ────────────────────────────────────────────────
function scanSelfContainment(dirs) {
	const extPattern =
		/(?:<script[^>]+src=["'](?!data:)|<link[^>]+href=["'](?!#|data:)|@import\s+url\(["']?(?!data:)|<img[^>]+src=["'](?!data:))(https?:\/\/[^"'\s)]+)/gi;
	const results = [];
	for (const dir of dirs) {
		if (!fs.existsSync(dir)) continue;
		const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
		for (const file of files) {
			const raw = fs.readFileSync(path.join(dir, file), "utf8");
			// Strip inline script/style bodies so URLs inside JS/CSS data aren't flagged.
			// Preserve <script src="..."> tags (external scripts we DO want to detect).
			const content = raw
				.replace(/(<script(?:\s[^>]*)?)>([\s\S]*?)<\/script>/gi, (_, open) => {
					return open + "></script>";
				})
				.replace(/(<style(?:\s[^>]*)?)>([\s\S]*?)<\/style>/gi, (_, open) => {
					return open + "></style>";
				});
			const matches = [];
			let m;
			while ((m = extPattern.exec(content)) !== null) {
				matches.push(m[1]);
			}
			results.push({ file: path.join(dir, file), external: matches });
		}
	}
	return results;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const isMain =
	process.argv[1] &&
	fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
	const args = process.argv.slice(2);

	// --help / -h
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`Wheat Compiler v0.2.0 — Bran-based compilation for research claims

Usage:
  node wheat-compiler.js              Compile claims.json → compilation.json
  node wheat-compiler.js --summary    Compile and print human-readable summary
  node wheat-compiler.js --check      Compile and exit with error if blocked
  node wheat-compiler.js --gate       Staleness check + readiness gate
  node wheat-compiler.js --scan       Check HTML artifacts for external dependencies
  node wheat-compiler.js --next [N]   Recommend next N actions by priority
  node wheat-compiler.js --diff A B   Diff two compilation.json files
  node wheat-compiler.js --input X --output Y   Compile arbitrary claims file

Options:
  --dir <path>  Resolve all paths relative to <path> instead of script location
  --quiet, -q   One-liner output (for scripts and AI agents)
  --help, -h    Show this help message
  --json        Output as JSON (works with --summary, --check, --gate, --scan, --next)`);
		process.exit(0);
	}

	// --scan mode: check HTML artifacts for external dependencies
	if (args.includes("--scan")) {
		const scanDirs = ["output", "research", "evidence", "prototypes"].map((d) =>
			path.join(TARGET_DIR, d),
		);
		// Also scan nested dirs one level deep (e.g. prototypes/live-dashboard/)
		const allDirs = [...scanDirs];
		for (const d of scanDirs) {
			if (fs.existsSync(d)) {
				fs.readdirSync(d, { withFileTypes: true })
					.filter((e) => e.isDirectory())
					.forEach((e) => allDirs.push(path.join(d, e.name)));
			}
		}
		const results = scanSelfContainment(allDirs);
		const clean = results.filter((r) => r.external.length === 0);
		const dirty = results.filter((r) => r.external.length > 0);

		const scanJsonFlag = args.includes("--json");
		if (scanJsonFlag) {
			console.log(
				JSON.stringify(
					{
						scanned: results.length,
						clean: clean.length,
						dirty: dirty.length,
						files: dirty,
					},
					null,
					2,
				),
			);
			process.exit(dirty.length > 0 ? 1 : 0);
		}

		console.log(`Self-Containment Scan`);
		console.log("=".repeat(50));
		console.log(`Scanned: ${results.length} HTML files`);
		console.log(`Clean:   ${clean.length}`);
		console.log(`Dirty:   ${dirty.length}`);
		if (dirty.length > 0) {
			console.log("\nExternal dependencies found:");
			dirty.forEach((r) => {
				console.log(`  ${r.file}:`);
				r.external.forEach((url) => console.log(`    → ${url}`));
			});
			process.exit(1);
		} else {
			console.log("\n✓ All HTML artifacts are self-contained.");
		}
		process.exit(0);
	}

	// --diff mode: compare two compilation files
	if (args.includes("--diff")) {
		const diffIdx = args.indexOf("--diff");
		const fileA = args[diffIdx + 1];
		const fileB = args[diffIdx + 2];
		if (!fileA || !fileB) {
			console.error(
				"Usage: node wheat-compiler.js --diff <before.json> <after.json>",
			);
			process.exit(1);
		}
		let before, after;
		try {
			before = JSON.parse(fs.readFileSync(fileA, "utf8"));
		} catch (e) {
			console.error(`Error: ${fileA} is not valid JSON — ${e.message}`);
			process.exit(1);
		}
		try {
			after = JSON.parse(fs.readFileSync(fileB, "utf8"));
		} catch (e) {
			console.error(`Error: ${fileB} is not valid JSON — ${e.message}`);
			process.exit(1);
		}
		const delta = diffCompilations(before, after);
		console.log(JSON.stringify(delta, null, 2));
		process.exit(0);
	}

	// Parse --input and --output flags
	let inputPath = null;
	let outputPath = null;
	const inputIdx = args.indexOf("--input");
	if (inputIdx !== -1 && args[inputIdx + 1]) {
		inputPath = path.resolve(args[inputIdx + 1]);
	}
	const outputIdx = args.indexOf("--output");
	if (outputIdx !== -1 && args[outputIdx + 1]) {
		outputPath = path.resolve(args[outputIdx + 1]);
	}

	const jsonFlag = args.includes("--json");
	const quietFlag = args.includes("--quiet") || args.includes("-q");
	let compilation;
	try {
		compilation = compile(inputPath, outputPath, undefined, {
			skipSprintDetection: quietFlag && !args.includes("--summary"),
		});
	} catch (err) {
		// CLI entry point: surface the error and exit with non-zero.
		// The library path (called from lib/serve-mcp.js, lib/compiler.js)
		// rethrows cleanly so MCP servers can catch it.
		console.error(`Error: ${err.message}`);
		process.exit(1);
	}

	// --quiet / -q: one-liner output for scripts and AI agents (~13 tokens vs ~4,600)
	if (quietFlag && !args.includes("--summary")) {
		const c = compilation;
		const conflicts = c.sprint_meta.conflicted_claims || 0;
		const suffix = conflicts > 0 ? ` (${conflicts} conflicts)` : "";
		const line = `wheat: compiled ${c.sprint_meta.total_claims} claims, ${
			Object.keys(c.coverage).length
		} topics${suffix}`;
		if (jsonFlag) {
			console.log(
				JSON.stringify({
					status: c.status,
					claims: c.sprint_meta.total_claims,
					active: c.sprint_meta.active_claims,
					conflicts,
					topics: Object.keys(c.coverage).length,
					errors: c.errors.length,
					warnings: c.warnings.length,
				}),
			);
		} else {
			console.log(line);
		}
		process.exit(c.status === "blocked" ? 1 : 0);
	}

	if (args.includes("--summary")) {
		const c = compilation;
		const statusIcon = c.status === "ready" ? "\u2713" : "\u2717";
		console.log(`\nWheat Compiler v${c.compiler_version}`);
		console.log(`${"=".repeat(50)}`);
		console.log(`Sprint: ${c.sprint_meta.question || "(not initialized)"}`);
		console.log(`Phase:  ${c.sprint_meta.phase}`);
		console.log(`Status: ${statusIcon} ${c.status.toUpperCase()}`);
		console.log(
			`Claims: ${c.sprint_meta.total_claims} total, ${c.sprint_meta.active_claims} active, ${c.sprint_meta.conflicted_claims} conflicted`,
		);

		if (c.sprints && c.sprints.length > 0) {
			console.log(`Sprints: ${c.sprints.length} detected`);
			c.sprints.forEach((s) => {
				const icon = s.status === "active" ? ">>" : "  ";
				console.log(
					`  ${icon} [${s.status.toUpperCase().padEnd(8)}] ${s.name} (${
						s.phase
					}, ${s.claims_count} claims)`,
				);
			});
		}
		console.log();

		if (Object.keys(c.coverage).length > 0) {
			console.log("Coverage:");
			Object.entries(c.coverage).forEach(([topic, entry]) => {
				const bar =
					"\u2588".repeat(Math.min(entry.claims, 10)) +
					"\u2591".repeat(Math.max(0, 10 - entry.claims));
				const constraintDominated =
					(entry.constraint_count || 0) / entry.claims > 0.5;
				const icon =
					entry.status === "strong"
						? "\u2713"
						: entry.status === "moderate"
							? "~"
							: constraintDominated
								? "\u2139"
								: "\u26A0";
				const srcInfo =
					entry.source_count !== undefined
						? ` [${entry.source_count} src]`
						: "";
				const typeInfo =
					entry.type_diversity !== undefined
						? ` [${entry.type_diversity}/${VALID_TYPES.length} types]`
						: "";
				console.log(
					`  ${icon} ${topic.padEnd(20)} ${bar} ${entry.max_evidence} (${
						entry.claims
					} claims)${srcInfo}${typeInfo}`,
				);
			});
			console.log();
		}

		if (c.corroboration && Object.keys(c.corroboration).length > 0) {
			const corroborated = Object.entries(c.corroboration).filter(
				([, v]) => v > 0,
			);
			if (corroborated.length > 0) {
				console.log("Corroborated claims:");
				corroborated.forEach(([id, count]) => {
					console.log(`  ${id}: ${count} supporting witness(es)`);
				});
				console.log();
			}
		}

		if (c.errors.length > 0) {
			console.log("Errors:");
			c.errors.forEach((e) => console.log(`  ${e.code}: ${e.message}`));
			console.log();

			// Show expected shape if schema errors exist
			const hasSchemaErrors = c.errors.some(
				(e) =>
					e.code === "E_SCHEMA" ||
					e.code === "E_TYPE" ||
					e.code === "E_EVIDENCE_TIER",
			);
			if (hasSchemaErrors) {
				console.log("  Expected claim shape:");
				console.log("    {");
				console.log('      "id": "r001",');
				console.log(
					'      "type": "constraint|factual|estimate|risk|recommendation|feedback",',
				);
				console.log('      "topic": "topic-slug",');
				console.log('      "content": "The claim text",');
				console.log(
					'      "source": { "origin": "research", "artifact": null, "connector": null },',
				);
				console.log(
					'      "evidence": "stated|web|documented|tested|production",',
				);
				console.log('      "status": "active",');
				console.log(
					'      "phase_added": "define|research|prototype|evaluate|feedback|challenge",',
				);
				console.log('      "timestamp": "2026-01-01T00:00:00.000Z",');
				console.log('      "conflicts_with": [],');
				console.log('      "resolved_by": null,');
				console.log('      "tags": []');
				console.log("    }");
				console.log();
				console.log(
					'  Hint: Run "wheat init --headless --question ..." to generate a valid claims.json',
				);
			}
		}

		if (c.warnings.length > 0) {
			console.log("Warnings:");
			c.warnings.forEach((w) => console.log(`  ${w.code}: ${w.message}`));
			console.log();
		}

		console.log(
			`Certificate: ${c.compilation_certificate.input_hash.slice(0, 20)}...`,
		);

		if (!jsonFlag) {
			try {
				const hint = maybeHint(compilation, { context: "compile" });
				if (hint) {
					process.stderr.write("\n" + hint + "\n");
				}
			} catch {
				// hints are non-critical — fail silently
			}
		}

		if (jsonFlag) {
			console.log(JSON.stringify(c, null, 2));
		}
	}

	if (args.includes("--check")) {
		if (compilation.status === "blocked") {
			if (jsonFlag) {
				console.log(
					JSON.stringify(
						{ status: "blocked", errors: compilation.errors },
						null,
						2,
					),
				);
			} else {
				console.error(
					`Compilation blocked: ${compilation.errors.length} error(s)`,
				);
				compilation.errors.forEach((e) =>
					console.error(`  ${e.code}: ${e.message}`),
				);
			}
			process.exit(1);
		} else {
			if (jsonFlag) {
				console.log(JSON.stringify({ status: "ready" }, null, 2));
			} else {
				console.log("Compilation ready.");
			}
			process.exit(0);
		}
	}

	if (args.includes("--gate")) {
		// Staleness check: is compilation.json older than claims.json?
		const compilationPath = path.join(TARGET_DIR, config.compiler.compilation);
		const claimsPath = path.join(TARGET_DIR, config.compiler.claims);

		if (fs.existsSync(compilationPath) && fs.existsSync(claimsPath)) {
			const compilationMtime = fs.statSync(compilationPath).mtimeMs;
			const claimsMtime = fs.statSync(claimsPath).mtimeMs;

			if (claimsMtime > compilationMtime) {
				console.error(
					"Gate FAILED: compilation.json is stale. Recompiling now...",
				);
				// The compile() call above already refreshed it, so this is informational
			}
		}

		if (compilation.status === "blocked") {
			if (jsonFlag) {
				console.log(
					JSON.stringify(
						{ gate: "failed", errors: compilation.errors },
						null,
						2,
					),
				);
			} else {
				console.error(`Gate FAILED: ${compilation.errors.length} blocker(s)`);
				compilation.errors.forEach((e) =>
					console.error(`  ${e.code}: ${e.message}`),
				);
			}
			process.exit(1);
		}

		if (jsonFlag) {
			console.log(
				JSON.stringify(
					{
						gate: "passed",
						active_claims: compilation.sprint_meta.active_claims,
						topics: Object.keys(compilation.coverage).length,
						hash: compilation.claims_hash,
					},
					null,
					2,
				),
			);
		} else {
			// Print a one-line gate pass for audit
			console.log(
				`Gate PASSED: ${compilation.sprint_meta.active_claims} claims, ${
					Object.keys(compilation.coverage).length
				} topics, hash ${compilation.claims_hash}`,
			);
		}
		process.exit(0);
	}

	// ─── --next: Data-driven next action recommendation ──────────────────────────
	if (args.includes("--next")) {
		const n = parseInt(args[args.indexOf("--next") + 1]) || 1;
		const actions = computeNextActions(compilation);
		const top = actions.slice(0, n);

		if (top.length === 0) {
			console.log("\nNo actions recommended — sprint looks complete.");
			console.log(
				"Consider: /brief to compile, /present to share, /calibrate after shipping.",
			);
		} else {
			console.log(
				`\nNext ${
					top.length === 1 ? "action" : top.length + " actions"
				} (by Bran priority):`,
			);
			console.log("=".repeat(50));
			top.forEach((a, i) => {
				console.log(`\n${i + 1}. [${a.priority}] ${a.command}`);
				console.log(`   ${a.reason}`);
				console.log(`   Impact: ${a.impact}`);
			});
			console.log();
		}
		// Also output as JSON for programmatic use
		if (args.includes("--json")) {
			console.log(JSON.stringify(top, null, 2));
		}
		process.exit(0);
	}
} // end if (isMain)

/**
 * Suggest next actions based on compilation state (gaps, conflicts, weak evidence).
 * @param {object} comp - A compilation.json object
 * @returns {Array<{action: string, priority: string, target: string}>} Ordered action suggestions
 */
function computeNextActions(comp) {
	const actions = [];
	const coverage = comp.coverage || {};
	const conflicts = comp.conflict_graph || { resolved: [], unresolved: [] };
	const phase = comp.sprint_meta?.phase || "init";
	const phases = comp.phase_summary || {};
	const corroboration = comp.corroboration || {};

	// ── Priority 1: Unresolved conflicts (blocks compilation) ──────────────
	if (conflicts.unresolved.length > 0) {
		conflicts.unresolved.forEach((c) => {
			actions.push({
				priority: "P0-BLOCKER",
				score: 1000,
				command: `/resolve ${c.claim_a} ${c.claim_b}`,
				reason: `Unresolved conflict between ${c.claim_a} and ${c.claim_b} — blocks compilation.`,
				impact: "Unblocks compilation. Status changes from BLOCKED to READY.",
			});
		});
	}

	// ── Priority 2: Phase progression ──────────────────────────────────────
	const phaseFlow = ["init", "define", "research", "prototype", "evaluate"];
	const phaseIdx = phaseFlow.indexOf(phase);

	if (phase === "init") {
		actions.push({
			priority: "P1-PHASE",
			score: 900,
			command: "/init",
			reason:
				"Sprint not initialized. No question, constraints, or audience defined.",
			impact: "Establishes sprint question and seeds constraint claims.",
		});
	}

	// If in define, push toward research
	if (
		phase === "define" &&
		(!phases.research || phases.research.claims === 0)
	) {
		// Find topics with only constraint claims
		const constraintTopics = Object.entries(coverage)
			.filter(([, e]) => e.constraint_count === e.claims && e.claims > 0)
			.map(([t]) => t);
		const researchTarget = Object.entries(coverage)
			.sort((a, b) => a[1].claims - b[1].claims)
			.filter(([t]) => !constraintTopics.includes(t) || coverage[t].claims <= 1)
			.map(([t]) => t)[0];

		actions.push({
			priority: "P1-PHASE",
			score: 850,
			command: `/research "${researchTarget || "core topic"}"`,
			reason: `Phase is define with no research claims yet. Need to advance to research.`,
			impact: "Adds web-level evidence. Moves sprint into research phase.",
		});
	}

	// If lots of research but no prototypes
	if (phaseIdx >= 2 && (!phases.prototype || phases.prototype.claims === 0)) {
		// Find topic with most web claims — best candidate to upgrade
		const webHeavy = Object.entries(coverage)
			.filter(([, e]) => e.max_evidence === "web" && e.claims >= 2)
			.sort((a, b) => b[1].claims - a[1].claims);

		if (webHeavy.length > 0) {
			actions.push({
				priority: "P1-PHASE",
				score: 800,
				command: `/prototype "${webHeavy[0][0]}"`,
				reason: `Topic "${webHeavy[0][0]}" has ${webHeavy[0][1].claims} claims at web-level. Prototyping upgrades to tested.`,
				impact: `Evidence upgrade: web → tested for ${webHeavy[0][0]}. Enters prototype phase.`,
			});
		}
	}

	// ── Priority 3: Weak evidence topics ───────────────────────────────────
	const evidenceRank = {
		stated: 1,
		web: 2,
		documented: 3,
		tested: 4,
		production: 5,
	};
	const phaseExpectation = {
		define: 1,
		research: 2,
		prototype: 4,
		evaluate: 4,
	};
	const expected = phaseExpectation[phase] || 2;

	Object.entries(coverage).forEach(([topic, entry]) => {
		const rank = evidenceRank[entry.max_evidence] || 1;
		const constraintRatio = (entry.constraint_count || 0) / entry.claims;

		// Skip constraint-dominated topics
		if (constraintRatio > 0.5) return;

		if (rank < expected) {
			const gap = expected - rank;
			const score = 600 + gap * 50 + entry.claims * 5;

			if (rank <= 2 && expected >= 4) {
				actions.push({
					priority: "P2-EVIDENCE",
					score,
					command: `/prototype "${topic}"`,
					reason: `Topic "${topic}" is at ${entry.max_evidence} (${entry.claims} claims) but phase is ${phase}. Needs tested-level evidence.`,
					impact: `Evidence upgrade: ${entry.max_evidence} → tested. Closes coverage gap.`,
				});
			} else if (rank <= 1) {
				actions.push({
					priority: "P2-EVIDENCE",
					score,
					command: `/research "${topic}"`,
					reason: `Topic "${topic}" is at ${entry.max_evidence} (${entry.claims} claims). Needs deeper research.`,
					impact: `Evidence upgrade: ${entry.max_evidence} → web/documented.`,
				});
			}
		}
	});

	// ── Priority 4: Type monoculture ───────────────────────────────────────
	Object.entries(coverage).forEach(([topic, entry]) => {
		const constraintRatio = (entry.constraint_count || 0) / entry.claims;
		if (constraintRatio > 0.5) return;

		if ((entry.type_diversity || 0) < 2 && entry.claims >= 2) {
			const missing = (entry.missing_types || []).slice(0, 3).join(", ");
			actions.push({
				priority: "P3-DIVERSITY",
				score: 400 + entry.claims * 3,
				command: `/challenge ${entry.claim_ids?.[0] || topic}`,
				reason: `Topic "${topic}" has ${entry.claims} claims but only ${entry.type_diversity} type(s). Missing: ${missing}.`,
				impact: "Adds risk/recommendation claims. Improves type diversity.",
			});
		}

		// Missing risk claims specifically
		if (entry.claims >= 3 && !(entry.types || []).includes("risk")) {
			actions.push({
				priority: "P3-DIVERSITY",
				score: 380,
				command: `/challenge ${entry.claim_ids?.[0] || topic}`,
				reason: `Topic "${topic}" has ${entry.claims} claims but zero risks. What could go wrong?`,
				impact: "Adds adversarial risk claims. Stress-tests assumptions.",
			});
		}
	});

	// ── Priority 5: Echo chambers ──────────────────────────────────────────
	Object.entries(coverage).forEach(([topic, entry]) => {
		if (entry.claims >= 3 && (entry.source_count || 1) === 1) {
			actions.push({
				priority: "P4-CORROBORATION",
				score: 300 + entry.claims * 2,
				command: `/witness ${entry.claim_ids?.[0] || ""} <url>`,
				reason: `Topic "${topic}" has ${entry.claims} claims all from "${
					(entry.source_origins || ["unknown"])[0]
				}". Single source.`,
				impact: "Adds external corroboration. Breaks echo chamber.",
			});
		}
	});

	// ── Priority 6: Zero corroboration on high-value claims ────────────────
	const uncorroborated = Object.entries(corroboration)
		.filter(([, count]) => count === 0)
		.map(([id]) => id);

	// Find tested claims with zero corroboration — highest value to witness
	if (uncorroborated.length > 0) {
		const testedUncorroborated = (comp.resolved_claims || [])
			.filter((c) => c.evidence === "tested" && uncorroborated.includes(c.id))
			.slice(0, 1);

		if (testedUncorroborated.length > 0) {
			actions.push({
				priority: "P4-CORROBORATION",
				score: 250,
				command: `/witness ${testedUncorroborated[0].id} <url>`,
				reason: `Tested claim "${testedUncorroborated[0].id}" has zero external corroboration.`,
				impact: "Adds external validation to highest-evidence claim.",
			});
		}
	}

	// ── Priority 7: Sprint completion suggestions ──────────────────────────
	const hasEvaluate = phases.evaluate && phases.evaluate.claims > 0;
	const allTopicsTested = Object.entries(coverage)
		.filter(([, e]) => (e.constraint_count || 0) / e.claims <= 0.5)
		.every(([, e]) => evidenceRank[e.max_evidence] >= 4);

	if (hasEvaluate && allTopicsTested && conflicts.unresolved.length === 0) {
		actions.push({
			priority: "P5-SHIP",
			score: 100,
			command: "/brief",
			reason:
				"All non-constraint topics at tested evidence, evaluate phase complete, 0 conflicts.",
			impact: "Compiles the decision document. Sprint ready to ship.",
		});
	} else if (!hasEvaluate && phaseIdx >= 3) {
		actions.push({
			priority: "P1-PHASE",
			score: 750,
			command: "/evaluate",
			reason: `Phase is ${phase} but no evaluation claims exist. Time to test claims against reality.`,
			impact:
				"Validates claims, resolves conflicts, produces comparison dashboard.",
		});
	}

	// Sort by score descending
	actions.sort((a, b) => b.score - a.score);

	// Deduplicate by command
	const seen = new Set();
	return actions.filter((a) => {
		const key = a.command.split(" ").slice(0, 2).join(" ");
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

// Export for use as a library
export {
	compile,
	diffCompilations,
	computeNextActions,
	generateManifest,
	loadConfig,
	detectSprints,
	EVIDENCE_TIERS,
	VALID_TYPES,
};
