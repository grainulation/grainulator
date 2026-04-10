#!/usr/bin/env node
/**
 * tips-hook.cjs -- Background runtime hook that surfaces proactive sprint health tips.
 *
 * Invoked by PostToolUse hook after claim mutations. Reads compilation.json from
 * DISK (no npx stdout parsing), analyzes it for issues, writes detailed tips to
 * .wheat-tips.md, and emits a short JSON summary via additionalContext to stdout.
 *
 * Levels (CLAUDE_PLUGIN_OPTION_TIPS_LEVEL):
 *   "off"   -- exit immediately, no compile, no tips
 *   "quiet" -- only surface unresolved conflicts
 *   "on"    -- conflicts + weak evidence + type monoculture (default)
 *
 * Debounce: skips if compilation.json was modified <5s ago (another hook already ran).
 * Lockfile: skips if .wheat-compile.lock exists (another instance is compiling).
 *
 * Output: JSON to stdout with hookSpecificOutput.additionalContext (<200 chars).
 * Errors logged to stderr. Always exits 0 to never block the user.
 *
 * Zero dependencies -- uses only Node.js built-ins + npx wheat CLI (fire-and-forget).
 */

"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
	buildTipsSections,
	buildTipsMarkdown,
	buildSummary,
} = require("./tips-analyze.cjs");

const TIPS_FILE = ".wheat-tips.md";
const LOCKFILE = ".wheat-compile.lock";
const DEBOUNCE_MS = 5_000;
const MAX_SUMMARY = 180;
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
 * Check if compilation.json was modified within the debounce window.
 * Returns true if we should skip (too recent).
 */
function shouldDebounce(compilationPath) {
	try {
		const stat = fs.statSync(compilationPath);
		const age = Date.now() - stat.mtimeMs;
		return age < DEBOUNCE_MS;
	} catch {
		return false;
	}
}

/**
 * Acquire a simple lockfile. Returns true if acquired, false if locked.
 */
function acquireLock(lockPath) {
	try {
		fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
		return true;
	} catch {
		// Lock exists -- check if it's stale (>2 minutes old)
		try {
			const stat = fs.statSync(lockPath);
			if (Date.now() - stat.mtimeMs > 120_000) {
				fs.unlinkSync(lockPath);
				fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
				return true;
			}
		} catch {
			// Can't check or clean stale lock
		}
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

function main() {
	const level = (
		process.env.CLAUDE_PLUGIN_OPTION_TIPS_LEVEL || "on"
	).toLowerCase();

	if (level === "off") {
		process.exit(0);
	}

	const cwd = process.cwd();
	const compilationPath = path.join(cwd, "compilation.json");
	const lockPath = path.join(cwd, LOCKFILE);
	const tipsPath = path.join(cwd, TIPS_FILE);

	// Debounce: skip if compilation.json was modified very recently
	if (shouldDebounce(compilationPath)) {
		// Still read the existing compilation and generate tips
		// but skip the compile step
	} else {
		// Acquire lock to prevent concurrent compiles
		if (!acquireLock(lockPath)) {
			process.stderr.write(
				"wheat tips-hook: skipping, another compile in progress\n",
			);
			emit("Sprint tips: compile in progress, skipped.");
			return;
		}

		// Run wheat compile (sync, stderr visible, stdout discarded)
		try {
			execSync("npx -y @grainulation/wheat compile 2>&1 >&2", {
				encoding: "utf8",
				timeout: COMPILE_TIMEOUT,
				maxBuffer: 2 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (err) {
			process.stderr.write(`wheat tips-hook: compile failed: ${err.message}\n`);
			releaseLock(lockPath);
			emit("Sprint tips: compile failed, see stderr.");
			return;
		}

		releaseLock(lockPath);
	}

	// Read compilation.json from disk
	let compilation;
	try {
		const raw = fs.readFileSync(compilationPath, "utf8");
		compilation = JSON.parse(raw);
	} catch (err) {
		process.stderr.write(
			`wheat tips-hook: cannot read compilation.json: ${err.message}\n`,
		);
		emit("Sprint tips: no compilation.json found.");
		return;
	}

	// Analyze compilation data using extracted pure functions
	const { issues, mdSections } = buildTipsSections(compilation, level);

	// Write .wheat-tips.md (replacement model -- always overwrite)
	if (issues.length === 0) {
		// Clean state -- remove tips file if it exists
		try {
			fs.unlinkSync(tipsPath);
		} catch {
			// File didn't exist, that's fine
		}
		emit("Sprint health: all clear. No conflicts or warnings.");
		return;
	}

	// Build full markdown
	const mdContent = buildTipsMarkdown(compilation, level, issues, mdSections);

	try {
		fs.writeFileSync(tipsPath, mdContent, "utf8");
	} catch (err) {
		process.stderr.write(
			`wheat tips-hook: cannot write ${TIPS_FILE}: ${err.message}\n`,
		);
	}

	// Build summary (<200 chars)
	const summary = buildSummary(issues, TIPS_FILE, MAX_SUMMARY);

	emit(summary);
}

try {
	main();
} catch (err) {
	// Never block -- log to stderr and exit clean on any unexpected error
	process.stderr.write(`wheat tips-hook: unexpected error: ${err.message}\n`);
	process.exit(0);
}
