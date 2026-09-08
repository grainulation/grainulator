/**
 * grainulator status — Quick sprint status check
 *
 * Runs the compiler in summary mode against the target directory.
 * Provides a fast terminal snapshot of sprint health.
 *
 * Zero npm dependencies.
 */

import fs from "fs";
import nextActionsModule from "./next-actions.cjs";
import path from "path";
import { compile } from "../compiler/wheat-compiler.js";
import { loadClaims } from "./load-claims.js";

export async function run(dir, args) {
	const jsonMode = args.includes("--json");
	const claimsPath = path.join(dir, "claims.json");

	if (!fs.existsSync(claimsPath)) {
		if (jsonMode) {
			console.log(
				JSON.stringify({
					error: "no_sprint",
					message: "No sprint found in this directory.",
				}),
			);
			process.exit(0);
		}
		console.log();
		console.log("  No sprint found in this directory.");
		console.log('  Run "grainulator init" to start a research sprint.');
		console.log();
		process.exit(0);
	}

	const { data: claimsData, errors: loadErrors } = loadClaims(dir);
	if (!claimsData) {
		const msg =
			loadErrors.length > 0
				? loadErrors[0].message
				: "Failed to load claims.json";
		console.error(`  ${msg}`);
		process.exit(1);
	}
	const compilationPath = path.join(dir, "compilation.json");
	const compilation = compile(claimsPath, compilationPath, dir);

	const meta = claimsData.meta || {};
	const claims = claimsData.claims || [];
	const active = claims.filter((c) => c.status === "active");
	const superseded = claims.filter((c) => c.status === "superseded");

	if (jsonMode) {
		const tiers = {};
		for (const c of active) {
			tiers[c.evidence] = (tiers[c.evidence] || 0) + 1;
		}
		const result = {
			question: meta.question || null,
			phase: meta.phase || "unknown",
			status: compilation.status,
			next_actions: compilation.next_actions,
			claims: {
				total: claims.length,
				active: active.length,
				superseded: superseded.length,
			},
			evidence: tiers,
		};
		if (compilation.conflict_graph) {
			result.conflicts = {
				resolved: compilation.conflict_graph.resolved.length,
				unresolved: compilation.conflict_graph.unresolved.length,
			};
		}
		if (compilation.coverage) {
			result.topics = Object.keys(compilation.coverage);
		}
		if (meta.initiated) {
			const days = Math.floor(
				(Date.now() - new Date(meta.initiated).getTime()) / 86400000,
			);
			result.age = { days, initiated: meta.initiated };
		}
		console.log(JSON.stringify(result, null, 2));
		process.exit(0);
	}

	const icon =
		compilation.status === "ready" ? "\x1b[32m●\x1b[0m" : "\x1b[31m●\x1b[0m";

	console.log();
	console.log(`  ${icon} \x1b[1m${meta.question || "No question set"}\x1b[0m`);
	console.log(`  ${"─".repeat(50)}`);
	console.log(`  Phase:       ${meta.phase || "unknown"}`);
	console.log(`  Status:      ${compilation.status}`);
	console.log(
		`  Claims:      ${claims.length} total, ${active.length} active, ${superseded.length} superseded`,
	);

	// Evidence breakdown
	const tiers = {};
	for (const c of active) {
		tiers[c.evidence] = (tiers[c.evidence] || 0) + 1;
	}
	const tierStr = Object.entries(tiers)
		.map(([k, v]) => `${k}:${v}`)
		.join("  ");
	if (tierStr) {
		console.log(`  Evidence:    ${tierStr}`);
	}

	// Conflicts
	if (compilation.conflict_graph) {
		const { resolved, unresolved } = compilation.conflict_graph;
		if (resolved.length > 0 || unresolved.length > 0) {
			console.log(
				`  Conflicts:   ${resolved.length} resolved, ${unresolved.length} unresolved`,
			);
		}
	}

	// Topics
	if (compilation.coverage) {
		const topics = Object.keys(compilation.coverage);
		console.log(`  Topics:      ${topics.length} (${topics.join(", ")})`);
	}

	// Initiated
	if (meta.initiated) {
		const days = Math.floor(
			(Date.now() - new Date(meta.initiated).getTime()) / 86400000,
		);
		console.log(`  Age:         ${days} days (since ${meta.initiated})`);
	}

	console.log();

	console.log(nextActionsModule.formatNextActions(compilation.next_actions));
}
