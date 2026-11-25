import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateAdversarialCase } from "../../evals/rejected-claims/verifier.mjs";
import { runTask } from "../../lib/runner.js";
import { initializeSprint } from "../../lib/sprint-init.js";
import { compile } from "../../packages/evidence/compiler/evidence-compiler.js";
import { addClaim } from "../../packages/evidence/lib/claims-ops.js";

type RejectionFixture = {
	id: string;
	reason_code: string;
	claim: { source: { origin: string } };
	seed_claims?: unknown[];
};
type LimitRow = {
	id: string;
	area: string;
	limit: string;
	status: string;
	mitigation: string;
};

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
		const resolved = compiled.resolved_claims.find(
			(c: { id: string }) => c.id === "r001",
		)!;
		const source = resolved.source;
		assert.ok(typeof source === "object" && source !== null);
		assert.equal(
			source.what_differs,
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
	) as Parameters<typeof evaluateAdversarialCase>[0][] & RejectionFixture[];
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
		assert.equal(res.rounds[0]!.verification!.exitCode, 3);
		assert.equal(res.rounds[0]!.verification!.soundnessBreak, true);
		assert.match(
			res.rounds[0]!.verification!.feedback,
			/LOOK: soundness break/,
		);

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
		assert.equal(honestRes.rounds[0]!.verification!.exitCode, 0);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

test("docs/limits.json matches the rendered Markdown table in docs/BLIND-SPOTS.md", () => {
	const limits = JSON.parse(
		fs.readFileSync(path.join(ROOT, "docs/limits.json"), "utf8"),
	) as LimitRow[];
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
		const [, id, area, limit, status, mitigation] = rows[i]!;
		assert.deepEqual({ id, area, limit, status, mitigation }, limits[i]);
	}
});

const verifierPath = path.join(ROOT, "evals/rejected-claims/verifier.mjs");
const rejectedCorpus = JSON.parse(
	fs.readFileSync(path.join(ROOT, "evals/rejected-claims/corpus.json"), "utf8"),
) as RejectionFixture[];
const rejectionAnswer = (corpus = rejectedCorpus): Record<string, unknown> =>
	Object.fromEntries(
		corpus.map((entry) => [
			entry.id,
			{ verdict: "REJECTED", reason_code: entry.reason_code },
		]),
	);
function checkVerifier(
	script: string,
	input: unknown,
	expectedExit: number,
	expectedOutput: RegExp,
) {
	const result = spawnSync(process.execPath, [script], {
		input: typeof input === "string" ? input : JSON.stringify(input),
		encoding: "utf8",
		timeout: 10_000,
	});
	assert.equal(result.error, undefined);
	assert.equal(result.status, expectedExit, result.stderr || result.stdout);
	assert.match(result.stdout + result.stderr, expectedOutput);
	if (expectedExit !== 0) assert.doesNotMatch(result.stdout, /YES:/);
}

test("verifier subprocess requires explicit, complete rejection reports", () => {
	checkVerifier(verifierPath, { answer: rejectionAnswer() }, 0, /YES: all 3/);
	checkVerifier(
		verifierPath,
		{ answer: JSON.stringify(rejectionAnswer()) },
		0,
		/YES: all 3/,
	);
	for (const answer of [null, [], 123, "not JSON", {}]) {
		checkVerifier(verifierPath, { answer }, 1, /Verifier error:/);
	}
	const first = rejectedCorpus[0]!;
	for (const report of [
		null,
		[],
		"REJECTED",
		{},
		{ reason_code: first.reason_code },
		{ verdict: null, reason_code: first.reason_code },
		{ verdict: "APPROVED", reason_code: first.reason_code },
		{ verdict: "REJECTED" },
		{ verdict: "REJECTED", reason_code: "wrong" },
	]) {
		const answer = rejectionAnswer();
		answer[first.id] = report;
		checkVerifier(verifierPath, { answer }, 1, /Verifier error:/);
	}
	for (const input of ["{", "null", "[]", ""]) {
		checkVerifier(verifierPath, input, 1, /Verifier error:/);
	}
	// Even an incomplete report must not hide an explicit false acceptance.
	checkVerifier(
		verifierPath,
		{ answer: { [rejectedCorpus[2]!.id]: { verdict: "ACCEPTED" } } },
		3,
		/LOOK: soundness break/,
	);
});

function copiedVerifier(t: TestContext) {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator verifier # ü-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	fs.mkdirSync(path.join(dir, "evals/rejected-claims"), { recursive: true });
	// Junctions work without Windows symlink privileges; native directory links elsewhere.
	for (const name of ["lib", "packages"]) {
		fs.symlinkSync(
			path.join(ROOT, name),
			path.join(dir, name),
			process.platform === "win32" ? "junction" : "dir",
		);
	}
	const script = path.join(dir, "evals/rejected-claims/verifier.mjs");
	const corpusPath = path.join(dir, "evals/rejected-claims/corpus.json");
	fs.copyFileSync(verifierPath, script);
	fs.writeFileSync(corpusPath, JSON.stringify(rejectedCorpus));
	return { dir, script, corpusPath };
}

test("verifier executes from paths containing spaces, hash and Unicode", (t) => {
	const { script } = copiedVerifier(t);
	checkVerifier(script, { answer: rejectionAnswer() }, 0, /YES: all 3/);
	checkVerifier(script, { answer: {} }, 1, /Verifier error:/);
	checkVerifier(
		script,
		{ answer: { [rejectedCorpus[0]!.id]: { verdict: "ACCEPTED" } } },
		3,
		/LOOK: soundness break/,
	);
});

test("verifier executes through a symlink alias", {
	skip:
		process.platform === "win32"
			? "File symlinks require elevated Windows privileges"
			: false,
}, (t) => {
	const { dir, script } = copiedVerifier(t);
	const alias = path.join(dir, "alias # ü.mjs");
	fs.symlinkSync(script, alias);
	checkVerifier(alias, { answer: rejectionAnswer() }, 0, /YES: all 3/);
	checkVerifier(alias, { answer: {} }, 1, /Verifier error:/);
});

test("verifier rejects local reason drift and fixture setup failures", (t) => {
	const { script, corpusPath } = copiedVerifier(t);
	const corpus = structuredClone(rejectedCorpus);
	// Still rejected structurally, but for a different reason than the fixture promises.
	corpus[0]!.claim.source.origin = "";
	fs.writeFileSync(corpusPath, JSON.stringify(corpus));
	checkVerifier(
		script,
		{ answer: rejectionAnswer(corpus) },
		1,
		/Local reason mismatch/,
	);
	corpus[0] = structuredClone(rejectedCorpus[0]!);
	corpus[0].seed_claims = [{ id: "invalid-seed" }];
	fs.writeFileSync(corpusPath, JSON.stringify(corpus));
	checkVerifier(script, { answer: rejectionAnswer(corpus) }, 1, /seed error/);
	assert.throws(
		() =>
			evaluateAdversarialCase(
				corpus[0] as Parameters<typeof evaluateAdversarialCase>[0],
			),
		/seed error/,
	);
});
