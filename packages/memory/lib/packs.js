/**
 * packs.js — Knowledge pack bundling
 *
 * Packs are versioned bundles of claims + templates that teams can
 * publish and subscribe to. A pack is a directory or JSON file with
 * a manifest, claims, and optional templates.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILT_IN_PACKS_DIR = path.join(__dirname, "..", "packs");

export class Packs {
  constructor(store) {
    this.store = store || new Store();
  }

  /** List all available packs (built-in + locally installed). */
  list() {
    const packs = [];

    // Built-in packs
    if (fs.existsSync(BUILT_IN_PACKS_DIR)) {
      for (const file of fs.readdirSync(BUILT_IN_PACKS_DIR)) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = JSON.parse(
            fs.readFileSync(path.join(BUILT_IN_PACKS_DIR, file), "utf-8"),
          );
          packs.push({
            id: file.replace(".json", ""),
            name: data.name,
            description: data.description,
            claimCount: (data.claims || []).length,
            version: data.version || "1.0.0",
            source: "built-in",
          });
        } catch {
          // skip malformed
        }
      }
    }

    // Locally installed packs
    const localDir = this.store.packsDir;
    if (fs.existsSync(localDir)) {
      for (const file of fs.readdirSync(localDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = JSON.parse(
            fs.readFileSync(path.join(localDir, file), "utf-8"),
          );
          packs.push({
            id: file.replace(".json", ""),
            name: data.name,
            description: data.description,
            claimCount: (data.claims || []).length,
            version: data.version || "1.0.0",
            source: "local",
          });
        } catch {
          // skip malformed
        }
      }
    }

    return packs;
  }

  /** Get a pack by ID (checks built-in first, then local). */
  get(id) {
    const builtIn = path.join(BUILT_IN_PACKS_DIR, `${id}.json`);
    if (fs.existsSync(builtIn)) {
      return JSON.parse(fs.readFileSync(builtIn, "utf-8"));
    }

    const local = path.join(this.store.packsDir, `${id}.json`);
    if (fs.existsSync(local)) {
      return JSON.parse(fs.readFileSync(local, "utf-8"));
    }

    return null;
  }

  /**
   * Bundle claims from the silo into a publishable pack.
   *
   * @param {string} name - Pack name
   * @param {string[]} collectionIds - Claim collection IDs to include
   * @param {object} meta - Pack metadata (description, version, author)
   */
  bundle(name, collectionIds, meta = {}) {
    this.store.init();
    const allClaims = [];

    for (const id of collectionIds) {
      const data = this.store.getClaims(id);
      if (data) {
        allClaims.push(...(data.claims || []));
      }
    }

    const pack = {
      name,
      description: meta.description || "",
      version: meta.version || "1.0.0",
      author: meta.author || "",
      createdAt: new Date().toISOString(),
      hash: crypto
        .createHash("sha256")
        .update(JSON.stringify(allClaims))
        .digest("hex"),
      sources: collectionIds,
      claims: allClaims,
    };

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const packPath = path.join(this.store.packsDir, `${slug}.json`);
    const tmp = packPath + ".tmp." + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(pack, null, 2) + "\n", "utf-8");
    fs.renameSync(tmp, packPath);

    return { id: slug, path: packPath, claimCount: allClaims.length };
  }

  /**
   * Install a pack from a file path into the local silo.
   *
   * @param {string} filePath - Path to the pack JSON file
   */
  install(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Pack file not found: ${filePath}`);
    }

    const pack = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Validate pack name against path traversal
    const rawName = pack.name || path.basename(filePath, ".json");
    if (
      /[/\\]/.test(rawName) ||
      rawName.includes("..") ||
      rawName.startsWith(".")
    ) {
      throw new Error(
        `Invalid pack name "${rawName}": must not contain /, \\, .., or start with .`,
      );
    }

    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Verify pack integrity if hash present
    if (pack.hash && pack.claims) {
      const actual = crypto
        .createHash("sha256")
        .update(JSON.stringify(pack.claims))
        .digest("hex");
      // Support both old 12-char and new 64-char hashes
      if (pack.hash !== actual && !actual.startsWith(pack.hash)) {
        if (!options.force) {
          throw new Error(
            `Pack integrity check failed: hash mismatch. Use --force to install anyway.`,
          );
        }
      }
    }

    this.store.init();
    const dest = path.join(this.store.packsDir, `${slug}.json`);

    // Version comparison if pack already exists
    if (fs.existsSync(dest) && !options.force) {
      const existing = JSON.parse(fs.readFileSync(dest, "utf-8"));
      const cmp = _compareSemver(
        pack.version || "0.0.0",
        existing.version || "0.0.0",
      );
      if (cmp === 0) {
        return {
          id: slug,
          claimCount: (pack.claims || []).length,
          skipped: true,
          reason: "same version",
        };
      }
      if (cmp < 0) {
        return {
          id: slug,
          claimCount: (pack.claims || []).length,
          skipped: true,
          reason: `downgrade (${existing.version} → ${pack.version}). Use --force to override.`,
        };
      }
    }

    fs.copyFileSync(filePath, dest);
    return { id: slug, claimCount: (pack.claims || []).length };
  }
}

/** Compare two semver strings. Returns -1, 0, or 1. */
export function _compareSemver(a, b) {
  const pa = (a || "0.0.0").split(".").map(Number);
  const pb = (b || "0.0.0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
