/**
 * mill format: github-issues
 *
 * Converts compilation.json claims to a single markdown file
 * with each claim formatted as a GitHub issue template.
 * Zero dependencies — node built-in only.
 */

export const name = "github-issues";
export const extension = ".md";
export const mimeType = "text/markdown; charset=utf-8";
export const description =
  "Claims as GitHub issue templates (one markdown file, horizontal-rule separated)";

/**
 * Convert a compilation object to GitHub issue markdown.
 * @param {object} compilation - The compilation.json content
 * @returns {string} Markdown output
 */
export function convert(compilation) {
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
  const sprint = meta.sprint || "unknown";

  const lines = [];

  lines.push(`# GitHub Issues: ${sprint}`);
  lines.push("");
  lines.push("> Bulk-create with the `gh` CLI:");
  lines.push("> ```");
  lines.push(
    '> # Split this file by "---" and create each section as an issue:',
  );
  lines.push(
    `> # gh issue create --title "TITLE" --body "BODY" --label "TYPE"`,
  );
  lines.push("> ```");
  lines.push("");

  if (claims.length === 0) {
    lines.push("_No claims to export._");
    return lines.join("\n") + "\n";
  }

  for (let i = 0; i < claims.length; i++) {
    if (i > 0) {
      lines.push("");
    }
    lines.push("---");
    lines.push("");
    lines.push(...formatClaim(claims[i]));
  }

  lines.push("");
  return lines.join("\n") + "\n";
}

function formatClaim(claim) {
  const id = claim.id || "???";
  const content = claim.content || claim.text || "";
  const type = claim.type || "unknown";
  const evidence = getEvidence(claim);
  const status = claim.status || "unknown";
  const tags = Array.isArray(claim.tags) ? claim.tags : [];
  const summary = truncate(content, 80);

  const lines = [];

  lines.push(`## ${id}: ${summary}`);
  lines.push("");
  lines.push(
    `**Type:** ${type} | **Evidence:** ${evidence} | **Status:** ${status}`,
  );
  lines.push("");
  lines.push(content);

  if (tags.length > 0) {
    lines.push("");
    lines.push(`**Tags:** ${tags.join(", ")}`);
  }

  return lines;
}

function getEvidence(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || claim.evidence_tier || "stated";
  }
  return claim.evidence_tier || "stated";
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}
