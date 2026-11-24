// Generated from typescript/evals/rejected-claims/verifier.mts; edit that source and run npm run build:types.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeSprint } from "../../lib/sprint-init.js";
import { compile } from "../../packages/evidence/compiler/evidence-compiler.js";
import { addClaim } from "../../packages/evidence/lib/claims-ops.js";
/**
 * Evaluates a single adversarial case against the evidence ledger and compiler.
 * Returns { rejected: boolean, reason: string }.
 */
export function evaluateAdversarialCase(entry) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-rc-"));
	try {
		const initialized = initializeSprint(tmp, {
			question: "Adversarial rejected-claims check",
			audience: "engineers",
			constraints: "",
			done: "Reject invalid or unresolved conflicting claims",
		});
		if (initialized.status === "error")
			throw new Error(`setup error: ${initialized.message}`);
		for (const seed of entry.seed_claims || []) {
			const res = addClaim(tmp, seed);
			if (res.status === "error") {
				throw new Error(`seed error: ${res.message}`);
			}
		}
		const added = addClaim(tmp, entry.claim);
		if (added.status === "error") {
			if (added.message === "source.quote does not occur in the passage.") {
				return { rejected: true, reason: "NO: quote_not_in_passage" };
			}
			if (added.message === "source.origin must be a nonempty string.") {
				return { rejected: true, reason: "NO: invalid_source_origin" };
			}
			return { rejected: true, reason: `NO: ${added.message}` };
		}
		const compiled = compile(
			path.join(tmp, "claims.json"),
			path.join(tmp, "compilation.json"),
			tmp,
		);
		if ((compiled.conflict_graph?.unresolved?.length ?? 0) > 0) {
			return { rejected: true, reason: "NO: unresolved_conflict" };
		}
		if (compiled.status !== "ready") {
			throw new Error(`Unexpected compilation status: ${compiled.status}`);
		}
		return {
			rejected: false,
			reason: "ACCEPT: adversarial claim passed structural checks",
		};
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}
// Resolve native paths rather than constructing file URLs: spaces, #, Unicode,
// Windows drive letters and a symlink used as argv[1] must all run the verifier.
function isMain() {
	if (!process.argv[1]) return false;
	try {
		return (
			fs.realpathSync(fileURLToPath(import.meta.url)) ===
			fs.realpathSync(process.argv[1])
		);
	} catch {
		return false;
	}
}
const isObject = (value) =>
	value !== null && typeof value === "object" && !Array.isArray(value);
// Exit 0 requires explicit rejection and matching adapter AND local reasons.
// Exit 3 denotes a false acceptance; malformed input/setup failures use exit 1.
if (isMain()) {
	try {
		const req = JSON.parse(fs.readFileSync(0, "utf8"));
		if (!isObject(req)) throw new Error("Request must be an object");
		const parsed =
			typeof req.answer === "string" ? JSON.parse(req.answer) : req.answer;
		if (!isObject(parsed)) throw new Error("Answer must be an object");
		const corpus = JSON.parse(
			fs.readFileSync(new URL("./corpus.json", import.meta.url), "utf8"),
		);
		// An explicit false acceptance remains a soundness break even if another
		// case is absent. Otherwise require the complete, valid rejection report.
		for (const entry of corpus) {
			const reported = parsed[entry.id];
			if (isObject(reported) && reported.verdict === "ACCEPTED") {
				console.error(
					`LOOK: soundness break on ${entry.id}: expected ${entry.reason_code}, got ACCEPTED`,
				);
				process.exit(3);
			}
		}
		for (const entry of corpus) {
			const reported = parsed[entry.id];
			if (
				!Object.hasOwn(parsed, entry.id) ||
				!isObject(reported) ||
				reported.verdict !== "REJECTED" ||
				typeof reported.reason_code !== "string"
			) {
				throw new Error(`Invalid rejection report for ${entry.id}`);
			}
			if (reported.reason_code !== entry.reason_code) {
				throw new Error(
					`Mismatch on ${entry.id}: expected ${entry.reason_code}, got ${reported.reason_code}`,
				);
			}
			const actual = evaluateAdversarialCase(entry);
			if (!actual.rejected) {
				console.error(
					`LOOK: soundness break on ${entry.id}: expected ${entry.reason_code}, got ${actual.reason}`,
				);
				process.exit(3);
			}
			if (actual.reason !== entry.reason_code) {
				throw new Error(
					`Local reason mismatch on ${entry.id}: expected ${entry.reason_code}, got ${actual.reason}`,
				);
			}
		}
		console.log(
			`YES: all ${corpus.length} adversarial claims rejected as expected`,
		);
	} catch (err) {
		console.error(
			`Verifier error: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exitCode = 1;
	}
}
