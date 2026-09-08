import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { execute, runTask } from "../../lib/runner.js";

const fixture = (name) => [
	process.execPath,
	fileURLToPath(new URL(`../../evals/fixtures/${name}.mjs`, import.meta.url)),
];
const fixed = (answer) => [
	process.execPath,
	"-e",
	`process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({answer:${JSON.stringify(answer)}})))`,
];
function options(t) {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-run-"));
	t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
	return {
		cwd,
		task: "Calculate 6 × 7",
		adapter: fixture("repair-adapter"),
		verifier: fixture("answer-verifier"),
		timeoutMs: 2000,
	};
}
test("feedback corrects an answer; independent verification establishes success", async (t) => {
	const result = await runTask(options(t));
	assert.equal(result.status, "verified");
	assert.equal(result.rounds.length, 2);
	assert.equal(result.rounds[0].verification.passed, false);
	assert.equal(result.rounds[1].answer, "42");
	assert.ok(fs.existsSync(result.trace));
});
test("model assertion alone remains unverified", async (t) => {
	const result = await runTask({
		...options(t),
		verifier: undefined,
		adapter: fixed("42"),
	});
	assert.equal(result.status, "unverified");
});
test("repeated failure stops instead of looping forever", async (t) => {
	const result = await runTask({ ...options(t), adapter: fixed("41") });
	assert.equal(result.status, "stalled");
	assert.equal(result.rounds.length, 2);
});
test("round budget cannot become success", async (t) => {
	const result = await runTask({ ...options(t), maxRounds: 1 });
	assert.equal(result.status, "budget_exhausted");
});
test("malformed adapter response becomes an explicit error", async (t) => {
	const result = await runTask({
		...options(t),
		adapter: [process.execPath, "-e", 'console.log("not json")'],
	});
	assert.equal(result.status, "error");
	assert.match(result.error, /JSON/);
});
test("a hung adapter is terminated by the timeout", async (t) => {
	const result = await runTask({
		...options(t),
		timeoutMs: 100,
		adapter: [process.execPath, "-e", "setInterval(()=>{},1000)"],
	});
	assert.equal(result.status, "error");
	assert.match(result.error, /timed out/);
});

test("known environment credentials stay out of results, callbacks, and traces without changing verification inputs", async (t) => {
	const keyName = "GRAINULATOR_TEST_API_KEY";
	const secret = `fixture-credential-${Date.now()}`;
	const previous = process.env[keyName];
	process.env[keyName] = secret;
	t.after(() => {
		if (previous === undefined) delete process.env[keyName];
		else process.env[keyName] = previous;
	});
	const callbacks = [];
	const adapter = [
		process.execPath,
		"-e",
		`let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{const r=JSON.parse(input);if(!r.task.includes(process.env.${keyName})||(r.round===2&&!r.feedback.includes(process.env.${keyName})))process.exit(3);console.log(JSON.stringify({answer:process.env.${keyName}}));})`,
	];
	const verifier = [
		process.execPath,
		"-e",
		`let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{const r=JSON.parse(input);if(r.answer!==process.env.${keyName})process.exit(3);console.log('verification '+process.env.${keyName});process.exit(r.round===1?1:0);})`,
	];
	const result = await runTask({
		...options(t),
		task: `Verify ${secret}`,
		adapter,
		verifier,
		onRound: (record) => callbacks.push(record),
	});
	assert.equal(result.status, "verified");
	assert.equal(
		result.rounds.length,
		2,
		"raw verifier feedback reaches the next adapter pass",
	);
	assert.equal(callbacks.length, 2);
	for (const output of [
		JSON.stringify(result),
		JSON.stringify(callbacks),
		fs.readFileSync(result.trace, "utf8"),
	]) {
		assert.ok(!output.includes(secret));
		assert.match(output, /\[REDACTED\]/);
	}
	const failed = await runTask({
		...options(t),
		adapter: [
			process.execPath,
			"-e",
			`process.stderr.write(process.env.${keyName});process.exit(1)`,
		],
	});
	assert.equal(failed.status, "error");
	assert.match(failed.error, /\[REDACTED\]/);
	assert.ok(!JSON.stringify(failed).includes(secret));
	assert.ok(!fs.readFileSync(failed.trace, "utf8").includes(secret));
});

test("cancellation kills a descendant even when its parent exits first", {
	skip: process.platform === "win32",
}, async (t) => {
	const { cwd } = options(t),
		ready = path.join(cwd, "ready");
	const grandchild = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000)`;
	const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
	const controller = new AbortController();
	const running = execute([process.execPath, "-e", parent], "", {
		cwd,
		signal: controller.signal,
		timeoutMs: 5000,
	});
	t.after(() => controller.abort());
	for (let i = 0; i < 100 && !fs.existsSync(ready); i++)
		await new Promise((r) => setTimeout(r, 20));
	assert.ok(fs.existsSync(ready), "descendant started");
	const pid = Number(fs.readFileSync(ready, "utf8"));
	const alive = () => {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	};
	t.after(() => {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	});
	controller.abort();
	assert.equal((await running).failure, "Run cancelled");
	for (let i = 0; i < 50 && alive(); i++)
		await new Promise((r) => setTimeout(r, 20));
	assert.equal(alive(), false, "no orphan process remains");
});
