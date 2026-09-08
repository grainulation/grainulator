/**
 * wheat stats — Local sprint statistics (self-inspection only)
 *
 * Scans the repo for all sprints (via detect-sprints logic) and prints
 * aggregate statistics: claim counts by phase/type/evidence, sprint count,
 * and repo age.
 *
 * LOCAL only — no phone-home, no analytics, no network calls.
 * Zero npm dependencies.
 */

import fs from "fs";
import path from "path";
import { loadClaims } from "./load-claims.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Find all claims.json files in repo (root + examples/). */
function findAllClaims(dir) {
	const results = [];

	// Root-level claims.json
	const rootClaims = path.join(dir, "claims.json");
	if (fs.existsSync(rootClaims)) {
		results.push({ path: rootClaims, label: "." });
	}

	// examples/<name>/claims.json
	const examplesDir = path.join(dir, "examples");
	if (fs.existsSync(examplesDir)) {
		try {
			for (const entry of fs.readdirSync(examplesDir, {
				withFileTypes: true,
			})) {
				if (!entry.isDirectory()) continue;
				const claimsPath = path.join(examplesDir, entry.name, "claims.json");
				if (fs.existsSync(claimsPath)) {
					results.push({ path: claimsPath, label: `examples/${entry.name}` });
				}
			}
		} catch {
			/* skip if unreadable */
		}
	}

	return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function run(dir, _args) {
	const sprintFiles = findAllClaims(dir);

	if (sprintFiles.length === 0) {
		console.log();
		console.log("  No sprints found in this directory.");
		console.log('  Run "wheat init" to start a research sprint.');
		console.log();
		process.exit(0);
	}

	// Aggregate all claims across sprints
	let totalClaims = 0;
	let earliestDate = null;
	const byPhase = {};
	const byType = {};
	const byEvidence = {};
	const sprintSummaries = [];

	for (const sf of sprintFiles) {
		const sfDir = path.dirname(sf.path);
		const sfFilename = path.basename(sf.path);
		const { data } = loadClaims(sfDir, { filename: sfFilename });
		if (!data) continue;

		const meta = data.meta || {};
		const claims = data.claims || [];
		const active = claims.filter((c) => c.status === "active");

		totalClaims += claims.length;

		// Track earliest sprint initiation
		if (meta.initiated) {
			const d = new Date(meta.initiated);
			if (!earliestDate || d < earliestDate) earliestDate = d;
		}

		// Accumulate by phase_added
		for (const c of claims) {
			const phase = c.phase_added || "unknown";
			byPhase[phase] = (byPhase[phase] || 0) + 1;
		}

		// Accumulate by type
		for (const c of claims) {
			byType[c.type || "unknown"] = (byType[c.type || "unknown"] || 0) + 1;
		}

		// Accumulate by evidence tier
		for (const c of claims) {
			byEvidence[c.evidence || "unknown"] =
				(byEvidence[c.evidence || "unknown"] || 0) + 1;
		}

		sprintSummaries.push({
			label: sf.label,
			question: (meta.question || "").slice(0, 60),
			phase: meta.phase || "unknown",
			claims: claims.length,
			active: active.length,
		});
	}

	// ─── Print ────────────────────────────────────────────────────────────────

	console.log();
	console.log("  \x1b[1mwheat stats\x1b[0m — local sprint statistics");
	console.log(`  ${"─".repeat(50)}`);
	console.log();

	// Sprint count
	console.log(`  Sprints:     ${sprintFiles.length}`);
	console.log(`  Claims:      ${totalClaims} total`);

	// Age
	if (earliestDate) {
		const days = Math.floor((Date.now() - earliestDate.getTime()) / 86400000);
		console.log(
			`  Age:         ${days} days since first sprint (${earliestDate
				.toISOString()
				.slice(0, 10)})`,
		);
	}

	console.log();

	// By phase
	console.log("  \x1b[1mClaims by phase:\x1b[0m");
	const phaseOrder = [
		"define",
		"research",
		"prototype",
		"evaluate",
		"feedback",
	];
	const allPhases = [...new Set([...phaseOrder, ...Object.keys(byPhase)])];
	for (const p of allPhases) {
		if (byPhase[p]) {
			console.log(`    ${p.padEnd(12)} ${byPhase[p]}`);
		}
	}

	console.log();

	// By type
	console.log("  \x1b[1mClaims by type:\x1b[0m");
	const typeOrder = [
		"constraint",
		"factual",
		"estimate",
		"risk",
		"recommendation",
		"feedback",
	];
	const allTypes = [...new Set([...typeOrder, ...Object.keys(byType)])];
	for (const t of allTypes) {
		if (byType[t]) {
			console.log(`    ${t.padEnd(16)} ${byType[t]}`);
		}
	}

	console.log();

	// By evidence tier
	console.log("  \x1b[1mClaims by evidence:\x1b[0m");
	const evidenceOrder = ["stated", "web", "documented", "tested", "production"];
	const allEvidence = [
		...new Set([...evidenceOrder, ...Object.keys(byEvidence)]),
	];
	for (const e of allEvidence) {
		if (byEvidence[e]) {
			console.log(`    ${e.padEnd(14)} ${byEvidence[e]}`);
		}
	}

	console.log();

	// Per-sprint table
	if (sprintFiles.length > 1) {
		console.log("  \x1b[1mPer-sprint breakdown:\x1b[0m");
		for (const s of sprintSummaries) {
			console.log(
				`    ${s.label.padEnd(30)} ${String(s.claims).padStart(4)} claims  (${
					s.active
				} active)  [${s.phase}]`,
			);
			if (s.question) {
				console.log(
					`      "${s.question}${s.question.length >= 60 ? "..." : ""}"`,
				);
			}
		}
		console.log();
	}

	console.log(
		"  No data leaves your machine. This is local self-inspection only.",
	);
	console.log();
}
