#!/usr/bin/env node
/**
 * Refresh after claim mutations and surface actionable Auto / Manual lists.
 * off disables the hook; quiet surfaces only compiler blockers.
 * Recommendations are host context, never permission grants. Always exits 0.
 */

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
	nextActions,
	formatNextActions,
	nextActionsInstruction,
} = require("../packages/evidence/lib/next-actions.cjs");

const TIPS_FILE = ".grainulator-tips.md";
const LOCKFILE = ".grainulator-compile.lock";
const COMPILE_TIMEOUT = 60_000;

/**
 * Emit JSON to stdout and exit cleanly.
 */
function emit(message) {
	const output = {
		hookSpecificOutput: {
			hookEventName: "PostToolUse",
			additionalContext: message,
		},
	};
	process.stdout.write(JSON.stringify(output));
	process.exit(0);
}

/**
 * Acquire a simple lockfile. Returns true if acquired, false if locked.
 */
function acquireLock(lockPath) {
	try {
		fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
		return true;
	} catch {
		// Age does not prove a lock is abandoned. Preserve it for explicit recovery.
		return false;
	}
}

function releaseLock(lockPath) {
	try {
		fs.unlinkSync(lockPath);
	} catch {
		// Already removed
	}
}

function emitRecovery(label) {
	emit(
		`${nextActionsInstruction}\n\n${formatNextActions({
			auto: [{ label, command: "grainulator compile --summary" }],
			manual: [],
		})}`,
	);
}

function main() {
	const level = (
		process.env.CLAUDE_PLUGIN_OPTION_TIPS_LEVEL || "on"
	).toLowerCase();

	if (level === "off") {
		process.exit(0);
	}

	let context = {};
	try {
		if (!process.stdin.isTTY)
			context = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
	} catch {
		/* Host may provide no context. */
	}
	const hostCwd = context.cwd || process.cwd();
	const cwd = path.resolve(hostCwd, context.tool_input?.dir || ".");
	const compilationPath = path.join(cwd, "compilation.json");
	const lockPath = path.join(cwd, LOCKFILE);
	const tipsPath = path.join(cwd, TIPS_FILE);

	// A recent compilation can still predate this mutation. Always refresh under
	// the lock instead of using its modification time as evidence of freshness.
	if (!acquireLock(lockPath)) {
		emitRecovery(
			"Refresh next steps after compilation finishes; inspect .grainulator-compile.lock if a prior writer crashed",
		);
		return;
	}
	try {
		execFileSync(
			process.execPath,
			[
				path.join(__dirname, "../bin/grainulator.js"),
				"compile",
				"--quiet",
				"--dir",
				cwd,
			],
			{
				encoding: "utf8",
				timeout: COMPILE_TIMEOUT,
				maxBuffer: 2 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
	} catch (err) {
		process.stderr.write(`grainulator: compile failed: ${err.message}\n`);
		releaseLock(lockPath);
		emitRecovery("Repair the compilation failure and refresh next steps");
		return;
	}
	releaseLock(lockPath);

	// Read compilation.json from disk
	let compilation;
	try {
		const raw = fs.readFileSync(compilationPath, "utf8");
		compilation = JSON.parse(raw);
	} catch (err) {
		process.stderr.write(
			`grainulator tips-hook: cannot read compilation.json: ${err.message}\n`,
		);
		emitRecovery("Regenerate the missing compilation");
		return;
	}

	if (
		level === "quiet" &&
		!compilation.errors?.length &&
		!compilation.conflict_graph?.unresolved?.length
	) {
		try {
			fs.unlinkSync(tipsPath);
		} catch {
			/* No previous reminder. */
		}
		return;
	}
	const lists = formatNextActions(nextActions(compilation));
	try {
		fs.writeFileSync(tipsPath, `${lists}\n`, "utf8");
	} catch (err) {
		process.stderr.write(
			`grainulator: cannot write ${TIPS_FILE}: ${err.message}\n`,
		);
	}
	emit(`${nextActionsInstruction}\n\n${lists}`);
}

try {
	main();
} catch (err) {
	// Never block -- log to stderr and exit clean on any unexpected error
	process.stderr.write(
		`grainulator tips-hook: unexpected error: ${err.message}\n`,
	);
	process.exit(0);
}
