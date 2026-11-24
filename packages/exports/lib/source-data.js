// Generated from typescript/packages/exports/lib/source-data.ts; edit that source and run npm run build:types.
"use strict";
("use strict");
const fs = require("node:fs");
/** Normalize supported sprint data without guessing or merging another ledger. */
function normalizeSource(data) {
	if (Array.isArray(data)) data = { claims: data };
	if (!data || typeof data !== "object") {
		throw new Error(
			"Expected claims or compilation JSON. Export claims.json, or run grainulator compile --dir <sprint> first.",
		);
	}
	for (const field of ["claims", "resolved_claims"]) {
		if (data[field] !== undefined && !Array.isArray(data[field])) {
			throw new Error(
				`${field} must be an array. Export a valid claims.json or recompile the sprint.`,
			);
		}
	}
	const claims = data.claims?.length
		? data.claims
		: (data.resolved_claims ?? data.claims);
	if (data.conflicts !== undefined && !Array.isArray(data.conflicts)) {
		throw new Error(
			"conflicts must be an array. Export valid sprint JSON or recompile the sprint.",
		);
	}
	const rawGraph = data.conflict_graph;
	let graph = Array.isArray(rawGraph) ? rawGraph : undefined;
	if (rawGraph !== undefined && !Array.isArray(rawGraph)) {
		const graphObject = rawGraph;
		if (!graphObject || typeof graphObject !== "object")
			throw new Error(
				"conflict_graph must be an array or a compiler graph object.",
			);
		for (const field of ["resolved", "unresolved"]) {
			if (
				graphObject[field] !== undefined &&
				!Array.isArray(graphObject[field])
			)
				throw new Error(`conflict_graph.${field} must be an array.`);
		}
		const rows = [];
		for (const [field, entries] of [
			["unresolved", graphObject.unresolved || []],
			["resolved", graphObject.resolved || []],
		]) {
			for (const entry of entries) {
				if (!entry || typeof entry !== "object" || Array.isArray(entry))
					throw new Error("Conflict entries must be objects.");
				rows.push({
					...entry,
					ids:
						entry.ids ||
						(field === "resolved"
							? [entry.winner, entry.loser]
							: [entry.claimA, entry.claimB]
						).map((id) => {
							if (typeof id !== "string")
								throw new Error("Conflict ids must be strings.");
							return id;
						}),
					...(field === "resolved"
						? { resolution: entry.resolution || entry.reason || "resolved" }
						: {}),
				});
			}
		}
		graph = rows;
	}
	const conflicts = data.conflicts?.length
		? data.conflicts
		: (graph ?? data.conflicts ?? []);
	for (const conflict of conflicts) {
		if (!conflict || typeof conflict !== "object" || Array.isArray(conflict))
			throw new Error("Conflict entries must be objects.");
		if (
			conflict.ids !== undefined &&
			(!Array.isArray(conflict.ids) ||
				conflict.ids.some((id) => typeof id !== "string"))
		)
			throw new Error("Conflict ids must be an array of strings.");
	}
	if (!claims) {
		throw new Error(
			"No claims array found. Export claims.json, or run grainulator compile --dir <sprint> to regenerate compilation.json.",
		);
	}
	for (const claim of claims) {
		if (
			!claim ||
			typeof claim !== "object" ||
			Array.isArray(claim) ||
			![claim.content, claim.text].some(
				(value) => typeof value === "string" && value.trim(),
			)
		) {
			throw new Error(
				"Claim content is missing or invalid. Export the original claims.json, or run grainulator compile --dir <sprint> to regenerate compilation.json with full claim content.",
			);
		}
	}
	return {
		...data,
		claims,
		meta: data.meta || data.sprint_meta || {},
		conflicts,
		certificate: data.certificate || data.compilation_certificate || {},
	};
}
function loadSource(inputPath) {
	let data;
	try {
		data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
	} catch (caughterror) {
		const error =
			caughterror instanceof Error
				? caughterror
				: new Error(String(caughterror));
		throw new Error(
			`Cannot read sprint JSON from ${inputPath}: ${error.message}`,
		);
	}
	return normalizeSource(data);
}
module.exports = { normalizeSource, loadSource };
