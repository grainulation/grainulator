/**
 * Unit tests: lib/hints.js
 *
 * hints.js reads/writes to `~/.grainulation/hints.json`. We isolate by
 * spawning each test in a child process with HOME pointed at a tempdir,
 * so the tests never touch the real user state.
 *
 * Covers:
 *   - maybeHint returns null when WHEAT_NO_HINTS=1 (global suppression)
 *   - maybeHint returns null when CI=1 (CI env suppression)
 *   - maybeHint returns null when stderr is not a TTY (our spawned children)
 *   - maybeHint triggers "harvest" hint when claims.length > 20 + TTY forced
 *   - maybeHint triggers "mill" hint when context is "brief"
 *   - markInstalled suppresses future hints for that product
 *   - dismiss suppresses future hints
 *   - reset wipes state
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HINTS_MODULE = path.resolve(__dirname, "..", "lib", "hints.js");
const HINTS_URL = "file://" + HINTS_MODULE;

/**
 * Run a snippet of code in a child process with an isolated HOME,
 * allowing us to safely exercise the module that writes to ~/.grainulation.
 *
 * @param {string} snippet - ESM code that uses `await import(HINTS_URL)`.
 * @param {{ env?: Record<string,string>, forceTTY?: boolean }} [opts]
 */
function runChild(snippet, opts = {}) {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-hints-home-"));
	const code = `
		const HINTS_URL = ${JSON.stringify(HINTS_URL)};
		const mod = await import(HINTS_URL);
		${opts.forceTTY ? "Object.defineProperty(process.stderr, 'isTTY', { value: true });" : ""}
		${snippet}
	`;
	try {
		const result = spawnSync(
			process.execPath,
			["--input-type=module", "-e", code],
			{
				encoding: "utf8",
				timeout: 10_000,
				env: {
					HOME: home,
					USERPROFILE: home,
					PATH: process.env.PATH || "",
					// Clear any CI flags so the test decides per-case.
					...(opts.env || {}),
				},
			},
		);
		return {
			code: result.status,
			stdout: result.stdout || "",
			stderr: result.stderr || "",
			home,
		};
	} finally {
		// Don't remove home yet — caller may want to read the hints file.
		// Caller is responsible for cleanup via the returned `home` path.
	}
}

function cleanup(home) {
	fs.rmSync(home, { recursive: true, force: true });
}

describe("hints: suppression (returns null)", () => {
	it("returns null when WHEAT_NO_HINTS=1", () => {
		const { stdout, home } = runChild(
			`
				const r = mod.maybeHint({ claims: new Array(50).fill({ topic: 't' }) }, { context: 'compile' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: { WHEAT_NO_HINTS: "1" }, forceTTY: true },
		);
		assert.deepEqual(JSON.parse(stdout), { result: null });
		cleanup(home);
	});

	it("returns null when CI=1", () => {
		const { stdout, home } = runChild(
			`
				const r = mod.maybeHint({ claims: new Array(50).fill({ topic: 't' }) }, { context: 'compile' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: { CI: "1" }, forceTTY: true },
		);
		assert.deepEqual(JSON.parse(stdout), { result: null });
		cleanup(home);
	});

	it("returns null when stderr is not a TTY", () => {
		// No forceTTY — spawned process's stderr is a pipe, not a TTY.
		const { stdout, home } = runChild(
			`
				const r = mod.maybeHint({ claims: new Array(50).fill({ topic: 't' }) }, { context: 'compile' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: {} },
		);
		assert.deepEqual(JSON.parse(stdout), { result: null });
		cleanup(home);
	});
});

describe("hints: triggers (happy path)", () => {
	it("emits harvest hint when claims.length > 20", () => {
		const compilation = { claims: new Array(25).fill({ topic: "t" }) };
		const { stdout, home } = runChild(
			`
				const r = mod.maybeHint(${JSON.stringify(compilation)}, { context: 'compile' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: {}, forceTTY: true },
		);
		const parsed = JSON.parse(stdout);
		assert.ok(parsed.result);
		assert.match(parsed.result, /harvest/);
		// The hints.json should have been written with a "shown" entry for harvest.
		const hintsFile = path.join(home, ".grainulation", "hints.json");
		assert.ok(fs.existsSync(hintsFile));
		const state = JSON.parse(fs.readFileSync(hintsFile, "utf8"));
		assert.ok(state.shown.harvest);
		assert.equal(state.shown.harvest.count, 1);
		cleanup(home);
	});

	it("emits mill hint when context is 'brief'", () => {
		// With no claims, earlier triggers don't fire — mill should win.
		const { stdout, home } = runChild(
			`
				const r = mod.maybeHint({}, { context: 'brief' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: {}, forceTTY: true },
		);
		const parsed = JSON.parse(stdout);
		assert.ok(parsed.result);
		assert.match(parsed.result, /mill/);
		cleanup(home);
	});

	it("emits orchard hint when topics > 3 (and claims <= 20)", () => {
		const claims = [
			{ topic: "a" },
			{ topic: "b" },
			{ topic: "c" },
			{ topic: "d" },
		];
		const { stdout, home } = runChild(
			`
				const r = mod.maybeHint(${JSON.stringify({ claims })}, { context: 'compile' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: {}, forceTTY: true },
		);
		const parsed = JSON.parse(stdout);
		assert.ok(parsed.result);
		assert.match(parsed.result, /orchard/);
		cleanup(home);
	});
});

describe("hints: state mutations (markInstalled / dismiss / reset)", () => {
	it("markInstalled suppresses future hints for that product", () => {
		const compilation = { claims: new Array(25).fill({ topic: "t" }) };
		const { stdout, home } = runChild(
			`
				mod.markInstalled('harvest');
				const r = mod.maybeHint(${JSON.stringify(compilation)}, { context: 'compile' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: {}, forceTTY: true },
		);
		const parsed = JSON.parse(stdout);
		// no other trigger fires.
		assert.equal(parsed.result, null);
		cleanup(home);
	});

	it("dismiss suppresses future hints for that product", () => {
		const compilation = { claims: new Array(25).fill({ topic: "t" }) };
		const { stdout, home } = runChild(
			`
				mod.dismiss('harvest');
				const r = mod.maybeHint(${JSON.stringify(compilation)}, { context: 'compile' });
				process.stdout.write(JSON.stringify({ result: r }));
			`,
			{ env: {}, forceTTY: true },
		);
		const parsed = JSON.parse(stdout);
		assert.equal(parsed.result, null);
		cleanup(home);
	});

	it("reset wipes hint state", () => {
		const { stdout, home } = runChild(
			`
				mod.markInstalled('harvest');
				mod.dismiss('orchard');
				mod.reset();
				const fs = await import('node:fs');
				const path = await import('node:path');
				const os = await import('node:os');
				const raw = fs.readFileSync(path.join(os.homedir(), '.grainulation', 'hints.json'), 'utf8');
				process.stdout.write(raw);
			`,
			{ env: {}, forceTTY: true },
		);
		const parsed = JSON.parse(stdout);
		assert.deepEqual(parsed, { shown: {}, dismissed: [], installed: [] });
		cleanup(home);
	});

	it("returns null (no crash) when compilation is undefined or null", () => {
		const { stdout, home } = runChild(
			`
				const r1 = mod.maybeHint(null, { context: 'compile' });
				const r2 = mod.maybeHint(undefined, { context: 'compile' });
				process.stdout.write(JSON.stringify({ r1, r2 }));
			`,
			{ env: {}, forceTTY: true },
		);
		const parsed = JSON.parse(stdout);
		// what we care about is that it doesn't throw.
		assert.ok(parsed.r1 === null || typeof parsed.r1 === "string");
		assert.ok(parsed.r2 === null || typeof parsed.r2 === "string");
		cleanup(home);
	});
});
