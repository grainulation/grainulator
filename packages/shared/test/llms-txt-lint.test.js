// llms-txt-lint smoke test — parser behavior + report emission on synthetic
// fixtures. Keeps coverage local; does not require the surrounding ecosystem
// to be checked out (that is the job of the `main` entry point, not the unit
// test).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseLlmsTxt,
  lintAll,
  normalizeName,
  similarityRatio,
  EXPECTED_SIBLINGS,
} from "../tools/seo/llms-txt-lint.js";

test("parseLlmsTxt extracts H1, blockquote, and sectioned link lists", () => {
  const src = [
    "# Example",
    "",
    "> One-liner for example.",
    "",
    "prose paragraph",
    "",
    "## Documentation",
    "",
    "- [README](https://example.com/readme): readme blurb.",
    "- [Changelog](https://example.com/changelog): version history.",
    "",
    "## Ecosystem",
    "",
    "- [Barn](https://barn.example.com): shared primitives.",
    "- [Wheat](https://wheat.example.com): research compiler.",
    "",
    "## Optional",
    "",
    "- [Issues](https://example.com/issues): bug reports.",
    "",
  ].join("\n");

  const parsed = parseLlmsTxt(src);
  assert.equal(parsed.h1, "Example");
  assert.equal(parsed.blockquote, "One-liner for example.");
  assert.equal(parsed.sections["Documentation"].length, 2);
  assert.equal(parsed.sections["Ecosystem"].length, 2);
  assert.equal(parsed.sections["Ecosystem"][0].label, "Barn");
  assert.equal(
    parsed.sections["Ecosystem"][0].description,
    "shared primitives.",
  );
  assert.deepEqual(parsed.placeholders, []);
});

test("parseLlmsTxt surfaces unfilled placeholders", () => {
  const src = "# A\n\n> blurb\n\n## Ecosystem\n\n{{SIBLING_LINKS}}\n";
  const parsed = parseLlmsTxt(src);
  assert.deepEqual(parsed.placeholders, ["{{SIBLING_LINKS}}"]);
});

test("normalizeName strips scope and parentheticals", () => {
  assert.equal(normalizeName("@grainulation/wheat"), "wheat");
  assert.equal(normalizeName("Mill (@grainulation/mill)"), "mill");
  assert.equal(normalizeName("Grainulation (umbrella)"), "grainulation");
  assert.equal(normalizeName("Barn"), "barn");
});

test("similarityRatio: identical text scores 1.0; disjoint scores 0", () => {
  assert.equal(similarityRatio("foo bar baz", "foo bar baz"), 1);
  assert.equal(similarityRatio("foo bar", "quux zot"), 0);
  const r = similarityRatio(
    "research sprint compiler",
    "research compiler tool",
  );
  assert.ok(r > 0 && r < 1);
});

test("lintAll: clean ecosystem yields zero issues", () => {
  const dir = mkdtempSync(join(tmpdir(), "llms-lint-clean-"));
  const siblings = ["barn", "wheat"];
  for (const s of siblings) {
    mkdirSync(join(dir, s, "site"), { recursive: true });
    writeFileSync(
      join(dir, s, "package.json"),
      JSON.stringify({ name: `@grainulation/${s}`, version: "1.0.0" }),
    );
    const other = siblings.find((o) => o !== s);
    writeFileSync(
      join(dir, s, "site", "llms.txt"),
      [
        `# ${s[0].toUpperCase() + s.slice(1)} (@grainulation/${s})`,
        "",
        "> matching one-liner shared blurb word bag.",
        "",
        "## Ecosystem",
        "",
        `- [${other[0].toUpperCase() + other.slice(1)}](https://${other}.example.com): matching one-liner shared blurb word bag.`,
        "",
      ].join("\n"),
    );
  }

  const { issues } = lintAll([join(dir, "barn"), join(dir, "wheat")]);
  assert.equal(
    issues.length,
    0,
    `expected zero issues, got: ${JSON.stringify(issues, null, 2)}`,
  );
});

test("lintAll: missing sibling is flagged", () => {
  const dir = mkdtempSync(join(tmpdir(), "llms-lint-missing-"));
  mkdirSync(join(dir, "barn", "site"), { recursive: true });
  mkdirSync(join(dir, "wheat", "site"), { recursive: true });
  writeFileSync(
    join(dir, "barn", "package.json"),
    JSON.stringify({ name: "@grainulation/barn" }),
  );
  writeFileSync(
    join(dir, "wheat", "package.json"),
    JSON.stringify({ name: "@grainulation/wheat" }),
  );
  // barn's ecosystem list is empty — should flag a missing-sibling for wheat.
  writeFileSync(
    join(dir, "barn", "site", "llms.txt"),
    "# Barn\n\n> blurb.\n\n## Ecosystem\n\n",
  );
  writeFileSync(
    join(dir, "wheat", "site", "llms.txt"),
    "# Wheat\n\n> blurb.\n\n## Ecosystem\n\n- [Barn](https://barn.example.com): same blurb.\n",
  );

  const { issues } = lintAll([join(dir, "barn"), join(dir, "wheat")]);
  const missing = issues.filter((i) => i.kind === "missing-sibling");
  assert.ok(
    missing.length >= 1,
    `expected at least one missing-sibling issue; got: ${JSON.stringify(issues)}`,
  );
});

test("lintAll: unfilled placeholder flagged", () => {
  const dir = mkdtempSync(join(tmpdir(), "llms-lint-placeholder-"));
  mkdirSync(join(dir, "barn", "site"), { recursive: true });
  writeFileSync(
    join(dir, "barn", "package.json"),
    JSON.stringify({ name: "@grainulation/barn" }),
  );
  writeFileSync(
    join(dir, "barn", "site", "llms.txt"),
    "# Barn\n\n> blurb.\n\n## Ecosystem\n\n{{SIBLING_LINKS}}\n",
  );
  const { issues } = lintAll([join(dir, "barn")]);
  const unfilled = issues.filter((i) => i.kind === "unfilled");
  assert.equal(unfilled.length, 1);
  assert.match(unfilled[0].detail, /SIBLING_LINKS/);
});

test("EXPECTED_SIBLINGS contains all 8 ecosystem packages", () => {
  for (const s of [
    "barn",
    "grainulation",
    "harvest",
    "mill",
    "orchard",
    "silo",
    "wheat",
  ]) {
    assert.ok(
      EXPECTED_SIBLINGS.includes(s),
      `expected EXPECTED_SIBLINGS to contain ${s}`,
    );
  }
});
