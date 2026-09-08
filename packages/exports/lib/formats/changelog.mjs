/**
 * mill format: changelog
 *
 * Converts compilation.json claims to a diff/changelog grouped by status.
 * Shows active, resolved, and conflict sections with counts.
 * Zero dependencies — node built-in only.
 */

export const name = "changelog";
export const extension = ".md";
export const mimeType = "text/markdown; charset=utf-8";
export const description =
  "Claims changelog grouped by status (active, resolved, conflicts)";

/**
 * Convert a compilation object to changelog markdown.
 * @param {object} compilation - The compilation.json content
 * @returns {string} Markdown changelog output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];
  const conflicts = compilation.conflicts || [];
  const meta = compilation.meta || {};
  const sprintName = meta.sprint || "unnamed";

  const groups = {};
  for (const claim of claims) {
    const status = claim.status || "unknown";
    if (!groups[status]) groups[status] = [];
    groups[status].push(claim);
  }

  const lines = [];
  lines.push(`# Changelog — ${sprintName}`);
  lines.push("");

  // Active claims first
  if (groups.active) {
    lines.push(`## Active (${groups.active.length} claims)`);
    lines.push("");
    for (const claim of groups.active) {
      lines.push(`- ${claim.id}: ${claimText(claim)}`);
    }
    lines.push("");
  }

  // Resolved claims
  if (groups.resolved) {
    lines.push(`## Resolved (${groups.resolved.length} claims)`);
    lines.push("");
    for (const claim of groups.resolved) {
      lines.push(`- ${claim.id}: ${claimText(claim)}`);
    }
    lines.push("");
  }

  // All other statuses
  const shown = new Set(["active", "resolved"]);
  const otherStatuses = Object.keys(groups)
    .filter((s) => !shown.has(s))
    .sort();

  for (const status of otherStatuses) {
    const group = groups[status];
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    lines.push(`## ${label} (${group.length} claims)`);
    lines.push("");
    for (const claim of group) {
      lines.push(`- ${claim.id}: ${claimText(claim)}`);
    }
    lines.push("");
  }

  // Conflicts section
  if (conflicts.length > 0) {
    lines.push(`## Conflicts (${conflicts.length})`);
    lines.push("");
    for (const conflict of conflicts) {
      const ids = Array.isArray(conflict.claim_ids)
        ? conflict.claim_ids.join(" vs ")
        : conflict.between || "unknown";
      const desc = conflict.description || conflict.reason || "";
      lines.push(`- ${ids}: ${desc}`);
    }
    lines.push("");
  } else {
    lines.push(`## Conflicts (0)`);
    lines.push("");
    lines.push("No conflicts.");
    lines.push("");
  }

  return lines.join("\n");
}

function claimText(claim) {
  const text = claim.content || claim.text || "";
  // Truncate long claims for readability
  if (text.length > 120) {
    return text.slice(0, 117) + "...";
  }
  return text;
}
