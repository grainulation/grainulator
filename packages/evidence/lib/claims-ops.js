/**
 * claims-ops — Shared claim operations for MCP + CLI
 *
 * Pure business logic extracted from serve-mcp.js.
 * Both the MCP tool handlers and the CLI commands import from here.
 *
 * Every function takes (dir, args) and returns a result object.
 *
 * Zero npm dependencies.
 */

import fs from "node:fs";
import { generateCertificate } from "../compiler/wheat-compiler.js";
import nextActionsModule from "./next-actions.cjs";
import path from "node:path";
import { atomicWriteJSON } from "../../shared/lib/atomic.js";
import { withFileTransaction } from "../../shared/lib/transaction.js";
import { loadClaims } from "./load-claims.js";

// --- Constants ---------------------------------------------------------------

const VALID_TYPES = [
	"constraint",
	"factual",
	"estimate",
	"risk",
	"recommendation",
	"feedback",
];
const VALID_EVIDENCE = ["stated", "web", "documented", "tested", "production"];

// --- Paths -------------------------------------------------------------------

function resolvePaths(dir) {
	return {
		claims: path.join(dir, "claims.json"),
		compilation: path.join(dir, "compilation.json"),
		brief: path.join(dir, "output", "brief.html"),
		compiler: path.join(dir, "wheat-compiler.js"),
	};
}

// --- Operations --------------------------------------------------------------

function addClaimUnlocked(dir, args) {
	const paths = resolvePaths(dir);
	if (!fs.existsSync(paths.claims)) {
		return {
			status: "error",
			message: "No claims.json found. Run grainulator init first.",
		};
	}

	const { id, type, topic, content, evidence, tags } = args;

	// Validate
	if (
		![id, type, topic, content].every(
			(value) => typeof value === "string" && value.trim(),
		)
	) {
		return {
			status: "error",
			message: "Required fields: id, type, topic, content",
		};
	}
	if (!VALID_TYPES.includes(type)) {
		return {
			status: "error",
			message: `Invalid type "${type}". Valid: ${VALID_TYPES.join(", ")}`,
		};
	}
	if (evidence && !VALID_EVIDENCE.includes(evidence)) {
		return {
			status: "error",
			message: `Invalid evidence "${evidence}". Valid: ${VALID_EVIDENCE.join(
				", ",
			)}`,
		};
	}

	for (const key of ["tags", "conflicts_with"]) {
		if (
			args[key] !== undefined &&
			(!Array.isArray(args[key]) ||
				args[key].some((value) => typeof value !== "string" || !value.trim()))
		)
			return {
				status: "error",
				message: `${key} must be an array of nonempty strings.`,
			};
	}
	if (args.source !== undefined) {
		if (
			!args.source ||
			typeof args.source !== "object" ||
			Array.isArray(args.source)
		)
			return {
				status: "error",
				message:
					"source must be an object with an origin and optional artifact and connector.",
			};
		if (typeof args.source.origin !== "string" || !args.source.origin.trim())
			return {
				status: "error",
				message: "source.origin must be a nonempty string.",
			};
		for (const key of [
			"artifact",
			"connector",
			"witnessed_claim",
			"challenged_claim",
		])
			if (
				args.source[key] !== undefined &&
				args.source[key] !== null &&
				typeof args.source[key] !== "string"
			)
				return {
					status: "error",
					message: `source.${key} must be a string or null.`,
				};
		if (
			args.source.relationship !== undefined &&
			!["full_support", "partial_support", "contradicts"].includes(
				args.source.relationship,
			)
		)
			return {
				status: "error",
				message:
					"source.relationship must be full_support, partial_support, or contradicts.",
			};
	}

	const { data, errors: loadErrors } = loadClaims(dir);
	if (!data) {
		return {
			status: "error",
			message: loadErrors[0]?.message || "Failed to load claims.json",
		};
	}

	// Check for duplicate ID
	const claims = data.claims || [];
	if (claims.some((c) => c.id === id)) {
		return { status: "error", message: `Claim ID "${id}" already exists.` };
	}

	if (args.calibration !== undefined) {
		const cal = args.calibration;
		const target = claims.find(
			(c) => c.id === cal?.prediction_id && c.status === "active",
		);
		if (
			!cal ||
			!target ||
			!["estimate", "risk", "recommendation"].includes(target.type) ||
			!["correct", "wrong", "partial", "unknown"].includes(cal.verdict) ||
			typeof cal.outcome !== "string" ||
			!cal.outcome.trim() ||
			(cal.delta !== undefined && !Number.isFinite(cal.delta))
		) {
			return {
				status: "error",
				message:
					"calibration requires an active prediction_id (estimate/risk/recommendation), verdict (correct/wrong/partial/unknown), outcome text and optional finite numeric delta.",
			};
		}
	}
	const claim = {
		id,
		type,
		topic,
		content,
		source: args.source
			? {
					...args.source,
					origin: args.source.origin.trim(),
					artifact: args.source.artifact ?? null,
					connector: args.source.connector ?? null,
				}
			: { origin: "cli", artifact: null, connector: null },
		evidence: evidence || "stated",
		status: "active",
		phase_added: (data.meta || {}).phase || "research",
		timestamp: new Date().toISOString(),
		conflicts_with: args.conflicts_with || [],
		resolved_by: null,
		tags: tags || [],
		...(args.calibration ? { calibration: { ...args.calibration } } : {}),
	};

	(data.claims || (data.claims = [])).push(claim);
	try {
		atomicWriteJSON(paths.claims, data, 2);
	} catch (err) {
		return {
			status: "error",
			message: `Failed to write claims.json: ${err.message}`,
		};
	}

	return { status: "ok", message: `Claim ${id} added.`, claim };
}

function mutate(dir, args, operation) {
	try {
		return withFileTransaction(path.join(dir, "claims.json"), () =>
			operation(dir, args),
		);
	} catch (error) {
		return {
			status: "error",
			code: error.code || "E_WRITE",
			message: error.message,
		};
	}
}
function addClaim(dir, args) {
	return mutate(dir, args, addClaimUnlocked);
}
function resolveClaim(dir, args) {
	return mutate(dir, args, resolveClaimUnlocked);
}

function searchClaims(dir, args) {
	const { data, errors: loadErrors } = loadClaims(dir);
	if (!data) {
		return {
			status: "error",
			message: loadErrors[0]?.message || "No claims.json found.",
		};
	}
	let results = data.claims.filter(
		(c) => args.include_inactive || c.status === "active",
	);
	if (args.id) results = results.filter((c) => c.id === args.id);

	if (args.topic) {
		results = results.filter((c) => c.topic === args.topic);
	}
	if (args.type) {
		results = results.filter((c) => c.type === args.type);
	}
	if (args.evidence) {
		results = results.filter((c) => c.evidence === args.evidence);
	}
	if (args.query) {
		const q = args.query.toLowerCase();
		results = results.filter((c) => c.content.toLowerCase().includes(q));
	}

	return {
		status: "ok",
		count: results.length,
		claims: results.map((c) =>
			args.full || args.id
				? { ...c }
				: {
						id: c.id,
						status: c.status,
						timestamp: c.timestamp,
						truncated: c.content.length > 200,
						type: c.type,
						topic: c.topic,
						evidence: c.evidence,
						content:
							c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
						source: c.source,
						tags: c.tags,
						conflicts_with: c.conflicts_with,
					},
		),
	};
}

function resolveClaimUnlocked(dir, args) {
	const paths = resolvePaths(dir);
	if (!fs.existsSync(paths.claims)) {
		return { status: "error", message: "No claims.json found." };
	}

	const { winner, loser, reason } = args;
	if (!winner || !loser) {
		return { status: "error", message: "Required fields: winner, loser" };
	}

	const { data, errors: loadErrors } = loadClaims(dir);
	if (!data) {
		return {
			status: "error",
			message: loadErrors[0]?.message || "Failed to load claims.json",
		};
	}
	const winnerClaim = data.claims.find((c) => c.id === winner);
	const loserClaim = data.claims.find((c) => c.id === loser);

	if (!winnerClaim)
		return { status: "error", message: `Claim "${winner}" not found.` };
	if (!loserClaim)
		return { status: "error", message: `Claim "${loser}" not found.` };

	const winnerConflicts = winnerClaim.conflicts_with || [];
	const loserConflicts = loserClaim.conflicts_with || [];
	if (!winnerConflicts.includes(loser) && !loserConflicts.includes(winner)) {
		return {
			status: "error",
			message: `Cannot resolve: "${winner}" and "${loser}" have no conflicts_with relationship.`,
		};
	}

	// Clear conflict references
	winnerClaim.conflicts_with = (winnerClaim.conflicts_with || []).filter(
		(cid) => cid !== loser,
	);
	loserClaim.conflicts_with = [];
	loserClaim.status = "superseded";
	loserClaim.resolved_by = winner;
	loserClaim.resolution = {
		reason: reason || null,
		winner,
		resolved_at: new Date().toISOString(),
	};

	try {
		atomicWriteJSON(paths.claims, data, 2);
	} catch (err) {
		return {
			status: "error",
			message: `Failed to write claims.json: ${err.message}`,
		};
	}

	return {
		status: "ok",
		message: `Resolved: ${winner} wins over ${loser}${
			reason ? ` (${reason})` : ""
		}.`,
		winner: winnerClaim.id,
		loser: loserClaim.id,
	};
}

function getStatus(dir) {
	const { data, errors: loadErrors } = loadClaims(dir);
	if (!data) {
		return {
			status: "no_sprint",
			message:
				loadErrors[0]?.message ||
				"No claims.json found. Run wheat init to start a sprint.",
		};
	}

	const claims = data.claims || [];
	const active = claims.filter((c) => c.status === "active");
	const conflicted = claims.filter(
		(c) =>
			c.status === "conflicted" ||
			(c.conflicts_with &&
				c.conflicts_with.length > 0 &&
				c.status === "active"),
	);
	const topics = [...new Set(active.map((c) => c.topic))];
	const types = Object.fromEntries(VALID_TYPES.map((type) => [type, 0]));
	active.forEach((c) => {
		types[c.type] = (types[c.type] || 0) + 1;
	});

	const activeIds = new Set(active.map((c) => c.id));
	const edges = new Map();
	for (const c of active)
		for (const id of c.conflicts_with || []) {
			if (activeIds.has(id))
				edges.set(JSON.stringify([c.id, id].sort()), [c.id, id]);
		}
	const evidenceDistribution = Object.fromEntries(
		VALID_EVIDENCE.map((tier) => [tier, 0]),
	);
	for (const c of active)
		evidenceDistribution[c.evidence] =
			(evidenceDistribution[c.evidence] || 0) + 1;
	const paths = resolvePaths(dir);
	let compilationStatus = "unknown";
	let next_actions = {
		auto: [
			{
				command: "grainulator compile --summary",
				label: "Refresh the compiled evidence",
				reason:
					"No current compilation is available; compile before choosing evidence-based next actions.",
				claim_ids: [],
			},
		],
		manual: [],
	};
	if (fs.existsSync(paths.compilation)) {
		try {
			const comp = JSON.parse(fs.readFileSync(paths.compilation, "utf8"));
			if (
				comp.compilation_certificate?.input_hash ===
				generateCertificate(JSON.parse(fs.readFileSync(paths.claims, "utf8")))
					.input_hash
			) {
				compilationStatus = comp.status || "unknown";
				next_actions = nextActionsModule.nextActions(comp);
			} else {
				compilationStatus = "stale";
			}
		} catch {
			/* ignore */
		}
	}

	return {
		status: "ok",
		dir: path.resolve(dir),
		topic_list: topics,
		evidence_distribution: evidenceDistribution,
		conflicts: [...edges.values()],
		question: (data.meta || {}).question || "(no question set)",
		phase: (data.meta || {}).phase || "unknown",
		total_claims: claims.length,
		active_claims: active.length,
		conflicted_claims: conflicted.length,
		topics: topics.length,
		type_distribution: types,
		compilation_status: compilationStatus,
		next_actions,
		next_actions_instruction: nextActionsModule.nextActionsInstruction,
	};
}

export {
	addClaim,
	getStatus,
	resolveClaim,
	resolvePaths,
	searchClaims,
	VALID_EVIDENCE,
	VALID_TYPES,
};
