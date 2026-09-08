/**
 * mill format: graphml
 *
 * Converts compilation.json claims to GraphML XML.
 * Claims become nodes, shared-tag relationships become edges.
 * Zero dependencies — node built-in only.
 */

export const name = "graphml";
export const extension = ".graphml";
export const mimeType = "application/graphml+xml; charset=utf-8";
export const description =
  "Claims as GraphML graph (nodes per claim, edges for shared tags)";

/**
 * Convert a compilation object to GraphML XML.
 * @param {object} compilation - The compilation.json content
 * @returns {string} GraphML XML output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];

  const lines = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<graphml xmlns="http://graphml.graphstruct.org/graphml">');
  lines.push(
    '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
  );
  lines.push(
    '  <key id="evidence" for="node" attr.name="evidence" attr.type="string"/>',
  );
  lines.push(
    '  <key id="content" for="node" attr.name="content" attr.type="string"/>',
  );
  lines.push(
    '  <key id="status" for="node" attr.name="status" attr.type="string"/>',
  );
  lines.push(
    '  <key id="confidence" for="node" attr.name="confidence" attr.type="double"/>',
  );
  lines.push('  <key id="tag" for="edge" attr.name="tag" attr.type="string"/>');
  lines.push('  <graph id="G" edgedefault="undirected">');

  // Nodes
  for (const claim of claims) {
    const id = esc(claim.id || "");
    const type = esc(claim.type || "");
    const evidence = esc(getEvidence(claim));
    const content = esc(claim.content || claim.text || "");
    const status = esc(claim.status || "");
    const confidence = claim.confidence != null ? claim.confidence : "";

    lines.push(`    <node id="${id}">`);
    lines.push(`      <data key="type">${type}</data>`);
    lines.push(`      <data key="evidence">${evidence}</data>`);
    lines.push(`      <data key="content">${content}</data>`);
    lines.push(`      <data key="status">${status}</data>`);
    if (confidence !== "") {
      lines.push(`      <data key="confidence">${confidence}</data>`);
    }
    lines.push("    </node>");
  }

  // Edges: connect claims that share at least one tag
  const edges = buildTagEdges(claims);
  let edgeId = 0;
  for (const edge of edges) {
    edgeId++;
    lines.push(
      `    <edge id="e${edgeId}" source="${esc(edge.source)}" target="${esc(edge.target)}">`,
    );
    lines.push(`      <data key="tag">${esc(edge.tag)}</data>`);
    lines.push("    </edge>");
  }

  lines.push("  </graph>");
  lines.push("</graphml>");

  return lines.join("\n") + "\n";
}

/**
 * Build edges between claims that share tags.
 * One edge per shared tag per pair (deduplicated by pair+tag).
 */
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

function getEvidence(claim) {
  if (typeof claim.evidence === "string") return claim.evidence;
  if (typeof claim.evidence === "object" && claim.evidence !== null) {
    return claim.evidence.tier || claim.evidence_tier || "";
  }
  return claim.evidence_tier || "";
}

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
