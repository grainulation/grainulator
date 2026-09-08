#!/usr/bin/env node
/**
 * detect-sprints.js — Git-based sprint detection without config pointer
 *
 * Scans the repo for sprint indicators (claims.json files) and determines
 * which sprint is "active" using filesystem + git heuristics:
 *
 *   1. Find all claims.json files (root + examples/ subdirs)
 *   2. Read meta.phase — "archived" sprints are inactive
 *   3. Query git log for most recent commit touching each claims.json
 *   4. Rank by: non-archived > most recent git activity > most recent initiated date
 *
 * Returns a list of sprints with status (active/archived/example).
 * Works without any config file — pure filesystem + git.
 *
 * Based on stakeholder feedback f001: config should not duplicate
 * git-derivable state. Supersedes r020/r025 (config-based currentSprint).
 *
 * Usage:
 *   node detect-sprints.js              # Human-readable output
 *   node detect-sprints.js --json       # Machine-readable JSON
 *   node detect-sprints.js --active     # Print only the active sprint path
 *
 * Zero npm dependencies (Node built-in only).
 */

import fs from "fs";
import path from "path";
// execFileSync used to query git history (no shell, array args only).
// Socket.dev flags this as "shell access" but execFileSync bypasses the shell.
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ROOT = __dirname;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely parse JSON from a file path; returns null on failure. */
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Batch git queries for all sprint files at once.
 * One git call total instead of 2 per sprint (30x+ faster for 16 sprints).
 * Returns Map<filePath, { date: string|null, count: number }>
 */
let _gitCache = null;

function batchGitInfo(filePaths) {
  if (_gitCache) return _gitCache;
  const info = new Map();
  // Build a map from relative path (as git returns it) back to original filePath
  const relToOrig = new Map();
  const relPaths = [];
  for (const fp of filePaths) {
    const rel = path
      .relative(ROOT, path.resolve(ROOT, fp))
      .split(path.sep)
      .join("/");
    relToOrig.set(rel, fp);
    relPaths.push(rel);
    info.set(fp, { date: null, count: 0 });
  }

  if (filePaths.length === 0) {
    _gitCache = info;
    return info;
  }

  // Single git call: get dates AND counts from one log traversal.
  // Format: "COMMIT <date>" header per commit, then --name-only lists files.
  // First occurrence of each file gives its last-commit date.
  // Total occurrences per file gives its commit count.
  try {
    const result = execFileSync(
      "git",
      ["log", "--format=COMMIT %aI", "--name-only", "--", ...relPaths],
      { cwd: ROOT, timeout: 10000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const lines = result.toString().split("\n");
    const seenForDate = new Set();
    let currentDate = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("COMMIT ")) {
        currentDate = trimmed.slice(7);
      } else {
        const orig = relToOrig.get(trimmed);
        if (orig) {
          const entry = info.get(orig);
          entry.count++;
          if (!seenForDate.has(trimmed)) {
            seenForDate.add(trimmed);
            entry.date = currentDate;
          }
        }
      }
    }
  } catch {
    /* git unavailable, dates stay null, counts stay 0 */
  }

  _gitCache = info;
  return info;
}

/** Reset git cache (called when ROOT changes). */
function resetGitCache() {
  _gitCache = null;
}

/**
 * Get the ISO timestamp of the most recent git commit touching a file.
 * Returns null if file is untracked or git is unavailable.
 * Uses batch cache when available.
 */
function lastGitCommitDate(filePath) {
  if (_gitCache) {
    const entry = _gitCache.get(filePath);
    return entry ? entry.date : null;
  }
  try {
    const result = execFileSync(
      "git",
      ["log", "-1", "--format=%aI", "--", filePath],
      { cwd: ROOT, timeout: 5000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const dateStr = result.toString().trim();
    return dateStr || null;
  } catch {
    return null;
  }
}

/**
 * Count git commits touching a file (proxy for activity level).
 * Uses batch cache when available.
 */
function gitCommitCount(filePath) {
  if (_gitCache) {
    const entry = _gitCache.get(filePath);
    return entry ? entry.count : 0;
  }
  try {
    const result = execFileSync(
      "git",
      ["rev-list", "--count", "HEAD", "--", filePath],
      { cwd: ROOT, timeout: 5000, stdio: ["ignore", "pipe", "pipe"] },
    );
    return parseInt(result.toString().trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Derive a slug from the sprint's path or question.
 * Root sprint gets slug from first few words of the question.
 */
function deriveName(sprintPath, meta) {
  if (sprintPath !== ".") {
    // examples/remote-research-sprint -> remote-research-sprint
    return path.basename(sprintPath);
  }
  // Root sprint: derive from question
  if (meta?.question) {
    return meta.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .slice(0, 4)
      .join("-");
  }
  return "current";
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

/** Find all sprint roots (directories containing claims.json). */
function findSprintRoots() {
  const roots = [];

  // 1. Root-level claims.json (current sprint)
  const rootClaims = path.join(ROOT, "claims.json");
  if (fs.existsSync(rootClaims)) {
    roots.push({ claimsPath: rootClaims, sprintPath: "." });
  }

  // 2. Scan known subdirectories for sprint claims.json files
  //    Root claims.json should NOT prevent scanning subdirs
  const scanDirs = ["examples", "sprints", "archive"];
  for (const dirName of scanDirs) {
    const dir = path.join(ROOT, dirName);
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const claimsPath = path.join(dir, entry.name, "claims.json");
        if (fs.existsSync(claimsPath)) {
          roots.push({
            claimsPath,
            sprintPath: path.join(dirName, entry.name),
          });
        }
      }
    } catch {
      /* skip if unreadable */
    }
  }

  return roots;
}

// ─── Sprint Analysis ──────────────────────────────────────────────────────────

/**
 * Analyze a single sprint root and return structured info.
 * @param {{ claimsPath: string, sprintPath: string }} root
 * @returns {object} Sprint descriptor
 */
function analyzeSprint(root) {
  const claims = loadJSON(root.claimsPath);
  if (!claims) return null;

  const meta = claims.meta || {};
  const claimsList = claims.claims || [];

  // Git activity signals
  const lastCommit = lastGitCommitDate(root.claimsPath);
  const commitCount = gitCommitCount(root.claimsPath);

  // Phase-based status inference
  const phase = meta.phase || "unknown";
  const isArchived = phase === "archived" || phase === "complete";
  const isExample =
    root.sprintPath.startsWith("examples" + path.sep) ||
    root.sprintPath.startsWith("examples/");

  // Compute status
  let status;
  if (isArchived) {
    status = "archived";
  } else if (isExample) {
    status = "example";
  } else {
    status = "candidate"; // will be resolved to 'active' below
  }

  return {
    name: deriveName(root.sprintPath, meta),
    path: root.sprintPath,
    question: meta.question || "",
    phase,
    initiated: meta.initiated || null,
    last_git_activity: lastCommit,
    git_commit_count: commitCount,
    claims_count: claimsList.length,
    active_claims: claimsList.filter((c) => c.status === "active").length,
    status,
  };
}

/**
 * Detect all sprints and determine which is active.
 *
 * Heuristic ranking (highest to lowest priority):
 *   1. Non-archived, non-example sprints (root-level candidates)
 *   2. Most recent git commit touching claims.json
 *   3. Most recent meta.initiated date
 *   4. Highest claim count (tiebreaker)
 *
 * @returns {{ active: object|null, sprints: object[] }}
 */
export function detectSprints(rootDir) {
  if (rootDir) ROOT = rootDir;
  resetGitCache();
  const roots = findSprintRoots();

  // Batch all git queries upfront: 1 git call instead of 2 per sprint
  batchGitInfo(roots.map((r) => r.claimsPath));

  const sprints = roots.map(analyzeSprint).filter(Boolean);

  // Separate candidates from archived/examples
  const candidates = sprints.filter((s) => s.status === "candidate");
  const others = sprints.filter((s) => s.status !== "candidate");

  // Rank candidates by git activity, then initiated date, then claim count
  candidates.sort((a, b) => {
    // Most recent git activity first
    const dateA = a.last_git_activity
      ? new Date(a.last_git_activity).getTime()
      : 0;
    const dateB = b.last_git_activity
      ? new Date(b.last_git_activity).getTime()
      : 0;
    if (dateB !== dateA) return dateB - dateA;

    // Most recent initiated date
    const initA = a.initiated ? new Date(a.initiated).getTime() : 0;
    const initB = b.initiated ? new Date(b.initiated).getTime() : 0;
    if (initB !== initA) return initB - initA;

    // More claims = more active
    return b.claims_count - a.claims_count;
  });

  // Top candidate is active
  let active = null;
  if (candidates.length > 0) {
    candidates[0].status = "active";
    active = candidates[0];
  }

  // If no root candidate, check examples — the one with most recent git activity
  if (!active && others.length > 0) {
    const nonArchived = others.filter((s) => s.status !== "archived");
    if (nonArchived.length > 0) {
      nonArchived.sort((a, b) => {
        const dateA = a.last_git_activity
          ? new Date(a.last_git_activity).getTime()
          : 0;
        const dateB = b.last_git_activity
          ? new Date(b.last_git_activity).getTime()
          : 0;
        return dateB - dateA;
      });
      nonArchived[0].status = "active";
      active = nonArchived[0];
    }
  }

  // Combine and sort: active first, then by last_git_activity
  const allSprints = [...candidates, ...others].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    const dateA = a.last_git_activity
      ? new Date(a.last_git_activity).getTime()
      : 0;
    const dateB = b.last_git_activity
      ? new Date(b.last_git_activity).getTime()
      : 0;
    return dateB - dateA;
  });

  return { active, sprints: allSprints };
}

export { findSprintRoots, analyzeSprint };

// ─── CLI (only when run directly, not when imported) ──────────────────────────

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`detect-sprints.js — Git-based sprint detection (no config required)

Usage:
  node detect-sprints.js              Human-readable sprint list
  node detect-sprints.js --json       Machine-readable JSON output
  node detect-sprints.js --active     Print only the active sprint path
  node detect-sprints.js --root DIR   Scan DIR instead of the script location

Detects sprints from claims.json files in the repo. Determines the active
sprint using git commit history and metadata — no config pointer needed.
Based on f001: config should not duplicate git-derivable state.`);
    process.exit(0);
  }

  const rootIdx = args.indexOf("--root");
  const rootArg =
    rootIdx !== -1 && args[rootIdx + 1]
      ? path.resolve(args[rootIdx + 1])
      : undefined;

  const t0 = performance.now();
  const result = detectSprints(rootArg);
  const elapsed = (performance.now() - t0).toFixed(1);

  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (args.includes("--active")) {
    if (result.active) {
      console.log(result.active.path);
    } else {
      console.error("No active sprint detected.");
      process.exit(1);
    }
    process.exit(0);
  }

  // Human-readable output
  console.log(`Sprint Detection (${elapsed}ms)`);
  console.log("=".repeat(50));
  console.log(`Found ${result.sprints.length} sprint(s)\n`);

  for (const sprint of result.sprints) {
    const icon = sprint.status === "active" ? ">>>" : "   ";
    const statusTag = sprint.status.toUpperCase().padEnd(8);
    console.log(`${icon} [${statusTag}] ${sprint.name}`);
    console.log(`    Path:     ${sprint.path}`);
    console.log(`    Phase:    ${sprint.phase}`);
    console.log(
      `    Claims:   ${sprint.claims_count} total, ${sprint.active_claims} active`,
    );
    console.log(`    Initiated: ${sprint.initiated || "unknown"}`);
    console.log(`    Last git:  ${sprint.last_git_activity || "untracked"}`);
    console.log(`    Commits:   ${sprint.git_commit_count}`);
    console.log(
      `    Question:  ${sprint.question.slice(0, 80)}${
        sprint.question.length > 80 ? "..." : ""
      }`,
    );
    console.log();
  }

  if (result.active) {
    console.log(`Active sprint: ${result.active.path} (${result.active.name})`);
  } else {
    console.log("No active sprint detected.");
  }
}
