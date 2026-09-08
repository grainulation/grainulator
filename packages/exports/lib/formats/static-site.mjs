/**
 * mill format: static-site
 *
 * Converts compilation.json to a Hugo-compatible static site manifest.
 * Outputs a JSON object describing the file tree (content pages, data, config).
 * Actual file writing is left to a publisher step.
 * Zero dependencies — node built-in only.
 */

export const name = "static-site";
export const extension = ".json";
export const mimeType = "application/json; charset=utf-8";
export const description =
  "Hugo-compatible static site manifest (file tree as JSON)";

/**
 * Convert a compilation object to a static site manifest.
 * @param {object} compilation - The compilation.json content
 * @returns {string} JSON output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];
  const meta = compilation.meta || {};
  const certificate = compilation.certificate || {};

  const sprintName = meta.sprint || "sprint";
  const question = meta.question || "";
  const audience = meta.audience || "";

  const files = {};

  // Hugo config
  files["config.yaml"] = buildConfig(sprintName, question);

  // Index page
  files["content/_index.md"] = buildIndex(
    sprintName,
    question,
    audience,
    claims,
  );

  // Per-type section pages
  const groups = {};
  for (const claim of claims) {
    const type = claim.type || "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(claim);
  }

  for (const [type, group] of Object.entries(groups)) {
    files[`content/claims/${type}/_index.md`] = buildSectionIndex(
      type,
      group.length,
    );

    for (const claim of group) {
      const id = claim.id || "unknown";
      files[`content/claims/${type}/${id}.md`] = buildClaimPage(claim);
    }
  }

  // Data file: full claims array
  files["data/claims.json"] = JSON.stringify(claims, null, 2);

  // Data file: certificate
  if (Object.keys(certificate).length > 0) {
    files["data/certificate.json"] = JSON.stringify(certificate, null, 2);
  }

  // Data file: meta
  files["data/meta.json"] = JSON.stringify(meta, null, 2);

  const manifest = {
    generator: "mill",
    sprint: sprintName,
    claimCount: claims.length,
    files,
  };

  return JSON.stringify(manifest, null, 2) + "\n";
}

function buildConfig(sprintName, question) {
  const lines = [];
  lines.push(
    `baseURL: "https://your-site.example.com/${sanitizeSlug(sprintName)}/"  # Update with your domain`,
  );
  lines.push(`title: "${escYaml(sprintName)}"`);
  lines.push(`theme: "mill-default"`);
  lines.push('languageCode: "en-us"');
  lines.push("");
  lines.push("params:");
  lines.push(`  question: "${escYaml(question)}"`);
  lines.push(`  generator: "mill"`);
  return lines.join("\n") + "\n";
}

function buildIndex(sprintName, question, audience, claims) {
  const lines = [];
  lines.push("---");
  lines.push(`title: "${escYaml(sprintName)}"`);
  lines.push(`description: "${escYaml(question)}"`);
  lines.push('type: "index"');
  lines.push("---");
  lines.push("");
  lines.push(`# ${sprintName}`);
  lines.push("");
  if (question) lines.push(`**Question:** ${question}`);
  if (audience) lines.push(`**Audience:** ${audience}`);
  lines.push("");
  lines.push(`**Total claims:** ${claims.length}`);

  // Type summary
  const typeCounts = {};
  for (const c of claims) {
    const t = c.type || "other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  lines.push("");
  for (const [type, count] of Object.entries(typeCounts)) {
    lines.push(`- ${type}: ${count}`);
  }

  return lines.join("\n") + "\n";
}

function buildSectionIndex(type, count) {
  const lines = [];
  lines.push("---");
  lines.push(`title: "${escYaml(type)}"`);
  lines.push(`type: "section"`);
  lines.push("---");
  lines.push("");
  lines.push(`${count} ${type} claim${count !== 1 ? "s" : ""}.`);
  return lines.join("\n") + "\n";
}

function buildClaimPage(claim) {
  const id = claim.id || "unknown";
  const type = claim.type || "";
  const content = claim.content || claim.text || "";
  const evidence = getEvidence(claim);
  const status = claim.status || "";
  const tags = Array.isArray(claim.tags) ? claim.tags : [];
  const confidence = claim.confidence != null ? claim.confidence : "";

  const lines = [];
  lines.push("---");
  lines.push(`title: "${escYaml(id)}"`);
  lines.push(`type: "${escYaml(type)}"`);
  lines.push(`evidence: "${escYaml(evidence)}"`);
  lines.push(`status: "${escYaml(status)}"`);
  if (confidence !== "") lines.push(`confidence: ${confidence}`);
  if (tags.length > 0)
    lines.push(`tags: [${tags.map((t) => `"${escYaml(t)}"`).join(", ")}]`);
  lines.push("---");
  lines.push("");
  lines.push(content);
  return lines.join("\n") + "\n";
}

function getEvidence(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || claim.evidence_tier || "";
  }
  return claim.evidence_tier || "";
}

function escYaml(str) {
  if (str == null) return "";
  return String(str).replace(/"/g, '\\"');
}

function sanitizeSlug(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
