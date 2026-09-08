import fs from "node:fs";
import path from "node:path";

/**
 * Auto-decompose a research question into sub-sprints.
 *
 * Uses heuristic keyword analysis to break a broad question into
 * focused sub-questions, each becoming its own sprint with appropriate
 * dependency relationships.
 *
 * This is a deterministic, offline decomposition — no LLM required.
 * For richer decomposition, pipe through wheat's claim system.
 */

/**
 * Facets that broad research questions typically decompose into.
 * Each facet has trigger keywords and a question template.
 */
export const FACETS = [
  {
    name: "technical",
    triggers: [
      "how",
      "implement",
      "build",
      "architecture",
      "system",
      "code",
      "api",
      "stack",
      "platform",
      "tool",
    ],
    template: (q) =>
      `What are the technical requirements and architecture for: ${q}`,
  },
  {
    name: "user-experience",
    triggers: [
      "user",
      "ux",
      "design",
      "interface",
      "experience",
      "mobile",
      "web",
      "dashboard",
      "visual",
    ],
    template: (q) => `What should the user experience look like for: ${q}`,
  },
  {
    name: "market",
    triggers: [
      "market",
      "competitor",
      "existing",
      "prior",
      "landscape",
      "alternative",
      "compare",
      "industry",
    ],
    template: (q) => `What does the competitive landscape look like for: ${q}`,
  },
  {
    name: "feasibility",
    triggers: [
      "cost",
      "time",
      "effort",
      "feasible",
      "risk",
      "constraint",
      "limit",
      "budget",
      "resource",
    ],
    template: (q) => `What are the feasibility constraints and risks for: ${q}`,
  },
  {
    name: "adoption",
    triggers: [
      "adopt",
      "rollout",
      "migration",
      "team",
      "org",
      "enterprise",
      "onboard",
      "training",
      "change",
    ],
    template: (q) => `What does adoption and rollout look like for: ${q}`,
  },
  {
    name: "measurement",
    triggers: [
      "measure",
      "metric",
      "success",
      "kpi",
      "track",
      "outcome",
      "impact",
      "evaluate",
      "test",
    ],
    template: (q) => `How do we measure success for: ${q}`,
  },
];

/**
 * Score how relevant each facet is to the question.
 */
export function scoreFacets(question) {
  const words = new Set(question.toLowerCase().split(/\s+/));
  return FACETS.map((f) => {
    const hits = f.triggers.filter(
      (t) => words.has(t) || question.toLowerCase().includes(t),
    );
    return { ...f, score: hits.length };
  });
}

/**
 * Decompose a question into sub-sprints.
 * Returns an array of sprint configs ready to add to orchard.json.
 *
 * Options:
 *   maxSprints: maximum number of sub-sprints (default 5)
 *   prefix: path prefix for sprint directories (default 'sprints')
 *   minFacets: minimum facets even if no keywords match (default 2)
 */
export function decompose(question, opts = {}) {
  const maxSprints = opts.maxSprints || 5;
  const prefix = opts.prefix || "sprints";
  const minFacets = opts.minFacets || 2;

  const scored = scoreFacets(question);

  // Pick facets: all with score > 0, or top minFacets if none match
  let selected = scored.filter((f) => f.score > 0);
  if (selected.length < minFacets) {
    selected = scored
      .sort(
        (a, b) => b.score - a.score || FACETS.indexOf(a) - FACETS.indexOf(b),
      )
      .slice(0, minFacets);
  }

  // Cap at maxSprints
  selected = selected.slice(0, maxSprints);

  // Generate slug from question
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);

  const sprints = selected.map((facet, i) => ({
    path: path.join(prefix, `${slug}-${facet.name}`),
    name: `${slug}-${facet.name}`,
    question: facet.template(question),
    depends_on:
      i === 0 ? [] : [path.join(prefix, `${slug}-${selected[0].name}`)],
  }));

  // Add a synthesis sprint that depends on all others
  if (sprints.length >= 2) {
    sprints.push({
      path: path.join(prefix, `${slug}-synthesis`),
      name: `${slug}-synthesis`,
      question: `Synthesize findings across all sub-sprints for: ${question}`,
      depends_on: sprints.map((s) => s.path),
    });
  }

  return sprints;
}

/**
 * Apply decomposition: create directories and update orchard.json.
 */
export function applyDecomposition(root, question, opts = {}) {
  const sprints = decompose(question, opts);

  // Create sprint directories with initial claims.json
  for (const sprint of sprints) {
    const absPath = path.join(root, sprint.path);
    fs.mkdirSync(absPath, { recursive: true });

    const claimsPath = path.join(absPath, "claims.json");
    if (!fs.existsSync(claimsPath)) {
      const initial = {
        schema_version: "1.0",
        meta: {
          question: sprint.question,
          initiated: new Date().toISOString().split("T")[0],
          audience: [],
          phase: "define",
          connectors: [],
        },
        claims: [],
      };
      fs.writeFileSync(
        claimsPath,
        JSON.stringify(initial, null, 2) + "\n",
        "utf8",
      );
    }
  }

  // Update orchard.json
  const orchardPath = path.join(root, "orchard.json");
  let config = { sprints: [] };
  if (fs.existsSync(orchardPath)) {
    config = JSON.parse(fs.readFileSync(orchardPath, "utf8"));
  }
  config.sprints = config.sprints || [];

  const existingPaths = new Set(config.sprints.map((s) => s.path));
  for (const sprint of sprints) {
    if (!existingPaths.has(sprint.path)) {
      config.sprints.push(sprint);
    }
  }

  fs.writeFileSync(orchardPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  return sprints;
}

/**
 * Print decomposition plan without applying it.
 */
export function printDecomposition(question, opts = {}) {
  const sprints = decompose(question, opts);

  console.log("");
  console.log(`  Auto-decompose: "${question}"`);
  console.log("  " + "=".repeat(50));
  console.log(`  ${sprints.length} sub-sprints generated:`);
  console.log("");

  for (const s of sprints) {
    const deps = s.depends_on.length
      ? ` (depends on: ${s.depends_on.map((d) => path.basename(d)).join(", ")})`
      : " (root)";
    console.log(`    ${path.basename(s.path)}${deps}`);
    console.log(`      Q: ${s.question}`);
  }

  console.log("");
  console.log('  Apply with: orchard decompose --apply "<question>"');
  console.log("");
}
