#!/usr/bin/env node
/**
 * generate-manifest.js — Build wheat-manifest.json topic map
 *
 * Reads claims.json, compilation.json, and scans the repo directory structure
 * to produce a topic-map manifest. Zero npm dependencies.
 *
 * Usage:
 *   barn generate-manifest                        # Write wheat-manifest.json
 *   barn generate-manifest --root /path            # Target a specific repo
 *   barn generate-manifest --out custom-name.json  # Custom output path
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, relative, resolve, basename, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectSprints } from "./detect-sprints.js";

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const ROOT = arg("root", process.cwd());
const OUT_PATH = join(ROOT, arg("out", "wheat-manifest.json"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadJSON(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Recursively list files under dir, returning paths relative to rootDir. */
function walk(dir, filter, rootDir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const base = rootDir || dir;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      results.push(...walk(full, filter, base));
    } else {
      const rel = relative(base, full).split(sep).join("/");
      if (!filter || filter(rel, entry.name)) results.push(rel);
    }
  }
  return results;
}

/** Determine file type from its path. */
function classifyFile(relPath) {
  if (relPath.startsWith("prototypes/")) return "prototype";
  if (relPath.startsWith("research/")) return "research";
  if (relPath.startsWith("output/")) return "output";
  if (relPath.startsWith("evidence/")) return "evidence";
  if (relPath.startsWith("templates/")) return "template";
  if (relPath.startsWith("examples/")) return "example";
  if (relPath.startsWith("test/")) return "test";
  if (relPath.startsWith("docs/")) return "docs";
  if (relPath.endsWith(".json")) return "config";
  if (relPath.endsWith(".js") || relPath.endsWith(".mjs")) return "script";
  if (relPath.endsWith(".md")) return "docs";
  return "other";
}

/** Compute highest evidence tier from a list of claims. */
function highestEvidence(claims) {
  const tiers = ["stated", "web", "documented", "tested", "production"];
  let max = 0;
  for (const c of claims) {
    const idx = tiers.indexOf(c.evidence);
    if (idx > max) max = idx;
  }
  return tiers[max];
}

// ─── Exported function ───────────────────────────────────────────────────────

/**
 * Generate a wheat-manifest object from a claims.json path.
 *
 * @param {string} claimsPath — absolute path to claims.json
 * @param {object} [opts] — optional overrides
 * @param {string} [opts.root] — repo root directory (defaults to dirname of claimsPath)
 * @returns {object} — the manifest object (not written to disk)
 */
export function generateManifest(claimsPath, opts = {}) {
  const root = opts.root || join(claimsPath, "..");
  const claims = loadJSON(claimsPath);
  if (!claims) {
    throw new Error(`claims.json not found or invalid at ${claimsPath}`);
  }

  const compilationPath = join(root, "compilation.json");
  const compilation = loadJSON(compilationPath);

  // 1. Build topic map from claims
  const topicMap = {};
  for (const claim of claims.claims) {
    const topic = claim.topic;
    if (!topicMap[topic]) {
      topicMap[topic] = {
        claims: [],
        files: new Set(),
        sprint: "current",
        evidence_level: "stated",
      };
    }
    topicMap[topic].claims.push(claim.id);
  }

  for (const topic of Object.keys(topicMap)) {
    const topicClaims = claims.claims.filter((c) => c.topic === topic);
    topicMap[topic].evidence_level = highestEvidence(topicClaims);
  }

  // 2. Scan directories for files
  const scanDirs = [
    "research",
    "prototypes",
    "output",
    "evidence",
    "templates",
    "test",
    "docs",
  ];
  const allFiles = {};

  for (const dir of scanDirs) {
    const files = walk(join(root, dir), null, root);
    for (const f of files) {
      allFiles[f] = { topics: [], type: classifyFile(f) };
    }
  }

  // Root-level scripts/configs
  try {
    for (const entry of readdirSync(root)) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const full = join(root, entry);
      try {
        if (statSync(full).isFile()) {
          const type = classifyFile(entry);
          if (type !== "other") {
            allFiles[entry] = { topics: [], type };
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }

  // 3. Map files to topics via claim artifacts
  for (const [filePath, fileInfo] of Object.entries(allFiles)) {
    for (const claim of claims.claims) {
      if (
        claim.source?.artifact &&
        filePath.includes(
          claim.source.artifact.replace(
            /^.*[/\\]prototypes[/\\]/,
            "prototypes/",
          ),
        )
      ) {
        if (!fileInfo.topics.includes(claim.topic)) {
          fileInfo.topics.push(claim.topic);
        }
      }
    }

    for (const topic of fileInfo.topics) {
      if (topicMap[topic]) {
        topicMap[topic].files.add(filePath);
      }
    }
  }

  // 4. Convert Sets to arrays
  for (const topic of Object.keys(topicMap)) {
    topicMap[topic].files = [...topicMap[topic].files].sort();
  }

  // 5. Detect sprints
  const sprintResult = detectSprints(root);
  const sprints = {};
  for (const s of sprintResult.sprints || []) {
    sprints[s.name] = {
      question: s.question || "",
      phase: s.phase || "unknown",
      claims_count: s.claims_count || 0,
      active_claims: s.active_claims || 0,
      path: s.path,
      status: s.status,
      last_git_activity: s.last_git_activity,
      git_commit_count: s.git_commit_count,
    };
  }

  // 6. Build manifest
  const topicFiles = {};
  for (const [path, info] of Object.entries(allFiles)) {
    if (info.topics.length > 0) {
      topicFiles[path] = info;
    }
  }

  return {
    schema_version: "1.0",
    generated: new Date().toISOString(),
    generator: "@grainulation/barn generate-manifest",
    claims_hash: compilation?.claims_hash || null,
    topics: topicMap,
    sprints,
    files: topicFiles,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

// Only run CLI logic when executed directly (not imported)
const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`generate-manifest — build wheat-manifest.json topic map

Usage:
  barn generate-manifest                         Write wheat-manifest.json
  barn generate-manifest --root /path             Target a specific repo
  barn generate-manifest --out custom-name.json   Custom output path

Reads claims.json and scans the repo to produce a topic map manifest
that gives AI tools a single file describing the sprint state.`);
    process.exit(0);
  }

  const t0 = performance.now();
  const manifest = generateManifest(join(ROOT, "claims.json"), { root: ROOT });

  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + "\n");
  const elapsed = (performance.now() - t0).toFixed(1);

  const topicCount = Object.keys(manifest.topics).length;
  const fileCount = Object.keys(manifest.files).length;
  const sprintCount = Object.keys(manifest.sprints).length;
  const sizeBytes = Buffer.byteLength(JSON.stringify(manifest, null, 2));

  console.log(`wheat-manifest.json generated in ${elapsed}ms`);
  console.log(
    `  Topics: ${topicCount}  |  Files: ${fileCount}  |  Sprints: ${sprintCount}  |  Size: ${(sizeBytes / 1024).toFixed(1)}KB`,
  );
}
