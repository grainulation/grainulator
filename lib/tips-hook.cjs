#!/usr/bin/env node
/**
 * tips-hook.cjs -- Background runtime hook that surfaces proactive sprint health tips.
 *
 * Invoked by PostToolUse hook after claim mutations. Runs wheat compile internally,
 * analyzes compilation for issues, writes detailed tips to .wheat-tips.md (file-based
 * replacement model), and emits a short JSON summary via additionalContext.
 *
 * Levels (CLAUDE_PLUGIN_OPTION_TIPS_LEVEL):
 *   "off"   -- exit immediately, no compile, no tips
 *   "quiet" -- only surface unresolved conflicts
 *   "on"    -- conflicts + weak evidence + type monoculture (default)
 *
 * Output: JSON to stdout with hookSpecificOutput.additionalContext (<200 chars).
 * Always exits 0 to never block the user.
 *
 * Zero dependencies -- uses only Node.js built-ins + npx wheat CLI.
 */

"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TIPS_FILE = ".wheat-tips.md";
const MAX_SUMMARY = 180;

function main() {
	const level = (
		process.env.CLAUDE_PLUGIN_OPTION_TIPS_LEVEL || "on"
	).toLowerCase();

	if (level === "off") {
		process.exit(0);
	}

	// Run wheat compile and capture JSON output
	let compileOutput;
	try {
		compileOutput = execSync(
			"npx -y @grainulation/wheat compile --json 2>/dev/null",
			{
				encoding: "utf8",
				timeout: 30_000,
				maxBuffer: 1024 * 1024,
			},
		);
	} catch {
		// Compile failed or timed out -- silently exit
		process.exit(0);
	}

	let compilation;
	try {
		compilation = JSON.parse(compileOutput);
	} catch {
		// Could not parse -- silently exit
		process.exit(0);
	}

	// Analyze compilation for issues
	const conflicts = compilation.conflicts || [];
	const _warnings = compilation.warnings || [];
	const topics = compilation.topics || {};

	// Detect weak evidence topics: topics where all claims are "stated" or "web" tier
	const weakTopics = [];
	const monocultureTopics = [];

	for (const [topicName, topicData] of Object.entries(topics)) {
		const claims = topicData.claims || [];
		if (claims.length === 0) continue;

		// Weak evidence: all claims at stated or web tier
		const allWeak = claims.every(
			(c) => c.evidence === "stated" || c.evidence === "web",
		);
		if (allWeak) {
			weakTopics.push(topicName);
		}

		// Type monoculture: all claims share the same type
		const types = new Set(claims.map((c) => c.type));
		if (types.size === 1 && claims.length >= 2) {
			monocultureTopics.push({
				topic: topicName,
				type: [...types][0],
				count: claims.length,
			});
		}
	}

	// Build tips based on level
	const issues = [];
	const mdSections = [];

	// Always include conflicts (both levels)
	if (conflicts.length > 0) {
		issues.push(
			`${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""}`,
		);
		mdSections.push("## Unresolved Conflicts\n");
		for (const conflict of conflicts) {
			const ids = conflict.claimIds?.join(", ") || conflict.id || "unknown";
			const desc = conflict.description || conflict.message || "No details";
			mdSections.push(`- **${ids}**: ${desc}`);
		}
		mdSections.push("");
	}

	if (level === "on") {
		// Weak evidence
		if (weakTopics.length > 0) {
			issues.push(
				`${weakTopics.length} topic${weakTopics.length > 1 ? "s" : ""} with weak evidence`,
			);
			mdSections.push("## Weak Evidence Topics\n");
			mdSections.push(
				"These topics have only `stated` or `web` tier evidence. Consider `/research` or `/prototype` to strengthen them.\n",
			);
			for (const t of weakTopics) {
				mdSections.push(`- ${t}`);
			}
			mdSections.push("");
		}

		// Type monoculture
		if (monocultureTopics.length > 0) {
			issues.push(
				`${monocultureTopics.length} topic${monocultureTopics.length > 1 ? "s" : ""} with type monoculture`,
			);
			mdSections.push("## Type Monoculture\n");
			mdSections.push(
				"These topics have all claims of the same type. Consider `/challenge` to add diversity.\n",
			);
			for (const t of monocultureTopics) {
				mdSections.push(
					`- **${t.topic}**: all ${t.count} claims are \`${t.type}\``,
				);
			}
			mdSections.push("");
		}
	}

	// Write .wheat-tips.md (replacement model -- always overwrite)
	const cwd = process.cwd();
	const tipsPath = path.join(cwd, TIPS_FILE);

	if (issues.length === 0) {
		// Clean state -- remove tips file if it exists
		try {
			fs.unlinkSync(tipsPath);
		} catch {
			// File didn't exist, that's fine
		}
		// Emit clean summary
		const output = {
			hookSpecificOutput: {
				hookEventName: "PostToolUse",
				additionalContext:
					"Sprint health: all clear. No conflicts or warnings.",
			},
		};
		process.stdout.write(JSON.stringify(output));
		process.exit(0);
	}

	// Build full markdown
	const mdContent = [
		"# Sprint Health Tips",
		"",
		`_Generated ${new Date().toISOString()} | Level: ${level}_`,
		"",
		...mdSections,
		"---",
		"",
		"Use `/resolve` to fix conflicts, `/research <topic>` to strengthen evidence, `/challenge <id>` to break monoculture.",
		"",
	].join("\n");

	try {
		fs.writeFileSync(tipsPath, mdContent, "utf8");
	} catch {
		// Can't write tips file -- still emit summary
	}

	// Build summary (<200 chars)
	let summary = `Sprint health: ${issues.join(", ")}. See ${TIPS_FILE}`;
	if (summary.length > MAX_SUMMARY) {
		summary = `${summary.slice(0, MAX_SUMMARY - 3)}...`;
	}

	const output = {
		hookSpecificOutput: {
			hookEventName: "PostToolUse",
			additionalContext: summary,
		},
	};
	process.stdout.write(JSON.stringify(output));
}

try {
	main();
} catch {
	// Never block -- exit clean on any unexpected error
	process.exit(0);
}
