/**
 * mill format: markdown
 *
 * Converts compilation.json (wheat compiler output) to clean Markdown.
 * Used by the mill server for live preview and export.
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
  const lines = [];
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
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

  // Group claims by type
  const byType = {};
  for (const claim of claims) {
    if (claim.status === "reverted") continue;
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
    const group = byType[type];
    if (!group || group.length === 0) continue;

    lines.push(`## ${capitalize(type)}s (${group.length})`);
    lines.push("");

    for (const claim of group) {
      const conf =
        claim.confidence != null
          ? ` [${Math.round(claim.confidence * 100)}%]`
          : "";
      const evidenceStr =
        typeof claim.evidence === "string"
          ? claim.evidence
          : claim.evidence?.tier;
      const tier = evidenceStr ? ` (${evidenceStr})` : "";
      const status = claim.status === "superseded" ? " ~~superseded~~" : "";
      const body = claim.content || claim.text || "";
      lines.push(`- **${claim.id}**${conf}${tier}${status}: ${body}`);
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
