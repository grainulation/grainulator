#!/usr/bin/env node
/**
 * basic.test.js — Sanity tests for barn tools
 *
 * Runs without any test framework. Zero dependencies.
 * Exit code 0 = all pass, 1 = failures.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    failed++;
  }
}

// ─── File structure checks ───────────────────────────────────────────────────

console.log("\n--- File structure ---");

const expectedFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "bin/shared.js",
  "tools/detect-sprints.js",
  "tools/generate-manifest.js",
];

for (const file of expectedFiles) {
  assert(existsSync(join(ROOT, file)), `${file} exists`);
}

// ─── package.json checks ────────────────────────────────────────────────────

console.log("\n--- package.json ---");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

assert(pkg.name === "@grainulation/grainulator-shared", "name is @grainulation/grainulator-shared");
assert(pkg.type === "module", "type is module (ESM)");
assert(pkg.license === "MIT", "license is MIT");
assert(pkg.bin === undefined, "private workspaces expose no standalone product binaries");
assert(
  !pkg.dependencies || Object.keys(pkg.dependencies).length === 0,
  "zero runtime dependencies",
);

// ─── CLI help check ─────────────────────────────────────────────────────────

console.log("\n--- CLI ---");

try {
  const helpOutput = execFileSync(
    process.execPath,
    [join(ROOT, "bin/shared.js"), "help"],
    {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).toString();
  assert(
    helpOutput.includes("detect-sprints"),
    "barn help lists detect-sprints",
  );
  assert(
    helpOutput.includes("generate-manifest"),
    "barn help lists generate-manifest",
  );
  assert(!helpOutput.includes("build-pdf"), "retired PDF command is not advertised");
} catch (e) {
  assert(false, `barn help runs without error: ${e.message}`);
}

// ─── detect-sprints --help check ────────────────────────────────────────────

console.log("\n--- detect-sprints ---");

try {
  const dsHelp = execFileSync(
    process.execPath,
    [join(ROOT, "tools/detect-sprints.js"), "--help"],
    {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).toString();
  assert(dsHelp.includes("--json"), "detect-sprints help mentions --json");
  assert(dsHelp.includes("--active"), "detect-sprints help mentions --active");
  assert(dsHelp.includes("--root"), "detect-sprints help mentions --root");
} catch (e) {
  assert(false, `detect-sprints --help runs: ${e.message}`);
}

// ─── detect-sprints: functional tests ────────────────────────────────────────

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { detectSprints } from "../tools/detect-sprints.js";

console.log("\n--- detect-sprints: functional ---");

// detectSprints finds root claims.json
{
  const tmp = mkdtempSync(join(tmpdir(), "barn-ds-"));
  writeFileSync(
    join(tmp, "claims.json"),
    JSON.stringify({
      meta: {
        phase: "active",
        question: "Test question?",
        initiated: "2026-01-01",
      },
      claims: [
        {
          id: "r001",
          type: "factual",
          text: "test",
          status: "active",
          topic: "test",
        },
      ],
    }),
  );
  const result = detectSprints(tmp);
  assert(result.sprints.length >= 1, "detectSprints finds root sprint");
  assert(result.sprints[0].claims_count === 1, "detectSprints counts claims");
  assert(
    result.sprints[0].active_claims === 1,
    "detectSprints counts active claims",
  );
  assert(result.sprints[0].phase === "active", "detectSprints reads phase");
  rmSync(tmp, { recursive: true });
}

// detectSprints finds sprints in examples/ subdirs
{
  const tmp = mkdtempSync(join(tmpdir(), "barn-ds-"));
  mkdirSync(join(tmp, "examples", "sprint-a"), { recursive: true });
  writeFileSync(
    join(tmp, "examples", "sprint-a", "claims.json"),
    JSON.stringify({
      meta: { phase: "archived", question: "Old sprint" },
      claims: [
        {
          id: "r001",
          type: "factual",
          text: "old",
          status: "active",
          topic: "old",
        },
      ],
    }),
  );
  const result = detectSprints(tmp);
  assert(result.sprints.length >= 1, "detectSprints finds example sprints");
  const exSprint = result.sprints.find((s) => s.name === "sprint-a");
  assert(exSprint, "detectSprints names example sprint from directory");
  assert(
    exSprint.status === "archived",
    "archived sprints get archived status",
  );
  rmSync(tmp, { recursive: true });
}

// detectSprints marks the best candidate as active
{
  const tmp = mkdtempSync(join(tmpdir(), "barn-ds-"));
  writeFileSync(
    join(tmp, "claims.json"),
    JSON.stringify({
      meta: {
        phase: "research",
        question: "Current sprint",
        initiated: "2026-03-01",
      },
      claims: [
        {
          id: "r001",
          type: "factual",
          text: "test",
          status: "active",
          topic: "test",
        },
      ],
    }),
  );
  const result = detectSprints(tmp);
  assert(result.active !== null, "detectSprints identifies active sprint");
  assert(result.active.status === "active", "active sprint has active status");
  rmSync(tmp, { recursive: true });
}

// detectSprints returns empty for dir with no claims.json
{
  const tmp = mkdtempSync(join(tmpdir(), "barn-ds-"));
  const result = detectSprints(tmp);
  assert(
    result.sprints.length === 0,
    "detectSprints returns empty for no claims",
  );
  assert(
    result.active === null,
    "detectSprints active is null when no sprints",
  );
  rmSync(tmp, { recursive: true });
}

// ─── generate-manifest: --help check ─────────────────────────────────────────

console.log("\n--- generate-manifest ---");

// Note: generate-manifest imports detect-sprints which has top-level CLI code,
// so --help is intercepted by detect-sprints. We verify it runs without error.
try {
  const gmHelp = execFileSync(
    process.execPath,
    [join(ROOT, "tools/generate-manifest.js"), "--help"],
    {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).toString();
  assert(gmHelp.includes("--root"), "generate-manifest help mentions --root");
} catch (e) {
  assert(false, `generate-manifest --help runs: ${e.message}`);
}

// ─── generate-manifest: functional with real claims ──────────────────────────

{
  const tmp = mkdtempSync(join(tmpdir(), "barn-gm-"));
  writeFileSync(
    join(tmp, "claims.json"),
    JSON.stringify({
      meta: { phase: "active", question: "Manifest test" },
      claims: [
        {
          id: "r001",
          type: "factual",
          text: "test claim",
          status: "active",
          topic: "infra",
          evidence: "documented",
          tags: ["node"],
        },
      ],
    }),
  );
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, "tools/generate-manifest.js"), "--root", tmp],
      {
        timeout: 10000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const manifest = JSON.parse(
      readFileSync(join(tmp, ".grainulator/evidence/manifest.json"), "utf8"),
    );
    assert(
      manifest.generator === "@grainulation/grainulator-shared generate-manifest",
      "manifest has correct generator",
    );
    assert(
      manifest.topics && typeof manifest.topics === "object",
      "manifest has topics object",
    );
    assert(
      manifest.topics["infra"],
      "manifest has the infra topic from claims",
    );
    assert(
      manifest.topics["infra"].claims.includes("r001"),
      "manifest topic contains claim r001",
    );
    assert(
      typeof manifest.generated === "string",
      "manifest has generated timestamp",
    );
    assert(typeof manifest.sprints === "object", "manifest has sprints object");
    assert(typeof manifest.files === "object", "manifest has files object");
  } catch (e) {
    assert(false, `generate-manifest runs on test claims: ${e.message}`);
  }
  rmSync(tmp, { recursive: true });
}

// ─── CLI version/help checks ─────────────────────────────────────────────────

console.log("\n--- CLI edge cases ---");

// barn unknown command exits with error
{
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, "bin/shared.js"), "nonexistent-cmd"],
      {
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    assert(false, "barn should exit with error on unknown command");
  } catch (e) {
    assert(e.status === 1, "barn exits 1 for unknown command");
  }
}

// barn -h also shows help
{
  try {
    const helpOutput = execFileSync(
      process.execPath,
      [join(ROOT, "bin/shared.js"), "-h"],
      {
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).toString();
    assert(
      helpOutput.includes("detect-sprints"),
      "barn -h shows detect-sprints",
    );
  } catch (e) {
    assert(false, `barn -h runs: ${e.message}`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
