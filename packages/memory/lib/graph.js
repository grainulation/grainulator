/**
 * graph.js — Cross-sprint knowledge graph index
 *
 * Builds an in-memory graph linking claims across sprints and packs
 * by topic, tags, conflicts, and content similarity. Enables discovery
 * of related knowledge across the entire silo.
 *
 * Zero npm dependencies — uses only built-in Node.js modules.
 */

import { Store } from "./store.js";
import { Packs } from "./packs.js";

export class Graph {
  constructor(store) {
    this.store = store || new Store();
    this.packs = new Packs(this.store);
    this._nodes = new Map(); // claimKey -> node
    this._edges = []; // { source, target, relation, weight }
    this._topicIndex = new Map(); // topic -> [claimKey]
    this._tagIndex = new Map(); // tag -> [claimKey]
    this._built = false;
  }

  /**
   * Build the knowledge graph from all stored collections and packs.
   * Call this before querying.
   */
  build() {
    this._nodes.clear();
    this._edges = [];
    this._topicIndex.clear();
    this._tagIndex.clear();

    // Index stored collections
    const collections = this.store.list();
    for (const col of collections) {
      const data = this.store.getClaims(col.id);
      if (!data || !data.claims) continue;
      this._indexClaims(data.claims, col.id, "collection");
    }

    // Index built-in and local packs
    const allPacks = this.packs.list();
    for (const p of allPacks) {
      const pack = this.packs.get(p.id);
      if (!pack || !pack.claims) continue;
      this._indexClaims(pack.claims, p.id, "pack");
    }

    // Build edges from shared topics
    for (const [, keys] of this._topicIndex) {
      if (keys.length < 2) continue;
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          this._addEdge(keys[i], keys[j], "same-topic", 1.0);
        }
      }
    }

    // Build edges from shared tags
    for (const [, keys] of this._tagIndex) {
      if (keys.length < 2) continue;
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < Math.min(keys.length, i + 50); j++) {
          this._addEdge(keys[i], keys[j], "shared-tag", 0.5);
        }
      }
    }

    // Build edges from explicit conflicts
    for (const [key, node] of this._nodes) {
      const conflicts = node.claim.conflicts_with || [];
      for (const conflictId of conflicts) {
        // Find the conflicting claim in same source
        const conflictKey = `${node.source}:${conflictId}`;
        if (this._nodes.has(conflictKey)) {
          this._addEdge(key, conflictKey, "conflict", 1.5);
        }
      }
    }

    this._built = true;
    return this.stats();
  }

  /** Get graph statistics. */
  stats() {
    const sources = new Set();
    for (const node of this._nodes.values()) {
      sources.add(node.source);
    }
    return {
      nodes: this._nodes.size,
      edges: this._edges.length,
      sources: sources.size,
      topics: this._topicIndex.size,
      tags: this._tagIndex.size,
    };
  }

  /**
   * Find claims related to a given claim by graph traversal.
   *
   * @param {string} claimId - Claim ID to find neighbors for
   * @param {object} opts
   * @param {number} opts.depth - Traversal depth (default: 1)
   * @param {number} opts.limit - Max results (default: 20)
   * @param {string} opts.relation - Filter by relation type
   * @returns {object[]} Related claims with relation info
   */
  related(claimId, opts = {}) {
    this._ensureBuilt();
    const { depth = 1, limit = 20, relation } = opts;

    // Find all node keys matching this claim ID
    const startKeys = [];
    for (const [key, node] of this._nodes) {
      if (node.claim.id === claimId || key === claimId) {
        startKeys.push(key);
      }
    }
    if (startKeys.length === 0) return [];

    // BFS traversal
    const visited = new Set(startKeys);
    let frontier = new Set(startKeys);
    const results = [];

    for (let d = 0; d < depth; d++) {
      const nextFrontier = new Set();
      for (const edge of this._edges) {
        if (relation && edge.relation !== relation) continue;

        let neighbor = null;
        if (frontier.has(edge.source) && !visited.has(edge.target)) {
          neighbor = edge.target;
        } else if (frontier.has(edge.target) && !visited.has(edge.source)) {
          neighbor = edge.source;
        }

        if (neighbor) {
          visited.add(neighbor);
          nextFrontier.add(neighbor);
          const node = this._nodes.get(neighbor);
          results.push({
            claim: node.claim,
            source: node.source,
            sourceType: node.sourceType,
            relation: edge.relation,
            weight: edge.weight,
            depth: d + 1,
          });
        }
      }
      frontier = nextFrontier;
    }

    results.sort((a, b) => b.weight - a.weight);
    return results.slice(0, limit);
  }

  /**
   * Find all claims for a topic across all sources.
   *
   * @param {string} topic - Topic string (case-insensitive)
   * @param {number} limit - Max results
   * @returns {object[]}
   */
  byTopic(topic, limit = 50) {
    this._ensureBuilt();
    const normalized = topic.toLowerCase().trim();
    const results = [];

    for (const [topicKey, keys] of this._topicIndex) {
      if (topicKey.includes(normalized) || normalized.includes(topicKey)) {
        for (const key of keys) {
          const node = this._nodes.get(key);
          results.push({
            claim: node.claim,
            source: node.source,
            sourceType: node.sourceType,
            topic: topicKey,
          });
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Find all claims with a given tag across all sources.
   *
   * @param {string} tag - Tag string
   * @param {number} limit - Max results
   * @returns {object[]}
   */
  byTag(tag, limit = 50) {
    this._ensureBuilt();
    const keys = this._tagIndex.get(tag.toLowerCase()) || [];
    return keys.slice(0, limit).map((key) => {
      const node = this._nodes.get(key);
      return {
        claim: node.claim,
        source: node.source,
        sourceType: node.sourceType,
      };
    });
  }

  /**
   * Find clusters of densely connected claims.
   * Returns groups of claims that share multiple connections.
   *
   * @param {number} minSize - Minimum cluster size (default: 3)
   * @returns {object[]} Array of { topic, claims, edgeCount }
   */
  clusters(minSize = 3) {
    this._ensureBuilt();
    const clusters = [];

    for (const [topic, keys] of this._topicIndex) {
      if (keys.length < minSize) continue;

      // Count internal edges
      const keySet = new Set(keys);
      let edgeCount = 0;
      for (const edge of this._edges) {
        if (keySet.has(edge.source) && keySet.has(edge.target)) {
          edgeCount++;
        }
      }

      const claims = keys.map((k) => {
        const n = this._nodes.get(k);
        return { claim: n.claim, source: n.source, sourceType: n.sourceType };
      });

      clusters.push({ topic, claims, claimCount: keys.length, edgeCount });
    }

    clusters.sort((a, b) => b.edgeCount - a.edgeCount);
    return clusters;
  }

  /**
   * Search for related prior art across all sprints and packs.
   * Combines text matching with graph traversal to find claims
   * relevant to a query, ranked by combined text + graph relevance.
   *
   * @param {string} query - Free-text search query
   * @param {object} opts
   * @param {number} opts.limit - Max results (default: 20)
   * @param {string} opts.type - Filter by claim type
   * @param {string} opts.sourceType - Filter by source type ('collection' or 'pack')
   * @returns {object[]} Ranked results with claim, source, score, and relations
   */
  search(query, opts = {}) {
    this._ensureBuilt();
    const { limit = 20, type, sourceType } = opts;
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    if (tokens.length === 0) return [];

    const scored = new Map(); // claimKey -> { node, textScore, graphScore }

    // Phase 1: Text matching across all nodes
    for (const [key, node] of this._nodes) {
      if (type && node.claim.type !== type) continue;
      if (sourceType && node.sourceType !== sourceType) continue;

      const searchable = [
        node.claim.topic || "",
        node.claim.content || "",
        (node.claim.tags || []).join(" "),
        node.source,
      ]
        .join(" ")
        .toLowerCase();

      let textScore = 0;
      for (const token of tokens) {
        if (searchable.includes(token)) {
          textScore += 1;
          // Bonus for topic match
          if ((node.claim.topic || "").toLowerCase().includes(token)) {
            textScore += 0.5;
          }
          // Bonus for tag match
          if (
            (node.claim.tags || []).some((t) => t.toLowerCase().includes(token))
          ) {
            textScore += 0.3;
          }
        }
      }

      if (textScore > 0) {
        scored.set(key, { node, textScore, graphScore: 0 });
      }
    }

    // Phase 2: Graph boost — text matches with many graph connections score higher
    for (const [key, entry] of scored) {
      let graphScore = 0;
      for (const edge of this._edges) {
        if (edge.source === key || edge.target === key) {
          const neighborKey = edge.source === key ? edge.target : edge.source;
          // Boost if neighbor also matched text search
          if (scored.has(neighborKey)) {
            graphScore += edge.weight * 0.5;
          } else {
            graphScore += edge.weight * 0.1;
          }
        }
      }
      entry.graphScore = graphScore;
    }

    // Combine and rank
    const results = [];
    for (const [_key, entry] of scored) {
      const combinedScore = entry.textScore + entry.graphScore;
      results.push({
        claim: entry.node.claim,
        source: entry.node.source,
        sourceType: entry.node.sourceType,
        score: Math.round(combinedScore * 100) / 100,
        textScore: Math.round(entry.textScore * 100) / 100,
        graphScore: Math.round(entry.graphScore * 100) / 100,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Export the graph as a portable JSON structure.
   */
  toJSON() {
    this._ensureBuilt();
    const nodes = [];
    for (const [key, node] of this._nodes) {
      nodes.push({
        key,
        id: node.claim.id,
        type: node.claim.type,
        topic: node.claim.topic,
        source: node.source,
        sourceType: node.sourceType,
        tags: node.claim.tags || [],
      });
    }
    return {
      nodes,
      edges: this._edges,
      stats: this.stats(),
      builtAt: new Date().toISOString(),
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _indexClaims(claims, source, sourceType) {
    for (const claim of claims) {
      const key = `${source}:${claim.id || ""}`;
      if (this._nodes.has(key)) continue;

      this._nodes.set(key, { claim, source, sourceType });

      // Index by topic
      if (claim.topic) {
        const topic = claim.topic.toLowerCase().trim();
        if (!this._topicIndex.has(topic)) this._topicIndex.set(topic, []);
        this._topicIndex.get(topic).push(key);
      }

      // Index by tags
      for (const tag of claim.tags || []) {
        const t = tag.toLowerCase();
        if (!this._tagIndex.has(t)) this._tagIndex.set(t, []);
        this._tagIndex.get(t).push(key);
      }
    }
  }

  _addEdge(source, target, relation, weight) {
    // Avoid duplicate edges
    const exists = this._edges.some(
      (e) =>
        (e.source === source &&
          e.target === target &&
          e.relation === relation) ||
        (e.source === target && e.target === source && e.relation === relation),
    );
    if (!exists) {
      this._edges.push({ source, target, relation, weight });
    }
  }

  _ensureBuilt() {
    if (!this._built) {
      this.build();
    }
  }
}
