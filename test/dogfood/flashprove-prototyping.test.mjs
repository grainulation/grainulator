import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateAdversarialCase } from "../../evals/rejected-claims/verifier.mjs";
import { runTask } from "../../lib/runner.js";
import { initializeSprint } from "../../lib/sprint-init.js";
import { compile } from "../../packages/evidence/compiler/wheat-compiler.js";
import { addClaim } from "../../packages/evidence/lib/claims-ops.js";

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

test("source.what_differs is validated, stored in claims.json, and preserved in compilation.json", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-differs-"));
	try {
		initializeSprint(tmp, {
			question: "Does what_differs survive compilation?",
			audience: "engineers",
			constraints: "",
			done: "Verified compilation",
		});
		const bad = addClaim(tmp, {
			id: "r001",
			type: "factual",
			topic: "protocol",
			content: "Uses non-interactive masking.",
			evidence: "documented",
			source: {
				origin: "ePrint 2026/391",
				artifact: "paper.pdf",
				what_differs: 123,
			},
		});
		assert.equal(bad.status, "error");
		assert.match(bad.message, /source\.what_differs must be a string or null/);

		const good = addClaim(tmp, {
			id: "r001",
			type: "factual",
			topic: "protocol",
			content: "Uses kept rows across code-switching rounds.",
			evidence: "documented",
			source: {
				origin: "ePrint 2026/391",
				artifact: "blocks/iop/fold.h",
				what_differs:
					"Keeps unfolded rows for a later stage; masking bound in H1.1 differs from Lemma 9.3.",
			},
		});
		assert.equal(good.status, "ok");

		const compiled = compile(
			path.join(tmp, "claims.json"),
			path.join(tmp, "compilation.json"),
			tmp,
		);
		assert.equal(compiled.status, "ready");
		const resolved = compiled.resolved_claims.find((c) => c.id === "r001");
		assert.equal(
			resolved.source.what_differs,
			"Keeps unfolded rows for a later stage; masking bound in H1.1 differs from Lemma 9.3.",
		);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

test("evals/rejected-claims corpus rejects every adversarial fixture with its expected reason code", () => {
	const corpus = JSON.parse(
		fs.readFileSync(
			path.join(ROOT, "evals/rejected-claims/corpus.json"),
			"utf8",
		),
	);
	assert.ok(corpus.length >= 3);
	for (const entry of corpus) {
		const res = evaluateAdversarialCase(entry);
		assert.equal(res.rejected, true, `Expected ${entry.id} to be rejected`);
		assert.equal(res.reason, entry.reason_code);
	}
});

test("runner.js treats verifier exit code 3 as an immediate soundness_break without retrying", async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-sb-"));
	try {
		const dishonesAdapter = path.join(tmp, "dishonest-adapter.mjs");
		fs.writeFileSync(
			dishonesAdapter,
			`import fs from "node:fs";
const req = JSON.parse(fs.readFileSync(0, "utf8"));
console.log(JSON.stringify({ answer: JSON.stringify({ "rc-001-quote-not-in-passage": { verdict: "ACCEPTED" } }) }));
`,
		);
		const verifierPath = path.join(ROOT, "evals/rejected-claims/verifier.mjs");
		const res = await runTask({
			task: "Check adversarial claims",
			adapter: [process.execPath, dishonesAdapter],
			verifier: [process.execPath, verifierPath],
			cwd: tmp,
			maxRounds: 3,
		});
		assert.equal(res.status, "soundness_break");
		assert.equal(
			res.rounds.length,
			1,
			"Must halt immediately on round 1 when soundness breaks",
		);
		assert.equal(res.rounds[0].verification.exitCode, 3);
		assert.equal(res.rounds[0].verification.soundnessBreak, true);
		assert.match(res.rounds[0].verification.feedback, /LOOK: soundness break/);

		const honestAdapter = path.join(tmp, "honest-adapter.mjs");
		fs.writeFileSync(
			honestAdapter,
			`import fs from "node:fs";
const corpus = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(ROOT, "evals/rejected-claims/corpus.json"))}, "utf8"));
const out = Object.fromEntries(corpus.map((c) => [c.id, { verdict: "REJECTED", reason_code: c.reason_code }]));
console.log(JSON.stringify({ answer: JSON.stringify(out) }));
`,
		);
		const honestRes = await runTask({
			task: "Check adversarial claims",
			adapter: [process.execPath, honestAdapter],
			verifier: [process.execPath, verifierPath],
			cwd: tmp,
			maxRounds: 3,
		});
		assert.equal(honestRes.status, "verified");
		assert.equal(honestRes.rounds[0].verification.exitCode, 0);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

test("docs/limits.json matches the rendered Markdown table in docs/BLIND-SPOTS.md", () => {
	const limits = JSON.parse(
		fs.readFileSync(path.join(ROOT, "docs/limits.json"), "utf8"),
	);
	const md = fs.readFileSync(path.join(ROOT, "docs/BLIND-SPOTS.md"), "utf8");
	const rows = [
		...md.matchAll(
			/^\|\s*`(L\d+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm,
		),
	];
	assert.equal(
		rows.length,
		limits.length,
		"Markdown table row count must equal docs/limits.json length",
	);
	for (let i = 0; i < limits.length; i++) {
		const [, id, area, limit, status, mitigation] = rows[i];
		assert.deepEqual({ id, area, limit, status, mitigation }, limits[i]);
	}
});
