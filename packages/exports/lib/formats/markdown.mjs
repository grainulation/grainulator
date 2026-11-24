// Generated from typescript/packages/exports/lib/formats/markdown.mts; edit that source and run npm run build:types.
import { escapeMarkdownData } from "./_shared.mjs";
/**
 * exports format: markdown
 *
 * Converts compilation.json (evidence compiler output) to clean Markdown.
 * Used by the exports server for live preview and export.
 * Zero dependencies — node built-in only.
 */
export const name = "markdown";
export const extension = ".md";
export const mimeType = "text/markdown; charset=utf-8";
export const description = "Clean Markdown document from compilation data";
/**
 * Convert a compilation object to Markdown.
 * @param {object} compilation - The compilation.json content
 * @returns {string} Markdown output
 */
export function convert(compilation) {
	const originalClaims = compilation.claims || [];
	compilation = escapeMarkdownData(compilation);
	const lines = [];
	const meta = compilation.meta || {};
	const claims = originalClaims;
	const conflicts = compilation.conflicts || [];
	const certificate = compilation.certificate || {};
	// Title
	const title = meta.sprint || meta.question || "Sprint Export";
	lines.push(`# ${title}`);
	lines.push("");
	// Meta block
	if (meta.question) {
		lines.push(`> **Question:** ${meta.question}`);
		lines.push("");
	}
	if (meta.audience) {
		lines.push(`**Audience:** ${meta.audience}`);
		lines.push("");
	}
	if (certificate.compiled_at) {
		lines.push(`*Compiled: ${certificate.compiled_at}*`);
		lines.push("");
	}
	// Summary stats
	const active = claims.filter((c) => c.status === "active").length;
	const superseded = claims.filter((c) => c.status === "superseded").length;
	const reverted = claims.filter((c) => c.status === "reverted").length;
	lines.push("## Summary");
	lines.push("");
	lines.push(`- **Total claims:** ${claims.length}`);
	lines.push(`- **Active:** ${active}`);
	if (superseded) lines.push(`- **Superseded:** ${superseded}`);
	if (reverted) lines.push(`- **Reverted:** ${reverted}`);
	if (conflicts.length) lines.push(`- **Conflicts:** ${conflicts.length}`);
	lines.push("");
	const counts = new Map();
	for (const claim of claims)
		if (typeof claim.id === "string")
			counts.set(claim.id, (counts.get(claim.id) || 0) + 1);
	const duplicates = [...counts]
		.filter(([, count]) => count > 1)
		.map(([id]) => id);
	if (duplicates.length) {
		lines.push(
			"## Export warnings",
			"",
			"Duplicate claim IDs make ID-only conflict references ambiguous:",
			"",
		);
		lines.push(
			...JSON.stringify(duplicates, null, 2)
				.split("\n")
				.map((line) => `    ${line}`),
			"",
		);
	}
	// Group claims by type
	const byType = Object.create(null);
	for (const claim of claims) {
		const type = claim.type || "unknown";
		if (!byType[type]) byType[type] = [];
		byType[type].push(claim);
	}
	const typeOrder = [
		"constraint",
		"factual",
		"recommendation",
		"risk",
		"estimate",
		"feedback",
	];
	const sortedTypes = typeOrder.filter((t) => byType[t]);
	for (const t of Object.keys(byType)) {
		if (!sortedTypes.includes(t)) sortedTypes.push(t);
	}
	for (const type of sortedTypes) {
		const group = byType[type] || [];
		if (!group || group.length === 0) continue;
		lines.push(`## ${capitalize(escapeMarkdownData(type))}s (${group.length})`);
		lines.push("");
		for (const originalClaim of group) {
			const claim = escapeMarkdownData(originalClaim);
			const conf =
				claim.confidence != null
					? ` [${Math.round(claim.confidence * 100)}%]`
					: "";
			const evidenceStr =
				typeof claim.evidence === "string"
					? claim.evidence
					: claim.evidence?.tier;
			const tier = evidenceStr ? ` (${evidenceStr})` : "";
			const status =
				claim.status && claim.status !== "active"
					? ` [status: ${claim.status}]`
					: "";
			const body =
				[claim.content, claim.text].find(
					(value) => typeof value === "string" && value.trim(),
				) || "";
			lines.push(`- **${claim.id}**${conf}${tier}${status}: ${body}`);
			// Preserve exact reference bytes in indented code; prose escaping would alter URLs.
			const references = [
				["source", originalClaim.source],
				[
					"evidence.source",
					typeof originalClaim.evidence === "object"
						? originalClaim.evidence?.source
						: undefined,
				],
				...["sources", "provenance", "verified_by", "verification"].map(
					(field) => [field, originalClaim[field]],
				),
			];
			for (const [field, value] of references) {
				if (value === undefined || value === null) continue;
				lines.push(`  - ${field}:`, "");
				lines.push(
					...JSON.stringify(value, null, 2)
						.split("\n")
						.map((line) => `        ${line}`),
					"",
				);
			}
		}
		lines.push("");
	}
	// Conflicts
	if (conflicts.length > 0) {
		lines.push("## Conflicts");
		lines.push("");
		for (const conflict of conflicts) {
			const resolved = conflict.resolution ? " (resolved)" : "";
			lines.push(
				`- **${conflict.ids?.join(" vs ") || "unknown"}**${resolved}: ${conflict.description || conflict.reason || "No description"}`,
			);
			if (conflict.resolution) {
				lines.push(`  - *Resolution:* ${conflict.resolution}`);
			}
		}
		lines.push("");
	}
	// Certificate
	if (certificate.sha256 || certificate.claim_count) {
		lines.push("---");
		lines.push("");
		lines.push(
			`*Certificate: ${certificate.claim_count || claims.length} claims, sha256:${(certificate.sha256 || "unknown").slice(0, 12)}*`,
		);
		lines.push("");
	}
	return lines.join("\n");
}
function capitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
