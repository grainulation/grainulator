import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSprintFiles } from "../../shared/lib/sprints.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export so existing callers of orchard's dashboard.findSprintFiles keep working.
export { findSprintFiles };

/**
 * Parse a claims.json file into sprint metadata and claims array.
 */
function parseClaims(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const meta = raw.meta || {};
    const claims = Array.isArray(raw) ? raw : raw.claims || [];
    return { meta, claims };
  } catch {
    return null;
  }
}

/**
 * Load all sprint data from a target directory.
 * Returns the graph data structure: { sprints, edges, cycles, status }
 * suitable for template injection.
 */
export function loadSprints(targetDir) {
  const sources = findSprintFiles(targetDir);
  const sprints = [];

  for (const src of sources) {
    const parsed = parseClaims(src.file);
    if (!parsed) continue;
    const { meta, claims } = parsed;
    if (claims.length === 0) continue;

    const topicSet = new Set();
    for (const c of claims) {
      if (c.topic) topicSet.add(c.topic);
    }

    sprints.push({
      path: src.dir,
      question: meta.question || "(no question)",
      phase: meta.phase || "unknown",
      claimCount: claims.length,
      topics: [...topicSet],
      initiated: meta.initiated || null,
      _claims: claims,
    });
  }

  // Build edges from cross-references
  const edges = [];
  for (const sprint of sprints) {
    for (const claim of sprint._claims) {
      // Check resolved_by for cross-sprint references
      if (claim.resolved_by && typeof claim.resolved_by === "string") {
        for (const other of sprints) {
          if (other.path === sprint.path) continue;
          const dirName = path.basename(other.path);
          if (claim.resolved_by.includes(dirName)) {
            addEdge(edges, sprint.path, other.path, "resolved_by");
            break;
          }
        }
      }

      // Check conflicts_with
      if (Array.isArray(claim.conflicts_with)) {
        for (const ref of claim.conflicts_with) {
          if (typeof ref !== "string") continue;
          for (const other of sprints) {
            if (other.path === sprint.path) continue;
            const dirName = path.basename(other.path);
            if (ref.includes(dirName)) {
              addEdge(edges, sprint.path, other.path, "conflict");
              break;
            }
          }
        }
      }

      // Check content for sprint name references
      const content = claim.content || claim.text || "";
      if (typeof content === "string") {
        for (const other of sprints) {
          if (other.path === sprint.path) continue;
          const sprintName = path.basename(other.path);
          if (sprintName.length > 3 && content.includes(sprintName)) {
            addEdge(edges, sprint.path, other.path, "reference");
          }
        }
      }
    }
  }

  // Detect cycles via DFS
  const cycles = detectCycles(sprints, edges);

  // Build status array
  const status = sprints.map((s) => {
    let active = 0,
      resolved = 0,
      superseded = 0,
      other = 0;
    let latestTimestamp = null;
    const topicCounts = {};

    for (const c of s._claims) {
      const st = (c.status || "").toLowerCase();
      if (st === "active") active++;
      else if (st === "resolved") resolved++;
      else if (st === "superseded") superseded++;
      else other++;

      if (c.timestamp) {
        if (!latestTimestamp || c.timestamp > latestTimestamp)
          latestTimestamp = c.timestamp;
      }
      if (c.topic) {
        topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
      }
    }

    let daysSinceUpdate = null;
    if (latestTimestamp) {
      const lastDate = new Date(latestTimestamp);
      const now = new Date();
      daysSinceUpdate = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    }

    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    return {
      path: s.path,
      question: s.question,
      phase: s.phase,
      initiated: s.initiated,
      total: s._claims.length,
      active,
      resolved,
      superseded,
      other,
      daysSinceUpdate,
      topTopics,
    };
  });

  // Strip _claims from sprint objects before returning
  const cleanSprints = sprints.map((s) => {
    const { _claims: _, ...rest } = s;
    return rest;
  });

  return { sprints: cleanSprints, edges, cycles, status };
}

function addEdge(edges, from, to, type) {
  const existing = edges.find(
    (e) => e.from === from && e.to === to && e.type === type,
  );
  if (existing) {
    existing.count++;
  } else {
    edges.push({ from, to, type, count: 1 });
  }
}

function detectCycles(sprints, edges) {
  const cycles = [];
  const adj = {};
  for (const s of sprints) adj[s.path] = [];
  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = {};
  for (const s of sprints) color[s.path] = WHITE;

  function dfs(u, pathStack) {
    color[u] = GRAY;
    pathStack.push(u);
    for (const v of adj[u] || []) {
      if (color[v] === GRAY) {
        const cycleStart = pathStack.indexOf(v);
        if (cycleStart !== -1) {
          cycles.push(pathStack.slice(cycleStart).map((p) => path.basename(p)));
        }
      } else if (color[v] === WHITE) {
        dfs(v, pathStack);
      }
    }
    pathStack.pop();
    color[u] = BLACK;
  }

  for (const s of sprints) {
    if (color[s.path] === WHITE) dfs(s.path, []);
  }

  return cycles;
}

/**
 * Build the dashboard HTML string from sprint graph data.
 * @param {object} graphData - { sprints, edges, cycles, status }
 * @returns {string} Complete HTML string
 */
export function buildHtml(graphData) {
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "dashboard.html",
  );
  const template = fs.readFileSync(templatePath, "utf8");
  const jsonData = JSON.stringify(graphData).replace(
    /<\/script/gi,
    "<\\/script",
  );
  return template.replace("__SPRINT_DATA__", jsonData);
}

/**
 * Return paths to all claims.json files for watching.
 */
export function claimsPaths(targetDir) {
  return findSprintFiles(targetDir).map((s) => s.file);
}

/**
 * Generate a self-contained HTML dashboard file (for `orchard dashboard` CLI command).
 */
export function generateDashboard(config, root, outPath) {
  const graphData = loadSprints(root);

  if (graphData.sprints.length === 0) {
    console.error("No sprints found (no claims.json files detected).");
    process.exit(1);
  }

  const html = buildHtml(graphData);
  fs.writeFileSync(outPath, html);
  console.log(`Dashboard written to ${outPath}`);
  console.log(
    `  ${graphData.sprints.length} sprints, ${graphData.edges.length} edges, ${graphData.cycles.length} cycles`,
  );
}
