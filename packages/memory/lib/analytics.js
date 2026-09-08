/**
 * silo -> harvest edge: cross-library analytics.
 *
 * Feeds silo's stored claim collections to harvest's analyzer
 * to surface patterns, evidence quality trends, and type distribution
 * across the entire knowledge base. Graceful fallback if harvest
 * is not available.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HARVEST_SIBLINGS = [
  path.join(__dirname, "..", "..", "analytics"),
  path.join(__dirname, "..", "..", "harvest"),
  path.join(__dirname, "..", "..", "..", "harvest"),
];

/**
 * Try to load harvest's analyzer module from a sibling checkout.
 * Returns the analyze function or null.
 */
export async function loadHarvestAnalyzer() {
  for (const dir of HARVEST_SIBLINGS) {
    const analyzerPath = path.join(dir, "lib", "analyzer.js");
    if (fs.existsSync(analyzerPath)) {
      try {
        const mod = await import(pathToFileURL(analyzerPath).href);
        if (typeof mod.analyze === "function") return mod.analyze;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Run cross-library analytics on all stored claim collections.
 * @param {import('./store').Store} store — an initialized silo Store instance
 * @returns {Promise<{ available: boolean, analysis?: object, collectionCount?: number }>}
 */
export async function analyzeLibrary(store) {
  const analyze = await loadHarvestAnalyzer();
  if (!analyze) {
    return {
      available: false,
      reason: "bundled analytics component not found",
    };
  }

  const collections = store.list();
  if (collections.length === 0) {
    return {
      available: true,
      analysis: null,
      collectionCount: 0,
      reason: "no collections stored",
    };
  }

  // Convert silo collections into the sprint format harvest expects
  const sprints = [];
  for (const entry of collections) {
    const data = store.getClaims(entry.id);
    if (!data || !data.claims) continue;
    sprints.push({
      name: entry.name || entry.id,
      claims: data.claims,
    });
  }

  if (sprints.length === 0) {
    return {
      available: true,
      analysis: null,
      collectionCount: 0,
      reason: "no valid claim data",
    };
  }

  const analysis = analyze(sprints);
  return {
    available: true,
    collectionCount: sprints.length,
    analysis,
  };
}
