/**
 * mill format: dot
 *
 * Converts compilation.json claims to Graphviz DOT format.
 * Claims grouped into type-based subgraph clusters, tag edges as dashed lines.
 * Zero dependencies — node built-in only.
 */

export const name = "dot";
export const extension = ".dot";
export const mimeType = "text/vnd.graphviz; charset=utf-8";
export const description =
  "Claims as Graphviz DOT graph (type clusters, tag edges)";

const TYPE_COLORS = {
  constraint: { border: "#f87171", fill: "#2d1f1f", label: "Constraints" },
  factual: { border: "#60a5fa", fill: "#1f2937", label: "Factual" },
  estimate: { border: "#a78bfa", fill: "#1f1f2d", label: "Estimates" },
  risk: { border: "#fb923c", fill: "#2d2517", label: "Risks" },
  recommendation: {
    border: "#34d399",
    fill: "#172d1f",
    label: "Recommendations",
  },
  feedback: { border: "#fbbf24", fill: "#2d2a17", label: "Feedback" },
};

const DEFAULT_COLOR = { border: "#9ca3af", fill: "#1f1f1f", label: "Other" };

/**
 * Convert a compilation object to DOT format.
 * @param {object} compilation - The compilation.json content
 * @returns {string} DOT output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];
  const sprintName = compilation.meta?.sprint || "sprint";

  const lines = [];
  lines.push(`digraph ${escId(sprintName)} {`);
  lines.push("  rankdir=LR;");
  lines.push(
    '  node [shape=box, style=filled, fontname="monospace", fontsize=10];',
  );
  lines.push('  edge [fontname="monospace", fontsize=8];');
  lines.push("");

  // Group claims by type
  const groups = {};
  for (const claim of claims) {
    const t = claim.type || "other";
    if (!groups[t]) groups[t] = [];
    groups[t].push(claim);
  }

  // Type clusters
  for (const [type, group] of Object.entries(groups)) {
    const colors = TYPE_COLORS[type] || DEFAULT_COLOR;
    lines.push(`  subgraph cluster_${escId(type)} {`);
    lines.push(`    label="${escDot(colors.label || type)}";`);
    lines.push(`    color="${colors.border}";`);
    lines.push(`    style=dashed;`);
    lines.push("");

    for (const claim of group) {
      const id = escId(claim.id || "");
      const content = claim.content || claim.text || "";
      const label = truncate(content, 40);
      lines.push(
        `    ${id} [label="${escDot(claim.id + "\\n" + label)}" fillcolor="${colors.fill}"];`,
      );
    }

    lines.push("  }");
    lines.push("");
  }

  // Tag edges
  const edges = buildTagEdges(claims);
  if (edges.length > 0) {
    lines.push("  // Tag edges");
    for (const edge of edges) {
      lines.push(
        `  ${escId(edge.source)} -> ${escId(edge.target)} [label="${escDot("tag: " + edge.tag)}" style=dashed];`,
      );
    }
    lines.push("");
  }

  lines.push("}");

  return lines.join("\n") + "\n";
}

function buildTagEdges(claims) {
  const tagMap = {};

  for (const claim of claims) {
    const tags = Array.isArray(claim.tags) ? claim.tags : [];
    for (const tag of tags) {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(claim.id || "");
    }
  }

  const edges = [];
  const seen = new Set();

  for (const [tag, ids] of Object.entries(tagMap)) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}--${ids[j]}--${tag}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ source: ids[i], target: ids[j], tag });
        }
      }
    }
  }

  return edges;
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

function escId(str) {
  // DOT identifiers: replace non-alphanumeric with underscores
  return String(str).replace(/[^a-zA-Z0-9_]/g, "_");
}

function escDot(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}
