import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createHandler, TOOLS } from "../../lib/grainulator-mcp.js";
import {
	buildReportPacket,
	checkReportPacket,
	writeReportPacket,
} from "../../lib/report-packet.js";
import { initializeSprint } from "../../lib/sprint-init.js";
import { compile } from "../../packages/evidence/compiler/wheat-compiler.js";
import { addClaim } from "../../packages/evidence/lib/claims-ops.js";
import { compilationFreshness } from "../../packages/evidence/lib/freshness.js";
import {
	acceptanceGaps,
	correctClaim,
	duplicateCandidates,
	findingAction,
	inspectEvidence,
	linkPremises,
	listFindings,
	observeExecution,
	observeSource,
	setAcceptance,
} from "../../packages/evidence/lib/maintenance.js";

function fixture(t, done = "Known observable result") {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-maintenance-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	assert.equal(
		initializeSprint(dir, { question: "Which database?", done }).status,
		"ok",
	);
	for (const id of ["a", "b", "c"])
		assert.equal(
			addClaim(dir, {
				id,
				type: "factual",
				topic: "database",
				content: `Finding ${id}`,
				evidence: "documented",
			}).status,
			"ok",
		);
	fs.writeFileSync(
		path.join(dir, "source.js"),
		'export const database = "postgres";\nexport const port = 5432;\n',
	);
	return dir;
}
const ledger = (dir) =>
	JSON.parse(fs.readFileSync(path.join(dir, "claims.json")));
const compileDir = (dir) =>
	compile(
		path.join(dir, "claims.json"),
		path.join(dir, "compilation.json"),
		dir,
		{ skipSprintDetection: true },
	);

test("necessary premises survive correction as explicit re-verification paths; replacement never silently repairs conclusions", (t) => {
	const dir = fixture(t);
	linkPremises(dir, {
		claim_id: "b",
		premises: ["a"],
		reason: "necessary database fact",
	});
	linkPremises(dir, { claim_id: "c", premises: ["b"], reason: "derived plan" });
	assert.equal(compileDir(dir).status, "ready");
	const result = correctClaim(dir, {
		claim_id: "a",
		id: "a2",
		content: "Use SQLite",
		reason: "new decision",
	});
	assert.deepEqual(
		result.needs_reverification.map((x) => x.claim_id),
		["b", "c"],
	);
	assert.deepEqual(result.needs_reverification[1].blockers[0].path, [
		"a",
		"b",
		"c",
	]);
	assert.equal(
		ledger(dir).claims.find((c) => c.id === "a").status,
		"superseded",
	);
	assert.equal(
		ledger(dir).claims.find((c) => c.id === "a2").evidence,
		"stated",
	);
	const blocked = compileDir(dir);
	assert.equal(blocked.status, "blocked");
	assert.ok(blocked.errors.some((e) => e.code === "E_REVERIFICATION_REQUIRED"));
	linkPremises(dir, {
		claim_id: "b",
		premises: ["a2"],
		reason: "reviewed revised decision",
	});
	assert.deepEqual(
		inspectEvidence(dir).needs_reverification.map((x) => x.claim_id),
		["c"],
	);
	linkPremises(dir, {
		claim_id: "c",
		premises: ["b"],
		reason: "rechecked the new plan",
	});
	assert.equal(compileDir(dir).status, "ready");
});

test("invalid graph/correction operations are atomic and leave ledger bytes intact", (t) => {
	const dir = fixture(t);
	linkPremises(dir, { claim_id: "b", premises: ["a"], reason: "necessary" });
	const before = fs.readFileSync(path.join(dir, "claims.json"));
	for (const premises of [["b"], ["missing"], ["a", "a"]])
		assert.throws(() =>
			linkPremises(dir, { claim_id: "a", premises, reason: "invalid" }),
		);
	assert.throws(() =>
		correctClaim(dir, {
			claim_id: "a",
			id: "b",
			content: "duplicate",
			reason: "invalid",
		}),
	);
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), before);
});

test("compiler conflict resolution invalidates dependent premises in the same compilation", (t) => {
	const dir = fixture(t);
	linkPremises(dir, {
		claim_id: "b",
		premises: ["a"],
		reason: "necessary fact",
	});
	linkPremises(dir, {
		claim_id: "c",
		premises: ["b"],
		reason: "derived result",
	});
	assert.equal(
		addClaim(dir, {
			id: "better-a",
			type: "factual",
			topic: "database",
			content: "Contradicts a",
			evidence: "tested",
			conflicts_with: ["a"],
		}).status,
		"ok",
	);
	const before = fs.readFileSync(path.join(dir, "claims.json"));
	const compiled = compileDir(dir);
	assert.equal(compiled.status, "blocked");
	assert.deepEqual(
		compiled.evidence_health.needs_reverification.map((item) => item.claim_id),
		["b", "c"],
	);
	assert.ok(
		compiled.errors.some(
			(item) =>
				item.code === "E_REVERIFICATION_REQUIRED" && item.claims.includes("c"),
		),
	);
	assert.deepEqual(
		compiled.evidence_health.needs_reverification[1].blockers[0].path,
		["a", "b", "c"],
	);
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), before);
	assert.equal(
		compilationFreshness(path.join(dir, "claims.json"), compiled).fresh,
		true,
	);
});

test("source edits invalidate compile freshness and report packets; explicit same-binding replacement preserves history", (t) => {
	const dir = fixture(t);
	const obs = observeSource(dir, {
		claim_id: "a",
		path: "source.js",
		start_line: 1,
		end_line: 1,
	}).observation;
	const comp = compileDir(dir);
	const packet = writeReportPacket(dir, "output/frozen.json");
	assert.ok(packet);
	fs.writeFileSync(
		path.join(dir, "source.js"),
		'export const database = "sqlite";\nexport const port = 0;\n',
	);
	assert.equal(
		compilationFreshness(path.join(dir, "claims.json"), comp).fresh,
		false,
	);
	assert.equal(checkReportPacket(dir, "output/frozen.json").passed, false);
	assert.equal(compileDir(dir).status, "blocked");
	observeSource(dir, {
		claim_id: "a",
		path: "source.js",
		start_line: 1,
		end_line: 1,
		supersedes: obs.id,
	});
	assert.equal(inspectEvidence(dir).needs_reverification.length, 0);
	assert.equal(
		ledger(dir).claims.find((c) => c.id === "a").observations.length,
		2,
	);
	assert.equal(buildReportPacket(dir).evidence_health.coverage.resolved, 1);
});

test("execution receipts bind actual literal argv, code files and output without promoting tiers", async (t) => {
	const dir = fixture(t);
	fs.writeFileSync(
		path.join(dir, "verify.mjs"),
		'console.log("held-out result");\n',
	);
	const result = await observeExecution(dir, {
		claim_id: "a",
		argv: [process.execPath, "verify.mjs"],
		files: ["verify.mjs"],
	});
	assert.equal(result.check.status, "passed");
	assert.equal(result.observation.exit_code, 0);
	assert.match(result.observation.output_sha256, /^[a-f0-9]{64}$/);
	assert.equal(
		ledger(dir).claims.find((c) => c.id === "a").evidence,
		"documented",
	);
	fs.writeFileSync(path.join(dir, "verify.mjs"), "process.exit(9);\n");
	assert.equal(
		inspectEvidence(dir).observations.find((c) => c.claim_id === "a").checks[0]
			.status,
		"changed",
	);
	const failed = await observeExecution(dir, {
		claim_id: "a",
		argv: [process.execPath, "verify.mjs"],
		files: ["verify.mjs"],
		supersedes: result.observation.id,
	});
	assert.equal(failed.check.status, "failed");
	assert.equal(failed.observation.exit_code, 9);
	assert.equal(compileDir(dir).status, "blocked");
});

test("input mutation during a successful command cannot earn passing current support", async (t) => {
	const dir = fixture(t);
	fs.writeFileSync(
		path.join(dir, "mutator.mjs"),
		'import fs from "node:fs"; fs.appendFileSync("source.js", "// changed\\n");\n',
	);
	const result = await observeExecution(dir, {
		claim_id: "a",
		argv: [process.execPath, "mutator.mjs"],
		files: ["source.js", "mutator.mjs"],
	});
	assert.equal(result.observation.exit_code, 0);
	assert.equal(result.observation.input_changed, true);
	assert.notEqual(result.check.status, "passed");
});

test("invalid execution replacements are rejected before launching the command", async (t) => {
	const dir = fixture(t);
	const argv = [
		process.execPath,
		"-e",
		'require("node:fs").writeFileSync("launched", "yes")',
	];
	const source = observeSource(dir, {
		claim_id: "a",
		path: "source.js",
	}).observation;
	const original = await observeExecution(dir, {
		claim_id: "a",
		argv: [process.execPath, "-e", "process.exit(0)"],
		files: ["source.js"],
	});
	for (const supersedes of ["unknown", source.id, original.observation.id]) {
		await assert.rejects(
			observeExecution(dir, {
				claim_id: "a",
				argv,
				files: ["source.js"],
				supersedes,
			}),
		);
		assert.equal(fs.existsSync(path.join(dir, "launched")), false);
	}
});

test("exhausted maintenance history rejects execution before launching the command", async (t) => {
	const dir = fixture(t);
	for (let i = 0; i < 1000; i++)
		linkPremises(dir, {
			claim_id: "a",
			premises: [],
			reason: "reviewed current premises",
		});
	const before = fs.readFileSync(path.join(dir, "claims.json"));
	await assert.rejects(
		observeExecution(dir, {
			claim_id: "a",
			argv: [
				process.execPath,
				"-e",
				'require("node:fs").writeFileSync("launched", "yes")',
			],
			files: ["source.js"],
		}),
		/maintenance history limit/,
	);
	assert.equal(fs.existsSync(path.join(dir, "launched")), false);
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), before);
});

test("source confinement rejects traversal, symlinks, binary files and invalid ranges", (t) => {
	const dir = fixture(t);
	fs.symlinkSync("source.js", path.join(dir, "link.js"));
	fs.writeFileSync(path.join(dir, "binary"), Buffer.from([0, 1, 2]));
	for (const file of ["../escape", "link.js", "binary", "/etc/passwd"])
		assert.throws(() => observeSource(dir, { claim_id: "a", path: file }));
	assert.throws(() =>
		observeSource(dir, {
			claim_id: "a",
			path: "source.js",
			start_line: 1,
			end_line: 999,
		}),
	);
});

test("all active claims remain in coverage denominator; static bytes cannot establish tested support", (t) => {
	const dir = fixture(t);
	assert.equal(
		addClaim(dir, {
			id: "tested",
			type: "factual",
			topic: "runs",
			content: "It executed",
			evidence: "tested",
		}).status,
		"ok",
	);
	observeSource(dir, { claim_id: "tested", path: "source.js" });
	const health = inspectEvidence(dir);
	assert.equal(health.coverage.total, 5);
	assert.equal(health.coverage.source_intact, 1);
	assert.equal(health.coverage.executed_pass, 0);
	assert.equal(health.coverage.resolved, 0);
	assert.equal(health.coverage.unresolved, 5);
	assert.equal(health.coverage.effective_coverage, 0);
});

test("finding verdict and resolution stay independent; stale revisions and stale proof are rejected", (t) => {
	const dir = fixture(t);
	const observation = observeSource(dir, {
		claim_id: "a",
		path: "source.js",
	}).observation;
	let result = findingAction(dir, {
		claim_id: "a",
		action: "verify",
		verdict: "confirmed",
		observation_id: observation.id,
		expected_revision: 0,
		reason: "reviewed source",
	});
	assert.equal(result.audit.resolution, "open");
	assert.throws(
		() =>
			findingAction(dir, {
				claim_id: "a",
				action: "resolve",
				resolution: "fixed",
				observation_id: observation.id,
				expected_revision: 0,
				reason: "stale writer",
			}),
		/revision/,
	);
	result = findingAction(dir, {
		claim_id: "a",
		action: "resolve",
		resolution: "fixed",
		observation_id: observation.id,
		expected_revision: 1,
		reason: "reviewed fix",
	});
	assert.equal(result.audit.verdict, "confirmed");
	assert.equal(result.audit.resolution, "fixed");
	assert.equal(ledger(dir).claims.find((c) => c.id === "a").status, "active");
	fs.appendFileSync(path.join(dir, "source.js"), "// changed\n");
	assert.throws(
		() =>
			findingAction(dir, {
				claim_id: "a",
				action: "verify",
				verdict: "confirmed",
				observation_id: observation.id,
				expected_revision: 2,
				reason: "stale proof",
			}),
		/current/,
	);
	assert.equal(
		listFindings(dir).findings.find((c) => c.claim_id === "a").audit.revision,
		2,
	);
});

test("overlapping current anchors only suggest duplicates and explicit reconciliation rejects cycles", (t) => {
	const dir = fixture(t);
	observeSource(dir, {
		claim_id: "a",
		path: "source.js",
		start_line: 1,
		end_line: 2,
	});
	observeSource(dir, {
		claim_id: "b",
		path: "source.js",
		start_line: 2,
		end_line: 2,
	});
	assert.deepEqual(duplicateCandidates(dir).candidates[0].claim_ids, [
		"a",
		"b",
	]);
	assert.equal(ledger(dir).claims.find((c) => c.id === "a").audit, undefined);
	findingAction(dir, {
		claim_id: "a",
		action: "duplicate",
		duplicate_of: "b",
		expected_revision: 0,
		reason: "same defect reviewed",
	});
	assert.equal(duplicateCandidates(dir).candidates.length, 0);
	assert.throws(
		() =>
			findingAction(dir, {
				claim_id: "b",
				action: "duplicate",
				duplicate_of: "a",
				expected_revision: 0,
				reason: "cycle",
			}),
		/cycles/,
	);
});

test("acceptance clarification reports missing explicit criteria and preserves superseded decisions", (t) => {
	const dir = fixture(t, "");
	assert.equal(acceptanceGaps(dir).questions.length, 1);
	setAcceptance(dir, {
		done: "Tests pass on the intended artifact",
		reason: "user provided criteria",
	});
	assert.equal(acceptanceGaps(dir).clarification_needed, false);
	setAcceptance(dir, {
		done: "Packaged artifact passes too",
		reason: "user refined criteria",
	});
	const criteria = ledger(dir).claims.filter(
		(c) => c.topic === "done-criteria",
	);
	assert.deepEqual(
		criteria.map((c) => c.status),
		["superseded", "active"],
	);
});

test("maintenance CLI and direct MCP expose the same source checks without external execution tools", async (t) => {
	const dir = fixture(t);
	const cli = spawnSync(
		process.execPath,
		[
			"bin/grainulator.js",
			"maintain",
			"source",
			"--dir",
			dir,
			"--id",
			"a",
			"--file",
			"source.js",
			"--json",
		],
		{ encoding: "utf8", cwd: new URL("../../", import.meta.url) },
	);
	assert.equal(cli.status, 0, cli.stderr);
	const handler = createHandler({ dir });
	const response = JSON.parse(
		await handler("tools/call", { name: "evidence_health", arguments: {} }, 1),
	);
	assert.equal(response.result.isError, false);
	assert.equal(
		JSON.parse(response.result.content[0].text).coverage.source_intact,
		1,
	);
	assert.ok(TOOLS.some((tool) => tool.name === "premise_links"));
	assert.ok(!TOOLS.some((tool) => tool.name === "observe_execution"));
	const refused = JSON.parse(
		await handler(
			"tools/call",
			{
				name: "observe_source",
				arguments: { claim_id: "a", path: "../escape" },
			},
			2,
		),
	);
	assert.equal(refused.result.isError, true);
});
