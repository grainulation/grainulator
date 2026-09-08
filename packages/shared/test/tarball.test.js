// test/tarball.test.js — verify the published npm tarball contains everything
// barn serve needs at runtime.
// Prevents the drift class that caused wheat 1.0.1–1.1.7 and harvest/orchard
// 1.1.4 dashboard 404s (files referenced at runtime but not in package.json#files).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REQUIRED_PATHS = [
  "package/public/index.html",
  "package/lib/server.js",
  "package/templates/dashboard.html",
  "package/bin/barn.js",
  "package/package.json",
  "package/LICENSE",
];

const PKG_ROOT = new URL("..", import.meta.url);

test("npm pack --dry-run includes every load-bearing file", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: PKG_ROOT,
    encoding: "utf8",
  });
  const packed = JSON.parse(out)[0];
  const files = new Set((packed.files || []).map((f) => f.path));
  for (const req of REQUIRED_PATHS) {
    const bare = req.startsWith("package/")
      ? req.slice("package/".length)
      : req;
    assert.ok(
      files.has(req) || files.has(bare),
      `missing from tarball: ${req}`,
    );
  }
});

test("packed tarball's server.js can resolve public/index.html at runtime", () => {
  const packDir = mkdtempSync(path.join(tmpdir(), "barn-pack-"));
  const out = execFileSync(
    "npm",
    ["pack", "--pack-destination", packDir, "--silent"],
    {
      cwd: PKG_ROOT,
      encoding: "utf8",
    },
  );
  const tarball = path.join(packDir, out.trim());
  assert.ok(existsSync(tarball), `tarball not produced: ${tarball}`);
  const extractDir = path.join(packDir, "ext");
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["xzf", tarball, "-C", extractDir]);
  const serverJs = path.join(extractDir, "package/lib/server.js");
  const publicIndex = path.join(extractDir, "package/public/index.html");
  assert.ok(existsSync(serverJs), "server.js missing after tarball extract");
  assert.ok(
    existsSync(publicIndex),
    "public/index.html missing after tarball extract — dashboard will 404",
  );
});
