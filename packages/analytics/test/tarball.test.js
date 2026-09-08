// test/tarball.test.js — verify the published npm tarball contains everything
// harvest serve needs at runtime.
// Prevents the class of regression that caused 1.1.4's dashboard 404 (public/
// not declared in package.json#files -> public/index.html absent from tarball).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REQUIRED_PATHS = [
  "package/public/index.html", // dashboard template (was missing in 1.1.4)
  "package/lib/server.js", // harvest serve entry
  "package/templates/dashboard.html", // CLI dashboard static emit
  "package/templates/retrospective.html", // retrospective report
  "package/bin/harvest.js", // CLI entry
  "package/package.json",
  "package/README.md",
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
  // npm pack --dry-run --json emits paths relative to the package root
  // (without the "package/" prefix used inside the tarball itself). Accept
  // both forms so the test is resilient to npm versions.
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
  // Integration smoke: actually pack the tarball and verify public/index.html
  // is resolvable via path.resolve from lib/server.js
  const packDir = mkdtempSync(path.join(tmpdir(), "harvest-pack-"));
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
