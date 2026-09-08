import path from "node:path";

/**
 * Build an adjacency list from sprint dependencies.
 * Returns { nodes: Map<path, sprint>, edges: Map<path, Set<path>> }
 */
export function buildGraph(config) {
  const nodes = new Map();
  const edges = new Map();

  for (const sprint of config.sprints || []) {
    nodes.set(sprint.path, sprint);
    edges.set(sprint.path, new Set());
  }

  for (const sprint of config.sprints || []) {
    for (const dep of sprint.depends_on || []) {
      if (edges.has(dep)) {
        edges.get(dep).add(sprint.path);
      }
    }
  }

  return { nodes, edges };
}

/**
 * Topological sort of sprints. Returns ordered array of sprint paths.
 * Throws if a cycle is detected.
 */
export function topoSort(config) {
  const sprints = config.sprints || [];
  const inDegree = new Map();
  const adj = new Map();

  for (const s of sprints) {
    inDegree.set(s.path, 0);
    adj.set(s.path, []);
  }

  for (const s of sprints) {
    for (const dep of s.depends_on || []) {
      if (adj.has(dep)) {
        adj.get(dep).push(s.path);
        inDegree.set(s.path, (inDegree.get(s.path) || 0) + 1);
      }
    }
  }

  const queue = [];
  for (const [p, deg] of inDegree) {
    if (deg === 0) queue.push(p);
  }

  const order = [];
  while (queue.length > 0) {
    const curr = queue.shift();
    order.push(curr);
    for (const next of adj.get(curr) || []) {
      const newDeg = inDegree.get(next) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (order.length !== sprints.length) {
    const remaining = sprints
      .map((s) => s.path)
      .filter((p) => !order.includes(p));
    throw new Error(
      `Dependency cycle detected involving: ${remaining.join(", ")}`,
    );
  }

  return order;
}

/**
 * Detect dependency cycles. Returns array of cycle paths, empty if acyclic.
 */
export function detectCycles(config) {
  try {
    topoSort(config);
    return [];
  } catch {
    return config.sprints.map((s) => s.path);
  }
}

/**
 * Print the dependency graph as ASCII art to stdout.
 */
export function printDependencyGraph(config, root) {
  const sprints = config.sprints || [];

  if (sprints.length === 0) {
    console.log("No sprints configured in orchard.json.");
    return;
  }

  console.log("");
  console.log(`  Sprint Dependency Graph (${sprints.length} sprints)`);
  console.log("  " + "=".repeat(50));
  console.log("");

  // Build lookup
  const byPath = new Map();
  for (const s of sprints) byPath.set(s.path, s);

  let order;
  try {
    order = topoSort(config);
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return;
  }

  // Compute depth (longest path from root)
  const depth = new Map();
  for (const p of order) {
    const s = byPath.get(p);
    let maxDepth = 0;
    for (const dep of s.depends_on || []) {
      if (depth.has(dep)) {
        maxDepth = Math.max(maxDepth, depth.get(dep) + 1);
      }
    }
    depth.set(p, maxDepth);
  }

  // Group by depth
  const levels = new Map();
  for (const [p, d] of depth) {
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d).push(p);
  }

  const maxLevel = Math.max(...levels.keys(), 0);

  for (let level = 0; level <= maxLevel; level++) {
    const items = levels.get(level) || [];
    for (const p of items) {
      const s = byPath.get(p);
      const name = path.basename(p);
      const status = s.status || "unknown";
      const assignee = s.assigned_to || "unassigned";
      const indent = "  ".repeat(level + 1);

      const marker =
        status === "active"
          ? "[*]"
          : status === "done"
            ? "[x]"
            : status === "blocked"
              ? "[!]"
              : "[ ]";

      console.log(`${indent}${marker} ${name} (${assignee})`);

      // Show what it depends on
      for (const dep of s.depends_on || []) {
        console.log(`${indent}    <- ${path.basename(dep)}`);
      }
    }

    if (level < maxLevel) {
      console.log("  " + " ".repeat(level * 2) + "  |");
    }
  }

  console.log("");

  // Show deadline summary
  const withDeadlines = sprints.filter((s) => s.deadline);
  if (withDeadlines.length > 0) {
    console.log("  Deadlines:");
    withDeadlines
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .forEach((s) => {
        const name = path.basename(s.path);
        const days = daysUntil(s.deadline);
        const urgency =
          days < 0 ? "OVERDUE" : days <= 3 ? "URGENT" : `${days}d`;
        console.log(`    ${name}: ${s.deadline} (${urgency})`);
      });
    console.log("");
  }
}

/**
 * Generate a Mermaid diagram string for the sprint dependency graph.
 * Color-coded nodes: green (done/compiled), blue (active), amber (blocked), red (cycle).
 * Highlights critical path with thick edges.
 */
export function generateMermaid(config) {
  const sprints = config.sprints || [];
  if (sprints.length === 0) return 'graph TD\n  empty["No sprints configured"]';

  const lines = ["graph TD"];

  // Style definitions for status colors
  lines.push("  classDef done fill:#22c55e,stroke:#16a34a,color:#fff");
  lines.push("  classDef compiled fill:#22c55e,stroke:#16a34a,color:#fff");
  lines.push("  classDef active fill:#3b82f6,stroke:#2563eb,color:#fff");
  lines.push("  classDef blocked fill:#f59e0b,stroke:#d97706,color:#fff");
  lines.push("  classDef notstarted fill:#6b7280,stroke:#4b5563,color:#fff");
  lines.push("  classDef conflict fill:#ef4444,stroke:#dc2626,color:#fff");

  const byPath = new Map();
  for (const s of sprints) byPath.set(s.path, s);

  // Sanitize path into a valid Mermaid node ID
  function nodeId(p) {
    return p.replace(/[^a-zA-Z0-9]/g, "_");
  }

  function nodeLabel(s) {
    const name = path.basename(s.path);
    const status = s.status || "unknown";
    const assignee = s.assigned_to ? ` (${s.assigned_to})` : "";
    return `${name}${assignee}\\n${status}`;
  }

  // Detect cycles for marking
  const cycleSet = new Set(detectCycles(config));

  // Compute critical path (longest path lengths)
  let criticalEdges = new Set();
  try {
    const order = topoSort(config);
    const dist = new Map();
    const prev = new Map();
    for (const p of order) dist.set(p, 0);

    for (const p of order) {
      const s = byPath.get(p);
      for (const dep of s.depends_on || []) {
        if (dist.has(dep) && dist.get(dep) + 1 > dist.get(p)) {
          dist.set(p, dist.get(dep) + 1);
          prev.set(p, dep);
        }
      }
    }

    // Find the node with max distance — that's the end of critical path
    let maxNode = null;
    let maxDist = 0;
    for (const [p, d] of dist) {
      if (d >= maxDist) {
        maxDist = d;
        maxNode = p;
      }
    }

    // Walk back to build critical path edges
    let cur = maxNode;
    while (cur && prev.has(cur)) {
      const from = prev.get(cur);
      criticalEdges.add(`${nodeId(from)}-->${nodeId(cur)}`);
      cur = from;
    }
  } catch {
    // cycles — no critical path
  }

  // Node declarations
  for (const s of sprints) {
    const id = nodeId(s.path);
    const label = nodeLabel(s);
    lines.push(`  ${id}["${label}"]`);
  }

  // Edges
  for (const s of sprints) {
    for (const dep of s.depends_on || []) {
      if (!byPath.has(dep)) continue;
      const edgeKey = `${nodeId(dep)}-->${nodeId(s.path)}`;
      if (criticalEdges.has(edgeKey)) {
        lines.push(`  ${nodeId(dep)} ==> ${nodeId(s.path)}`);
      } else {
        lines.push(`  ${nodeId(dep)} --> ${nodeId(s.path)}`);
      }
    }
  }

  // Apply classes
  for (const s of sprints) {
    const id = nodeId(s.path);
    if (cycleSet.length > 0 && cycleSet.has(s.path)) {
      lines.push(`  class ${id} conflict`);
    } else {
      const status = s.status || "unknown";
      const cls =
        status === "done"
          ? "done"
          : status === "compiled"
            ? "compiled"
            : status === "active"
              ? "active"
              : status === "blocked"
                ? "blocked"
                : "notstarted";
      lines.push(`  class ${id} ${cls}`);
    }
  }

  return lines.join("\n");
}

export function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}
