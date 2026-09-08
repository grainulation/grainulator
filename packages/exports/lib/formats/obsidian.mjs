/**
 * mill format: obsidian
 *
 * Converts compilation.json claims to Obsidian-flavored markdown
 * with YAML front matter, wikilinks, and backlinks.
 * Zero dependencies — node built-in only.
 */

export const name = "obsidian";
export const extension = ".md";
export const mimeType = "text/markdown; charset=utf-8";
export const description =
  "Claims as Obsidian vault page (YAML front matter, wikilinks, backlinks)";

/**
 * Convert a compilation object to Obsidian markdown.
 * @param {object} compilation - The compilation.json content
 * @returns {string} Markdown output
 */
export function convert(compilation) {
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
  const sprint = meta.sprint || "unknown";
  const question = meta.question || "";
  const audience = meta.audience || "";

  const grouped = groupByType(claims);
  const lines = [];

  // YAML front matter
  lines.push("---");
  lines.push(`sprint: ${sprint}`);
  if (question) lines.push(`question: "${escapeFrontMatter(question)}"`);
  if (audience) lines.push(`audience: "${escapeFrontMatter(audience)}"`);
  lines.push(`claim_count: ${claims.length}`);
  lines.push("tags: [wheat, sprint, export]");
  lines.push("---");
  lines.push("");

  // Title
  lines.push(`# Sprint: ${sprint}`);
  lines.push("");

  if (question) {
    lines.push(`> ${question}`);
    lines.push("");
  }

  // Claims grouped by type
  lines.push("## Claims");
  lines.push("");

  const typeOrder = [
    "constraint",
    "factual",
    "estimate",
    "risk",
    "recommendation",
    "feedback",
  ];
  const seen = new Set();

  for (const type of typeOrder) {
    if (grouped[type]) {
      lines.push(...renderGroup(type, grouped[type]));
      seen.add(type);
    }
  }

  for (const type of Object.keys(grouped)) {
    if (!seen.has(type)) {
      lines.push(...renderGroup(type, grouped[type]));
    }
  }

  // Connections section
  lines.push("## Connections");
  lines.push("");
  lines.push("- Related: [[compilation]] [[claims]]");

  if (compilation.certificate) {
    lines.push("- Certificate: [[certificate]]");
  }

  lines.push("");
  return lines.join("\n") + "\n";
}

function groupByType(claims) {
  const groups = {};
  for (const claim of claims) {
    const type = claim.type || "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(claim);
  }
  return groups;
}

function renderGroup(type, claims) {
  const label = capitalize(type) + "s";
  const lines = [];

  lines.push(`### ${label}`);

  for (const claim of claims) {
    const id = claim.id || "???";
    const content = claim.content || claim.text || "";
    const summary = truncate(content, 120);
    const evidence = getEvidence(claim);
    const tags = formatTags(claim);

    lines.push(`- [[${id}]] ${summary} #${type} #${evidence}${tags}`);
  }

  lines.push("");
  return lines;
}

function getEvidence(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || claim.evidence_tier || "stated";
  }
  return claim.evidence_tier || "stated";
}

function formatTags(claim) {
  const tags = Array.isArray(claim.tags) ? claim.tags : [];
  if (tags.length === 0) return "";
  return " " + tags.map((t) => `#${t.replace(/\s+/g, "-")}`).join(" ");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function escapeFrontMatter(str) {
  return String(str).replace(/"/g, '\\"');
}
