import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compile } from "../../packages/evidence/compiler/wheat-compiler.js";
import { addClaim } from "../../packages/evidence/lib/claims-ops.js";
import { initializeSprint } from "../../lib/sprint-init.js";

/**
 * Evaluates a single adversarial case against the evidence ledger and compiler.
 * Returns { rejected: boolean, reason: string }.
 */
export function evaluateAdversarialCase(entry) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-rc-"));
	try {
		initializeSprint(tmp, {
			question: "Adversarial rejected-claims check",
			audience: "engineers",
			constraints: "",
			done: "Reject invalid or unresolved conflicting claims",
		});
		for (const seed of entry.seed_claims || []) {
			const res = addClaim(tmp, seed);
			if (res.status === "error") {
				return { rejected: true, reason: `seed error: ${res.message}` };
			}
		}
		const added = addClaim(tmp, entry.claim);
		if (added.status === "error") {
			if ( added.message.includes("quote") || added.message.includes("passage")) {
				return { rejected: true, reason: "NO: quote_not_in_passage" };
			}
			if (added.message.includes("origin")) {
				return { rejected: true, reason: "NO: invalid_source_origin" };
			}
			return { rejected: true, reason: `NO: ${added.message}` };
		}
		const compiled = compile(
			path.join(tmp, "claims.json"),
			path.join(tmp, "compilation.json"),
			tmp,
		);
		if (compiled.status === "blocked" || (compiled.conflicts?.unresolved?.length ?? 0) > 0) {
			return { rejected: true, reason: "NO: unresolved_conflict" };
		}
		return { rejected: false, reason: "ACCEPT: claim was falsely certified" };
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

// When invoked as a runner verifier subprocess: reads request from stdin.
// If the adapter answer reports all cases rejected with their expected reason_code -> exit 0.
// If the adapter or checker falsely accepts an adversarial claim -> exit 3 (soundness break).
if (import.meta.url === `file://${process.argv[1]}`) {
	const raw = fs.readFileSync(0, "utf8").trim();
	const req = raw ? JSON.parse(raw) : {};
	let parsed;
	try {
		parsed = typeof req.answer === "string" ? JSON.parse(req.answer) : req.answer;
	} catch {
		console.error("Invalid JSON answer from adapter");
		process.exit(1);
	}
	const corpus = JSON.parse(
		fs.readFileSync(new URL("./corpus.json", import.meta.url), "utf8"),
	);
	for (const entry of corpus) {
		const actual = evaluateAdversarialCase(entry);
		const reported = parsed?.[entry.id];
		if (!actual.rejected || reported?.verdict === "ACCEPTED") {
			console.error(
				`LOOK: soundness break on ${entry.id}: expected ${entry.reason_code}, got ${reported?.verdict || actual.reason}`,
			);
			process.exit(3);
		}
		if (reported?.reason_code !== entry.reason_code) {
			console.error(
				`Mismatch on ${entry.id}: expected ${entry.reason_code}, got ${reported?.reason_code}`,
			);
			process.exit(1);
		}
	}
	console.log(`YES: all ${corpus.length} adversarial claims rejected as expected`);
	process.exit(0);
}
