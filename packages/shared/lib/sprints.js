/**
 * Sprint metadata helpers — complements detectSprints() with per-sprint
 * loaders that harvest, orchard, silo, and wheat all re-implement today.
 *
 * Usage (ESM):
 *   import { detectSprints } from "./index.js";
 *   import { loadSprintClaims, loadSprintCompilation, sprintSummary }
 *     from "./sprints.js";
 *
 * Returns null for missing/malformed files — consumers decide how to handle.
 */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";

/** Load claims.json for a sprint directory. Returns full object or null. */
export function loadSprintClaims(sprintDir) {
  const p = resolve(sprintDir, "claims.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/** Load compilation.json for a sprint directory. Returns full object or null. */
export function loadSprintCompilation(sprintDir) {
  const p = resolve(sprintDir, "compilation.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Quick summary for a sprint directory — the shape harvest/orchard typically
 * want: question, phase, active/total claim count, conflict count, last modified.
 *
 * Returns null if the sprint directory doesn't have claims.json.
 */
export function sprintSummary(sprintDir) {
  const claims = loadSprintClaims(sprintDir);
  if (!claims) return null;
  const meta = claims.meta || {};
  const list = Array.isArray(claims.claims) ? claims.claims : [];
  const compilation = loadSprintCompilation(sprintDir);
  const conflicts = compilation?.conflict_graph?.unresolved?.length ?? 0;

  let lastModified = null;
  try {
    lastModified = statSync(join(sprintDir, "claims.json")).mtimeMs;
  } catch {
    // no stat available
  }

  return {
    path: resolve(sprintDir),
    question: meta.question || "",
    phase: meta.phase || "unknown",
    audience: meta.audience || [],
    initiated: meta.initiated || null,
    claim_count: list.length,
    active_claims: list.filter((c) => c.status === "active").length,
    conflict_count: conflicts,
    compile_status: compilation?.status || null,
    certificate: compilation?.certificate || null,
    last_modified_ms: lastModified,
  };
}

/**
 * Map a list of sprint paths to their summaries, dropping any that fail to load.
 * Useful after detectSprints() when you want batch metadata for a dashboard.
 */
export function summarize(sprintDirs) {
  const out = [];
  for (const dir of sprintDirs) {
    const s = sprintSummary(dir);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Scan a directory two levels deep for every claims.json file — the shape
 * harvest + orchard dashboards need for cross-sprint listings. Returns an
 * array of `{ file, dir, name, cat }` where `cat` is one of:
 *   - "root"    — claims.json directly in targetDir
 *   - "archive" — a *.json file under targetDir/archive/
 *   - "active"  — claims.json in an immediate or grandchild subdirectory
 *
 * Skips hidden directories, node_modules, and the archive subdir (for
 * active scanning — archive is handled separately).
 */
export function findSprintFiles(targetDir) {
  const found = [];

  const direct = join(targetDir, "claims.json");
  if (existsSync(direct)) {
    found.push({
      file: direct,
      dir: targetDir,
      name: basename(targetDir),
      cat: "root",
    });
  }

  const archiveDir = join(targetDir, "archive");
  try {
    if (existsSync(archiveDir) && statSync(archiveDir).isDirectory()) {
      for (const f of readdirSync(archiveDir)) {
        if (f.endsWith(".json") && f.includes("claims")) {
          found.push({
            file: join(archiveDir, f),
            dir: archiveDir,
            name: f.replace(".json", "").replace(/-/g, " "),
            cat: "archive",
          });
        }
      }
    }
  } catch {
    // archive not readable — skip
  }

  try {
    const entries = readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name.startsWith(".") ||
        entry.name === "archive" ||
        entry.name === "node_modules"
      ) {
        continue;
      }
      const childDir = join(targetDir, entry.name);
      const childClaims = join(childDir, "claims.json");
      if (existsSync(childClaims)) {
        found.push({
          file: childClaims,
          dir: childDir,
          name: entry.name,
          cat: "active",
        });
      }
      // Second level: targetDir/entry/sub/claims.json
      try {
        const subs = readdirSync(childDir, { withFileTypes: true });
        for (const sub of subs) {
          if (!sub.isDirectory()) continue;
          if (sub.name.startsWith(".")) continue;
          const subDir = join(childDir, sub.name);
          const subClaims = join(subDir, "claims.json");
          if (existsSync(subClaims)) {
            found.push({
              file: subClaims,
              dir: subDir,
              name: sub.name,
              cat: "active",
            });
          }
        }
      } catch {
        // child dir not readable — skip
      }
    }
  } catch {
    // targetDir not readable — return what we have
  }

  return found;
}
