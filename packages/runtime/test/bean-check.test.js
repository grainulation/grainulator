#!/usr/bin/env node
// @ts-check
/**
 * Behavioral test for bean-check — the convergence compiler.
 *
 * Static gates run against the curated fixtures in test/fixtures/ with --no-state
 * (idempotent). Temporal gates (budget, dry-round) are generated into a fresh tmp
 * dir so state writes never touch the repo. Zero dependencies.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(root, "bin", "bean-check.js");

let passed = 0;
/** @param {string} name @param {() => void} fn */
const check = (name, fn) => {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
};

/**
 * @param {string} dir
 * @param {string[]} [extra]
 * @returns {{ exit: number, result: import("../bin/bean-check.js").Result }}
 */
const run = (dir, extra = []) => {
	const r = spawnSync(
		process.execPath,
		[BIN, "--dir", dir, "--json", ...extra],
		{
			encoding: "utf8",
		},
	);
	if (r.error) throw r.error;
	return { exit: r.status ?? -1, result: JSON.parse(r.stdout) };
};

/** @param {Record<string, unknown>} files @returns {string} */
const tmpFixture = (files) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bean-check-"));
	const bean = path.join(dir, ".bean");
	fs.mkdirSync(bean);
	for (const [name, body] of Object.entries(files))
		fs.writeFileSync(path.join(bean, name), JSON.stringify(body, null, 2));
	return dir;
};

// --- static gates (curated fixtures, --no-state) ---
/** @type {Array<{ f: string, status: string, exit: number, code?: string }>} */
const cases = [
	{ f: "converged", status: "ready", exit: 0 },
	{ f: "unresolved-conflict", status: "blocked", exit: 1, code: "E_CONFLICT" },
	{ f: "open-risk", status: "blocked", exit: 1, code: "E_OPEN_RISK" },
	{
		f: "weak-loadbearing",
		status: "blocked",
		exit: 1,
		code: "E_WEAK_LOADBEARING",
	},
	{ f: "open-unknown", status: "blocked", exit: 1, code: "E_OPEN_UNKNOWN" },
	// regression: one-directional conflicts_with from the higher-lexical-id side (was dropped)
	{ f: "asymmetric-conflict", status: "blocked", exit: 1, code: "E_CONFLICT" },
	// regression: a risk cannot discharge itself (self id) or via a dangling resolved_by
	{ f: "self-discharge", status: "blocked", exit: 1, code: "E_OPEN_RISK" },
	// 1.2.0: a claim depending on a superseded/inactive claim is stale (TMS propagation)
	{
		f: "stale-dependent",
		status: "blocked",
		exit: 1,
		code: "E_STALE_DEPENDENT",
	},
	// 1.2.0: a `residual` tag without a stated reason is a silent punt -> does not discharge
	{ f: "residual-no-reason", status: "blocked", exit: 1, code: "E_OPEN_RISK" },
	// 1.2.0: a `residual` WITH a reason genuinely discharges -> ready
	{ f: "residual-with-reason", status: "ready", exit: 0 },
];
for (const c of cases)
	check(`${c.f} -> ${c.status} (exit ${c.exit})`, () => {
		const { exit, result } = run(path.join(root, "test", "fixtures", c.f), [
			"--no-state",
		]);
		assert.equal(result.status, c.status);
		assert.equal(exit, c.exit);
		if (c.code)
			assert.ok(
				result.blockers.some((b) => b.code === c.code),
				`expected blocker ${c.code}`,
			);
	});

// --- determinism: same active claim set -> same certificate ---
check("certificate is deterministic for the same claim set", () => {
	const a = run(path.join(root, "test", "fixtures", "converged"), [
		"--no-state",
	]);
	const b = run(path.join(root, "test", "fixtures", "converged"), [
		"--no-state",
	]);
	assert.equal(a.result.certificate, b.result.certificate);
});

check("certificate distinguishes different ledgers", () => {
	const a = run(path.join(root, "test", "fixtures", "converged"), [
		"--no-state",
	]);
	const b = run(path.join(root, "test", "fixtures", "open-risk"), [
		"--no-state",
	]);
	assert.notEqual(a.result.certificate, b.result.certificate);
});

// --- conflict resolution: strict-dominance hint vs genuine tie (fail-closed both ways) ---
check("dominance conflict -> blocked WITH a belief-revision hint", () => {
	const { exit, result } = run(
		path.join(root, "test", "fixtures", "dominance-conflict"),
		["--no-state"],
	);
	assert.equal(result.status, "blocked");
	assert.equal(exit, 1);
	const conf = result.blockers.find((b) => b.code === "E_CONFLICT");
	assert.ok(conf && conf.resolvable === true, "expected a resolvable conflict");
	assert.equal(conf.supersede, "c1");
	assert.equal(conf.keep, "c2");
});
check("equal-tier conflict -> genuine tie (never auto-resolvable)", () => {
	const { result } = run(
		path.join(root, "test", "fixtures", "unresolved-conflict"),
		["--no-state"],
	);
	const conf = result.blockers.find((b) => b.code === "E_CONFLICT");
	assert.ok(
		conf && conf.resolvable === false,
		"equal-tier conflict must stay a genuine tie",
	);
});

// --- temporal: budget exceeded -> exit 2 ---
check("budget exceeded -> budget-exceeded (exit 2)", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "factual",
				topic: "t",
				content: "x",
				evidence: "tested",
				tags: ["load-bearing"],
			},
		],
		"run.json": { budget: { max_rounds: 1 } },
		"state.json": {
			round: 1,
			seen_ids: [],
			superseded_hashes: [],
			claims_hash: "seed",
		},
	});
	const { exit, result } = run(dir);
	assert.equal(result.status, "budget-exceeded");
	assert.equal(exit, 2);
});

// --- temporal: a second run with no new claims is a dry round ---
check("dry round detected on a converged ledger", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "factual",
				topic: "t",
				content: "x",
				evidence: "tested",
			},
		],
	});
	const first = run(dir);
	assert.equal(first.result.dry, false);
	const second = run(dir);
	assert.equal(second.result.dry, true);
	assert.equal(second.result.status, "ready");
	assert.ok(second.result.notes.includes("DRY_ROUND_CONVERGED"));
});

// --- temporal: dry round with an open blocker is flagged stuck ---
check("dry round with an open risk is flagged stuck", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "risk",
				topic: "t",
				content: "x",
				evidence: "documented",
			},
		],
	});
	run(dir);
	const second = run(dir);
	assert.equal(second.result.status, "blocked");
	assert.ok(second.result.notes.some((n) => n.startsWith("DRY_ROUND_STUCK")));
});

// --- 1.1.2 regressions (found by the Codex review) ---
check("partial run.json does not disable the other evidence bar", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "recommendation",
				topic: "x",
				content: "do X",
				evidence: "web",
			},
		],
		"run.json": { evidence_bar: { load_bearing: "production" } },
	});
	const { exit, result } = run(dir, ["--no-state"]);
	assert.equal(result.status, "blocked");
	assert.ok(result.blockers.some((b) => b.code === "E_WEAK_LOADBEARING"));
	assert.equal(exit, 1);
});

check("malformed claims yield E_SCHEMA, not a crash", () => {
	const dir = tmpFixture({
		"claims.json": [
			null,
			{ id: "c1", type: "nope", topic: "x", evidence: "tested" },
			{
				id: "c2",
				type: "factual",
				topic: "x",
				content: "ok",
				evidence: "tested",
				conflicts_with: 7,
			},
		],
	});
	const { exit, result } = run(dir, ["--no-state"]);
	assert.equal(result.status, "blocked");
	assert.ok(result.blockers.some((b) => b.code === "E_SCHEMA"));
	assert.equal(exit, 1);
});

check("in-place revision counts as progress (not a dry round)", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "factual",
				topic: "t",
				content: "v1",
				evidence: "tested",
			},
		],
	});
	run(dir);
	fs.writeFileSync(
		path.join(dir, ".bean", "claims.json"),
		JSON.stringify(
			[
				{
					id: "c1",
					type: "factual",
					topic: "t",
					content: "v2 revised",
					evidence: "tested",
				},
			],
			null,
			2,
		),
	);
	const second = run(dir);
	assert.equal(
		second.result.dry,
		false,
		"an in-place content change must not read as dry",
	);
	assert.equal(second.result.round, 2);
});

check("over budget with an open blocker -> budget-exceeded (exit 2)", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "risk",
				topic: "t",
				content: "x",
				evidence: "documented",
			},
		],
		"run.json": { budget: { max_rounds: 1 } },
		"state.json": {
			round: 1,
			seen_ids: [],
			superseded_hashes: [],
			claims_hash: "seed",
		},
	});
	const { exit, result } = run(dir);
	assert.equal(result.status, "budget-exceeded");
	assert.equal(exit, 2);
	assert.ok(
		result.blockers.some((b) => b.code === "E_OPEN_RISK"),
		"the blocker is still reported",
	);
});

check("--dir with a missing value exits 3 (not a stack trace)", () => {
	const r = spawnSync(process.execPath, [BIN, "--dir", "--json"], {
		encoding: "utf8",
	});
	assert.equal(r.status, 3);
});

// --- 1.2.0 regressions: depends_on edge cases (found by Codex review) ---
check("non-array depends_on does not fail open (E_SCHEMA)", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "factual",
				topic: "t",
				content: "x",
				evidence: "tested",
				status: "superseded",
			},
			{
				id: "c2",
				type: "recommendation",
				topic: "t",
				content: "do",
				evidence: "tested",
				depends_on: "c1",
			},
		],
	});
	const { exit, result } = run(dir, ["--no-state"]);
	assert.equal(result.status, "blocked");
	assert.ok(result.blockers.some((b) => b.code === "E_SCHEMA"));
	assert.equal(exit, 1);
});
check("self depends_on is stale (E_STALE_DEPENDENT)", () => {
	const dir = tmpFixture({
		"claims.json": [
			{
				id: "c1",
				type: "recommendation",
				topic: "t",
				content: "do",
				evidence: "tested",
				depends_on: ["c1"],
			},
		],
	});
	const { exit, result } = run(dir, ["--no-state"]);
	assert.equal(result.status, "blocked");
	assert.ok(result.blockers.some((b) => b.code === "E_STALE_DEPENDENT"));
	assert.equal(exit, 1);
});

console.log(`\n${passed} checks passed`);
