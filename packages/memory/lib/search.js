/**
 * search.js — Full-text search across stored claims
 *
 * Simple but effective: tokenize query, scan all claim files,
 * rank by term frequency. No external deps.
 */

import fs from "node:fs";
import path from "node:path";
import { Store } from "./store.js";

export class Search {
  constructor(store) {
    this.store = store || new Store();
  }

  /**
   * Search across all stored claims.
   * Returns matches sorted by relevance (highest first).
   *
   * @param {string} query - Search terms (space-separated, OR logic)
   * @param {object} opts
   * @param {string} opts.type - Filter by claim type (constraint, risk, etc.)
   * @param {string} opts.evidence - Filter by evidence tier (also accepts legacy 'tier')
   * @param {number} opts.limit - Max results (default 20)
   */
  query(query, opts = {}) {
    const { type, evidence, tier, limit = 20 } = opts;
    const evidenceFilter = evidence || tier; // support legacy 'tier' option
    const tokens = this._tokenize(query);
    if (tokens.length === 0) return [];

    const results = [];
    const claimsDir = this.store.claimsDir;

    if (!fs.existsSync(claimsDir)) return [];

    const files = fs.readdirSync(claimsDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(claimsDir, file);
      let data;
      try {
        data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {
        continue;
      }

      const collectionName = data.meta?.name || file.replace(".json", "");
      const claims = data.claims || [];

      for (const claim of claims) {
        // Apply filters
        if (type && claim.type !== type) continue;
        const claimEvidence = claim.evidence || claim.tier;
        if (evidenceFilter && claimEvidence !== evidenceFilter) continue;

        // Score by token matches across searchable fields (support both content and legacy text)
        const sourceStr =
          typeof claim.source === "object"
            ? [claim.source?.origin, claim.source?.artifact]
                .filter(Boolean)
                .join(" ")
            : claim.source || "";
        const searchable = [
          claim.content || claim.text || "",
          claim.type || "",
          claim.tags?.join(" ") || "",
          sourceStr,
          collectionName,
        ]
          .join(" ")
          .toLowerCase();

        let score = 0;
        for (const token of tokens) {
          const idx = searchable.indexOf(token);
          if (idx !== -1) {
            score += 1;
            // Bonus for exact word match
            if (
              searchable.includes(` ${token} `) ||
              searchable.startsWith(`${token} `)
            ) {
              score += 0.5;
            }
          }
        }

        if (score > 0) {
          results.push({
            claim,
            collection: collectionName,
            score,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** List all unique tags across stored claims. */
  tags() {
    const tagSet = new Set();
    const claimsDir = this.store.claimsDir;
    if (!fs.existsSync(claimsDir)) return [];

    const files = fs.readdirSync(claimsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(claimsDir, file), "utf-8"),
        );
        for (const claim of data.claims || []) {
          for (const tag of claim.tags || []) {
            tagSet.add(tag);
          }
        }
      } catch {
        // skip malformed files
      }
    }
    return [...tagSet].sort();
  }

  _tokenize(str) {
    return str
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}
