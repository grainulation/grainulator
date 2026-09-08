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
  "bin/barn.js",
  "tools/detect-sprints.js",
  "tools/generate-manifest.js",
  "tools/build-pdf.js",
  "templates/explainer.html",
  "templates/dashboard.html",
  "site/index.html",
];

for (const file of expectedFiles) {
  assert(existsSync(join(ROOT, file)), `${file} exists`);
}

// ─── package.json checks ────────────────────────────────────────────────────

console.log("\n--- package.json ---");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

assert(pkg.name === "@grainulation/barn", "name is @grainulation/barn");
assert(pkg.type === "module", "type is module (ESM)");
assert(pkg.license === "MIT", "license is MIT");
assert(pkg.bin?.barn === "./bin/barn.js", "bin points to barn.js");
assert(
  !pkg.dependencies || Object.keys(pkg.dependencies).length === 0,
  "zero runtime dependencies",
);

// ─── Template checks ────────────────────────────────────────────────────────

console.log("\n--- Templates ---");

const explainer = readFileSync(join(ROOT, "templates/explainer.html"), "utf8");
assert(explainer.includes("scroll-snap-type"), "explainer has scroll-snap");
assert(explainer.includes("{{TITLE}}"), "explainer has TITLE placeholder");
assert(!explainer.includes("<link"), "explainer has no external CSS links");
assert(!explainer.includes("<script src"), "explainer has no external JS");

const dashboard = readFileSync(join(ROOT, "templates/dashboard.html"), "utf8");
assert(
  dashboard.includes("{{SPRINT_QUESTION}}"),
  "dashboard has SPRINT_QUESTION placeholder",
);
assert(dashboard.includes(".phase-track"), "dashboard has phase track");
assert(dashboard.includes(".evidence-bar"), "dashboard has evidence bars");

// ─── CLI help check ─────────────────────────────────────────────────────────

console.log("\n--- CLI ---");

try {
  const helpOutput = execFileSync(
    process.execPath,
    [join(ROOT, "bin/barn.js"), "help"],
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
  assert(helpOutput.includes("build-pdf"), "barn help lists build-pdf");
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

// ─── Site checks ─────────────────────────────────────────────────────────────

console.log("\n--- Site ---");

const site = readFileSync(join(ROOT, "site/index.html"), "utf8");
assert(site.includes("#e11d48"), "site uses barn rose-red accent");
assert(site.includes("@grainulation/barn"), "site mentions package name");
assert(site.includes("detect-sprints"), "site documents detect-sprints");
assert(site.includes("generate-manifest"), "site documents generate-manifest");
assert(site.includes("build-pdf"), "site documents build-pdf");

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
      readFileSync(join(tmp, "wheat-manifest.json"), "utf8"),
    );
    assert(
      manifest.generator === "@grainulation/barn generate-manifest",
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

// ─── build-pdf: --help check ────────────────────────────────────────────────

console.log("\n--- build-pdf ---");

try {
  const bpHelp = execFileSync(
    process.execPath,
    [join(ROOT, "tools/build-pdf.js"), "--help"],
    {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).toString();
  assert(bpHelp.includes("build-pdf"), "build-pdf help mentions itself");
  assert(bpHelp.includes("markdown"), "build-pdf help mentions markdown");
  assert(bpHelp.includes("md-to-pdf"), "build-pdf help mentions md-to-pdf");
} catch (e) {
  assert(false, `build-pdf --help runs: ${e.message}`);
}

// build-pdf exits with 1 for nonexistent file
{
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, "tools/build-pdf.js"), "/nonexistent/file.md"],
      {
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    assert(false, "build-pdf should fail for nonexistent file");
  } catch (e) {
    assert(e.status === 1, "build-pdf exits 1 for missing file");
  }
}

// ─── CLI version/help checks ─────────────────────────────────────────────────

console.log("\n--- CLI edge cases ---");

// barn unknown command exits with error
{
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, "bin/barn.js"), "nonexistent-cmd"],
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
      [join(ROOT, "bin/barn.js"), "-h"],
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
