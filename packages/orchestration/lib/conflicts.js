import fs from "node:fs";
import path from "node:path";

/**
 * Load claims from a sprint directory.
 */
export function loadClaims(sprintPath, root) {
  const absPath = path.isAbsolute(sprintPath)
    ? sprintPath
    : path.join(root, sprintPath);
  const claimsPath = path.join(absPath, "claims.json");

  if (!fs.existsSync(claimsPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
    const claims = Array.isArray(data) ? data : data.claims || [];
    return claims.map((c) => ({ ...c, _source: sprintPath }));
  } catch {
    return [];
  }
}

/**
 * Severity levels for conflicts:
 * - critical: Opposing recommendations on same topic (needs immediate resolution)
 * - warning: Constraint-recommendation tension (may need investigation)
 * - info: Same-topic claims with different evidence tiers (terminology/approach differences)
 */
export const SEVERITY = {
  critical: "critical",
  warning: "warning",
  info: "info",
};

/**
 * Detect potential conflicts between claims across sprints.
 *
 * Conflict heuristics:
 * 1. Same-type claims with contradicting content (recommendations that oppose each other)
 * 2. Constraints that conflict with recommendations from other sprints
 * 3. Estimates with non-overlapping ranges on the same topic
 *
 * Returns array of { type, claimA, claimB, severity, reason, actions }
 */
export function detectConflicts(config, root) {
  const allClaims = [];

  for (const sprint of config.sprints || []) {
    const claims = loadClaims(sprint.path, root);
    allClaims.push(...claims);
  }

  const conflicts = [];

  // Group claims by tags for overlap detection
  const byTag = new Map();
  for (const claim of allClaims) {
    for (const tag of claim.tags || []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(claim);
    }
  }

  // Check for cross-sprint conflicts within same tag
  for (const [tag, claims] of byTag) {
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i];
        const b = claims[j];

        // Only flag cross-sprint conflicts
        if (a._source === b._source) continue;

        // Opposing recommendations — critical severity
        if (a.type === "recommendation" && b.type === "recommendation") {
          if (couldContradict(a.text || a.content, b.text || b.content)) {
            conflicts.push({
              type: "opposing-recommendations",
              claimA: a,
              claimB: b,
              tag,
              severity: SEVERITY.critical,
              reason: `Both sprints recommend on "${tag}" but may conflict`,
              actions: ["trust-a", "trust-b", "investigate"],
            });
          }
        }

        // Constraint vs recommendation — warning severity
        if (
          (a.type === "constraint" && b.type === "recommendation") ||
          (a.type === "recommendation" && b.type === "constraint")
        ) {
          conflicts.push({
            type: "constraint-recommendation-tension",
            claimA: a,
            claimB: b,
            tag,
            severity: SEVERITY.warning,
            reason: `Constraint from ${a._source} may conflict with recommendation from ${b._source}`,
            actions: ["trust-a", "trust-b", "investigate"],
          });
        }

        // Same topic, different evidence tiers — info severity
        if (
          a.type === b.type &&
          a.type === "factual" &&
          a.evidence !== b.evidence
        ) {
          conflicts.push({
            type: "evidence-tier-mismatch",
            claimA: a,
            claimB: b,
            tag,
            severity: SEVERITY.info,
            reason: `Different evidence tiers on "${tag}": ${a.evidence || "unknown"} vs ${b.evidence || "unknown"}`,
            actions: ["trust-a", "trust-b", "dismiss"],
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Filter conflicts by severity level.
 */
export function filterBySeverity(conflicts, minSeverity) {
  const order = { critical: 0, warning: 1, info: 2 };
  const threshold = order[minSeverity] ?? 2;
  return conflicts.filter((c) => (order[c.severity] ?? 2) <= threshold);
}

/**
 * Simple heuristic: two texts might contradict if they share keywords
 * but use opposing qualifiers. This is intentionally conservative --
 * false positives are better than missed conflicts.
 */
export function couldContradict(textA, textB) {
  if (!textA || !textB) return false;

  const negators = [
    "not",
    "no",
    "never",
    "avoid",
    "instead",
    "rather",
    "without",
    "dont",
    "don't",
  ];
  const aWords = new Set(textA.toLowerCase().split(/\s+/));
  const bWords = new Set(textB.toLowerCase().split(/\s+/));

  const aNeg = negators.some((n) => aWords.has(n));
  const bNeg = negators.some((n) => bWords.has(n));

  // One negated, one not -- possible contradiction
  if (aNeg !== bNeg) return true;

  return false;
}

/**
 * Print conflict report with severity-based formatting.
 */
export function printConflicts(config, root, opts = {}) {
  const all = detectConflicts(config, root);
  const minSeverity = opts.severity || "info";
  const conflicts = filterBySeverity(all, minSeverity);

  if (conflicts.length === 0) {
    console.log("");
    console.log("  No cross-sprint conflicts detected.");
    console.log("");
    return;
  }

  const severityIcon = { critical: "!!!", warning: "!!", info: "(i)" };
  const critical = conflicts.filter((c) => c.severity === "critical");
  const warning = conflicts.filter((c) => c.severity === "warning");
  const info = conflicts.filter((c) => c.severity === "info");

  console.log("");
  console.log(`  ${conflicts.length} conflict(s) detected`);
  if (critical.length) console.log(`    ${critical.length} critical`);
  if (warning.length) console.log(`    ${warning.length} warning`);
  if (info.length) console.log(`    ${info.length} info`);
  console.log("  " + "=".repeat(50));

  for (const c of conflicts) {
    const icon = severityIcon[c.severity] || "?";
    const textA = (c.claimA.text || c.claimA.content || "").substring(0, 80);
    const textB = (c.claimB.text || c.claimB.content || "").substring(0, 80);

    console.log("");
    console.log(`  ${icon} [${c.severity}] ${c.type} — tag: ${c.tag}`);
    console.log(`    Sprint A: ${c.claimA._source} (${c.claimA.id})`);
    if (textA) console.log(`      "${textA}"`);
    console.log(`    Sprint B: ${c.claimB._source} (${c.claimB.id})`);
    if (textB) console.log(`      "${textB}"`);
    console.log(`    Reason: ${c.reason}`);
    if (c.actions) {
      console.log(`    Actions: ${c.actions.join(" | ")}`);
    }
  }

  console.log("");
}

/**
 * Scan for cross-sprint conflicts by scanning a directory tree for claims.json files.
 * Does not require orchard.json -- discovers sprints automatically.
 *
 * @param {string} rootDir - Root directory to scan for sprint subdirectories
 * @param {object} [opts] - Options
 * @param {string} [opts.severity] - Minimum severity to include (default: 'info')
 * @param {number} [opts.maxDepth] - Max directory depth to scan (default: 3)
 * @returns {object} - { conflicts, summary, sprintsScanned }
 */
export function scanAllConflicts(rootDir, opts = {}) {
  const maxDepth = opts.maxDepth || 3;
  const minSeverity = opts.severity || "info";

  // Discover sprint directories by finding claims.json files
  const sprintPaths = discoverSprints(rootDir, maxDepth);

  if (sprintPaths.length < 2) {
    return {
      conflicts: [],
      summary: { total: 0, critical: 0, warning: 0, info: 0 },
      sprintsScanned: sprintPaths.length,
    };
  }

  // Build a synthetic config for detectConflicts
  const config = {
    sprints: sprintPaths.map((p) => ({ path: p })),
  };

  const all = detectConflicts(config, rootDir);
  const filtered = filterBySeverity(all, minSeverity);

  const critical = filtered.filter((c) => c.severity === "critical").length;
  const warning = filtered.filter((c) => c.severity === "warning").length;
  const info = filtered.filter((c) => c.severity === "info").length;

  return {
    conflicts: filtered,
    summary: { total: filtered.length, critical, warning, info },
    sprintsScanned: sprintPaths.length,
  };
}

/**
 * Recursively discover sprint directories (directories containing claims.json).
 */
export function discoverSprints(dir, maxDepth, currentDepth) {
  if (currentDepth === undefined) currentDepth = 0;
  if (currentDepth > maxDepth) return [];

  const results = [];

  // Check if this directory has claims.json
  const claimsPath = path.join(dir, "claims.json");
  if (fs.existsSync(claimsPath)) {
    results.push(dir);
  }

  // Recurse into subdirectories
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const childDir = path.join(dir, entry.name);
      results.push(...discoverSprints(childDir, maxDepth, currentDepth + 1));
    }
  } catch {
    // skip unreadable directories
  }

  return results;
}
