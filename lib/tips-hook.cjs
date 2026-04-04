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

	// Parse using the ACTUAL schema:
	//   conflict_graph.unresolved -- array of conflict objects
	//   coverage -- object keyed by topic name, each with:
	//     { claims, max_evidence, status, types, claim_ids, missing_types, ... }
	//   warnings -- array of { code, message, claims }
	const unresolved = compilation.conflict_graph?.unresolved || [];
	const coverage = compilation.coverage || {};
	const warnings = compilation.warnings || [];

	// Categorize warnings by code
	const echoWarnings = warnings.filter((w) => w.code === "W_ECHO_CHAMBER");

	// Analyze coverage for weak topics (max_evidence is "stated" or "web")
	const weakTopics = [];
	const monocultureTopics = [];
	for (const [topicName, topicData] of Object.entries(coverage)) {
		if (
			topicData.status === "weak" ||
			topicData.max_evidence === "stated" ||
			topicData.max_evidence === "web"
		) {
			weakTopics.push({
				topic: topicName,
				claims: topicData.claims || 0,
				maxEvidence: topicData.max_evidence || "unknown",
			});
		}

		// Type monoculture: only 1 type across multiple claims
		if (
			topicData.types &&
			topicData.types.length === 1 &&
			(topicData.claims || 0) >= 2
		) {
			monocultureTopics.push({
				topic: topicName,
				type: topicData.types[0],
				count: topicData.claims || 0,
			});
		}
	}

	// Build tips based on level
	const issues = [];
	const mdSections = [];

	// Always include conflicts (both levels)
	if (unresolved.length > 0) {
		issues.push(
			`${unresolved.length} conflict${unresolved.length > 1 ? "s" : ""}`,
		);
		mdSections.push("## Unresolved Conflicts\n");
		for (const conflict of unresolved) {
			const ids =
				conflict.claim_ids?.join(", ") ||
				conflict.claimIds?.join(", ") ||
				conflict.id ||
				"unknown";
			const desc = conflict.description || conflict.message || "No details";
			mdSections.push(`- **${ids}**: ${desc}`);
		}
		mdSections.push("");
	}

	if (level === "on") {
		// Weak evidence (cap at 10 to keep tips readable)
		if (weakTopics.length > 0) {
			const shown = weakTopics.slice(0, 10);
			const extra =
				weakTopics.length > 10 ? ` (showing 10 of ${weakTopics.length})` : "";
			issues.push(
				`${weakTopics.length} topic${weakTopics.length > 1 ? "s" : ""} with weak evidence`,
			);
			mdSections.push(`## Weak Evidence Topics${extra}\n`);
			mdSections.push(
				"These topics have only `stated` or `web` tier evidence. Consider `/research` or `/prototype` to strengthen them.\n",
			);
			for (const t of shown) {
				mdSections.push(
					`- **${t.topic}** (${t.claims} claims, max: ${t.maxEvidence})`,
				);
			}
			mdSections.push("");
		}

		// Type monoculture (cap at 10)
		if (monocultureTopics.length > 0) {
			const shown = monocultureTopics.slice(0, 10);
			const extra =
				monocultureTopics.length > 10
					? ` (showing 10 of ${monocultureTopics.length})`
					: "";
			issues.push(
				`${monocultureTopics.length} topic${monocultureTopics.length > 1 ? "s" : ""} with type monoculture`,
			);
			mdSections.push(`## Type Monoculture${extra}\n`);
			mdSections.push(
				"These topics have all claims of the same type. Consider `/challenge` to add diversity.\n",
			);
			for (const t of shown) {
				mdSections.push(
					`- **${t.topic}**: all ${t.count} claims are \`${t.type}\``,
				);
			}
			mdSections.push("");
		}

		// Echo chamber warnings (cap at 5)
		if (echoWarnings.length > 0) {
			const shown = echoWarnings.slice(0, 5);
			const extra =
				echoWarnings.length > 5 ? ` (showing 5 of ${echoWarnings.length})` : "";
			issues.push(
				`${echoWarnings.length} echo chamber warning${echoWarnings.length > 1 ? "s" : ""}`,
			);
			mdSections.push(`## Echo Chamber Warnings${extra}\n`);
			mdSections.push(
				"These topics have claims from a single source. Consider `/witness` to corroborate.\n",
			);
			for (const w of shown) {
				mdSections.push(`- ${w.message}`);
			}
			mdSections.push("");
		}
	}

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
	const mdContent = [
		"# Sprint Health Tips",
		"",
		`_Generated ${new Date().toISOString()} | Level: ${level}_`,
		"",
		`**Status**: ${compilation.status || "unknown"} | **Compiler**: ${compilation.compiler_version || "unknown"} | **Claims hash**: ${compilation.claims_hash || "unknown"}`,
		"",
		...mdSections,
		"---",
		"",
		"Use `/resolve` to fix conflicts, `/research <topic>` to strengthen evidence, `/challenge <id>` to break monoculture, `/witness <id> <url>` to corroborate.",
		"",
	].join("\n");

	try {
		fs.writeFileSync(tipsPath, mdContent, "utf8");
	} catch (err) {
		process.stderr.write(
			`wheat tips-hook: cannot write ${TIPS_FILE}: ${err.message}\n`,
		);
	}

	// Build summary (<200 chars)
	let summary = `Sprint health: ${issues.join(", ")}. See ${TIPS_FILE}`;
	if (summary.length > MAX_SUMMARY) {
		summary = `${summary.slice(0, MAX_SUMMARY - 3)}...`;
	}

	emit(summary);
}

try {
	main();
} catch (err) {
	// Never block -- log to stderr and exit clean on any unexpected error
	process.stderr.write(`wheat tips-hook: unexpected error: ${err.message}\n`);
	process.exit(0);
}
