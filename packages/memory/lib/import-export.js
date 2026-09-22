import { htmlText } from "../../shared/lib/html.cjs";
import { withFileTransaction } from "../../shared/lib/transaction.js";
import { atomicWriteJSON } from "../../shared/lib/atomic.js";
/**
 * import-export.js — Pull claims between sprints and silos
 *
 * Handles the core workflow: take claims from a silo collection
 * (or built-in pack) and merge them into a sprint's claims.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VALID_TYPES = [
  "constraint",
  "factual",
  "estimate",
  "risk",
  "recommendation",
  "feedback",
];
export const VALID_EVIDENCE = [
  "stated",
  "web",
  "documented",
  "tested",
  "production",
];

/**
 * Normalize a claim to wheat's canonical schema.
 * Handles legacy fields: tier -> evidence, text -> content.
 * Fills in missing required fields with sensible defaults.
 * Validates enums, sanitizes content, and ensures provenance.
 */
export function normalizeClaim(claim) {
  const normalized = { ...claim };

  // Map legacy field names to wheat-canonical names
  if ("tier" in normalized && !("evidence" in normalized)) {
    normalized.evidence = normalized.tier;
  }
  delete normalized.tier;

  if ("text" in normalized && !("content" in normalized)) {
    normalized.content = normalized.text;
  }
  delete normalized.text;

  // Ensure all required wheat fields exist
  normalized.id = normalized.id || null;
  normalized.type = normalized.type || "factual";
  normalized.topic = normalized.topic || "";
  normalized.content = normalized.content || "";
  normalized.evidence = normalized.evidence || "stated";
  normalized.status = normalized.status || "active";
  normalized.phase_added = normalized.phase_added || "import";
  normalized.timestamp = normalized.timestamp || new Date().toISOString();
  normalized.conflicts_with = normalized.conflicts_with || [];
  normalized.resolved_by = normalized.resolved_by || null;
  normalized.tags = normalized.tags || [];

  // Enum validation: clamp type to allowed set
  if (!VALID_TYPES.includes(normalized.type)) {
    normalized.type = "factual";
  }

  // Enum validation: clamp evidence to allowed set
  if (!VALID_EVIDENCE.includes(normalized.evidence)) {
    normalized.evidence = "stated";
  }

  // Extract plain text; rendering consumers still escape for their context.
  if (typeof normalized.content === "string") {
    normalized.content = htmlText(normalized.content);
  }

  // Normalize source to object form
  if (!normalized.source || typeof normalized.source === "string") {
    normalized.source = {
      origin:
        typeof normalized.source === "string"
          ? normalized.source
          : "silo-import",
      artifact: null,
      connector: null,
    };
  }

  // Ensure provenance: if source.origin is missing, set default
  if (!normalized.source.origin) {
    normalized.source.origin = "silo-import";
  }

  return normalized;
}

export class ImportExport {
  constructor(store) {
    this.store = store || new Store();
  }

  /**
   * Pull claims from a silo collection into a target claims file.
   * New claims get re-prefixed to avoid ID collisions.
   *
   * @param {string} source - Collection name/id or built-in pack name
   * @param {string} targetPath - Path to claims.json to merge into
   * @param {object} opts
   * @param {string} opts.prefix - Claim ID prefix for imported claims (default: 'imp')
   * @param {string[]} opts.types - Only import these claim types
   * @param {string[]} opts.ids - Only import claims with these original IDs
   * @param {boolean} opts.dryRun - If true, return what would be imported without writing
   */
  pull(source, targetPath, opts = {}) {
    return withFileTransaction(targetPath, () => this._pullLocked(source, targetPath, opts));
  }

  mergeClaims(claims, targetPath, opts = {}) {
    return withFileTransaction(targetPath, () => this._pullLocked(opts.source || "external", targetPath, opts, claims));
  }

  _pullLocked(source, targetPath, opts = {}, providedClaims) {
    const { prefix = "imp", types, ids, dryRun = false } = opts;

    // Resolve source: try silo store first, then built-in packs
    let sourceClaims = providedClaims || this._resolveSource(source);
    if (!sourceClaims) {
      throw new Error(`Collection or pack "${source}" not found`);
    }

    // Normalize all claims to wheat schema
    sourceClaims = sourceClaims.map(normalizeClaim);

    // Filter by specific claim IDs if requested
    if (ids && ids.length > 0) {
      const idSet = new Set(ids);
      sourceClaims = sourceClaims.filter((c) => idSet.has(c.id));
    }

    // Filter by type if requested
    if (types && types.length > 0) {
      sourceClaims = sourceClaims.filter((c) => types.includes(c.type));
    }

    // Re-prefix claim IDs
    const imported = sourceClaims.map((claim, i) => ({
      ...claim,
      id: `${prefix}${String(i + 1).padStart(3, "0")}`,
      importedFrom: source,
      importedAt: new Date().toISOString(),
    }));

    if (dryRun) {
      return { wouldImport: imported.length, claims: imported };
    }

    // Preserve the full sprint envelope; imports must not discard its metadata.
    const document = fs.existsSync(targetPath)
      ? JSON.parse(fs.readFileSync(targetPath, "utf-8")) : [];
    if (!Array.isArray(document) && (!document || !Array.isArray(document.claims))) {
      throw new Error("Target must be a claims array or a sprint containing a claims array");
    }
    const existing = Array.isArray(document) ? document : document.claims;
    const existingTexts = new Set(existing.map(c => (c.content || c.text || "").toLowerCase()));
    const usedIds = new Set(existing.map(c => c.id));
    const idMap = new Map();
    const deduped = [];
    let next = 1;
    for (const claim of imported) {
      const text = (claim.content || "").toLowerCase();
      if (existingTexts.has(text)) continue;
      existingTexts.add(text);
      let id;
      do { id = `${prefix}${String(next++).padStart(3, "0")}`; } while (usedIds.has(id));
      usedIds.add(id);
      idMap.set(sourceClaims[imported.indexOf(claim)].id, id);
      deduped.push({ ...claim, id });
    }
    for (const claim of deduped) {
      claim.conflicts_with = (claim.conflicts_with || []).map(id => idMap.get(id)).filter(Boolean);
      claim.resolved_by = idMap.get(claim.resolved_by) || null;
    }
    const merged = [...existing, ...deduped];
    const output = Array.isArray(document) ? merged : { ...document, claims: merged };
    atomicWriteJSON(targetPath, output);

    return {
      imported: deduped.length,
      skippedDuplicates: imported.length - deduped.length,
      totalClaims: merged.length,
    };
  }

  /**
   * Export claims from a sprint's claims.json into the silo.
   *
   * @param {string} sourcePath - Path to claims.json
   * @param {string} name - Name for the stored collection
   * @param {object} meta - Additional metadata
   */
  push(sourcePath, name, meta = {}) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Claims file not found: ${sourcePath}`);
    }

    const raw = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
    const claims = Array.isArray(raw) ? raw : raw.claims || [];

    return this.store.storeClaims(name, claims, meta);
  }

  /** Resolve a source name to an array of claims. */
  _resolveSource(source) {
    // Try silo store
    const stored = this.store.getClaims(source);
    if (stored) return stored.claims;

    // Try built-in packs
    const packPath = path.join(__dirname, "..", "packs", `${source}.json`);
    if (fs.existsSync(packPath)) {
      const pack = JSON.parse(fs.readFileSync(packPath, "utf-8"));
      return pack.claims || [];
    }

    return null;
  }
}
