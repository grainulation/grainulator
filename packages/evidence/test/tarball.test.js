// Package inventory covers retained CLI/MCP/report resources and excludes retired apps.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const REQUIRED_PATHS = [
  "package/lib/serve-mcp.js",
  "package/bin/wheat.js",
  "package/bin/wheat-mcp.cjs",
  "package/compiler/wheat-compiler.js",
  "package/package.json",
  "package/README.md",
  "package/LICENSE"
];
const RETIRED_PATHS = ["public/index.html", "lib/server.js", "lib/server.mjs"];
const PKG_ROOT = new URL("..", import.meta.url);

test("npm pack includes retained runtime resources and excludes retired browser apps", () => {
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: PKG_ROOT, encoding: "utf8",
  }));
  const files = new Set(packed.files.map(file => file.path.replace(/^package\//, "")));
  for (const required of REQUIRED_PATHS)
    assert.ok(files.has(required.replace(/^package\//, "")), `missing from tarball: ${required}`);
  for (const retired of RETIRED_PATHS)
    assert.equal(files.has(retired), false, `retired browser app shipped: ${retired}`);
  assert.equal([...files].some(file => file.startsWith("site/")), false, "marketing sources belong to infra");
});

test("actual tarball preserves every retained entry without browser dashboard files", () => {
  const packedDir = mkdtempSync(path.join(tmpdir(), "grainulator-component-pack-"));
  const filename = execFileSync("npm", ["pack", "--pack-destination", packedDir, "--silent"], {
    cwd: PKG_ROOT, encoding: "utf8",
  }).trim();
  const extracted = path.join(packedDir, "extracted");
  mkdirSync(extracted);
  execFileSync("tar", ["xzf", path.join(packedDir, filename), "-C", extracted]);
  for (const required of REQUIRED_PATHS)
    assert.ok(existsSync(path.join(extracted, required)), `missing extracted runtime resource: ${required}`);
  for (const retired of RETIRED_PATHS)
    assert.equal(existsSync(path.join(extracted, "package", retired)), false, `retired app present: ${retired}`);
});
