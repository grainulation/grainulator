/**
 * tips-analyze.cjs -- Pure analysis functions extracted from tips-hook.cjs.
 *
 * These functions analyze compilation.json data and produce sprint health
 * diagnostics. They are stateless (no I/O, no process globals) and designed
 * to be independently testable.
 *
 * Zero dependencies -- uses only plain JavaScript.
 */

"use strict";

/**
 * Analyze compilation data for weak-evidence topics.
 *
 * A topic is considered weak if its status is "weak" or its max_evidence
 * tier is "stated" or "web" (the two lowest tiers).
 *
 * @param {Record<string, object>} coverage - Coverage object from compilation.json
 * @returns {Array<{topic: string, claims: number, maxEvidence: string}>}
 */
function findWeakTopics(coverage) {
	const weakTopics = [];
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
	}
	return weakTopics;
}

/**
 * Analyze compilation data for type monoculture.
 *
 * A topic has type monoculture when it has 2+ claims but only 1 distinct
 * claim type (e.g., all "factual" with no "risk" or "recommendation").
 *
 * @param {Record<string, object>} coverage - Coverage object from compilation.json
 * @returns {Array<{topic: string, type: string, count: number}>}
 */
function findMonocultureTopics(coverage) {
	const monocultureTopics = [];
	for (const [topicName, topicData] of Object.entries(coverage)) {
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
	return monocultureTopics;
}

/**
 * Build markdown sections from analysis results.
 *
 * Produces an array of { issues, mdSections } where issues is a summary
 * array and mdSections is an array of markdown lines.
 *
 * @param {object} compilation - Parsed compilation.json
 * @param {string} level - Tips level: "quiet" or "on"
 * @returns {{ issues: string[], mdSections: string[] }}
 */
function buildTipsSections(compilation, level) {
	const unresolved = compilation.conflict_graph?.unresolved || [];
	const coverage = compilation.coverage || {};
	const warnings = compilation.warnings || [];

	const echoWarnings = warnings.filter((w) => w.code === "W_ECHO_CHAMBER");

	const weakTopics = findWeakTopics(coverage);
	const monocultureTopics = findMonocultureTopics(coverage);

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
		// Weak evidence (cap at 10)
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

	return { issues, mdSections };
}

/**
 * Build the full .wheat-tips.md content.
 *
 * @param {object} compilation - Parsed compilation.json
 * @param {string} level - Tips level
 * @param {string[]} issues - Issue summary strings
 * @param {string[]} mdSections - Markdown section lines
 * @returns {string} Full markdown content
 */
function buildTipsMarkdown(compilation, level, issues, mdSections) {
	return [
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
}

/**
 * Build the summary string for stdout emission (capped at maxLength).
 *
 * @param {string[]} issues - Issue summary strings
 * @param {string} tipsFile - Name of the tips file
 * @param {number} maxLength - Maximum summary length
 * @returns {string}
 */
function buildSummary(issues, tipsFile, maxLength) {
	let summary = `Sprint health: ${issues.join(", ")}. See ${tipsFile}`;
	if (summary.length > maxLength) {
		summary = `${summary.slice(0, maxLength - 3)}...`;
	}
	return summary;
}

module.exports = {
	findWeakTopics,
	findMonocultureTopics,
	buildTipsSections,
	buildTipsMarkdown,
	buildSummary,
};
