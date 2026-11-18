import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packages = fileURLToPath(new URL("../../", import.meta.url));
const bins = [
  ["analytics", "harvest.js"], ["evidence", "wheat.js"],
  ["exports", "mill.js"], ["legacy-cli", "grainulation.js"],
  ["memory", "silo.js"], ["orchestration", "orchard.js"],
  ["shared", "barn.js"],
];

test("retired dashboard commands fail before opening services or creating sprint files", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-retired-dashboards-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [component, name] of bins) {
    const bin = path.join(packages, component, "bin", name);
    for (const args of [["serve"], ["serve", "--help"]]) {
      const result = spawnSync(process.execPath, [bin, ...args], {
        cwd: dir, encoding: "utf8", timeout: 5000,
      });
      assert.equal(result.error, undefined, `${component}: ${result.error}`);
      assert.equal(result.status, 1, `${component}: ${result.stderr}`);
      assert.match(result.stderr, /dashboard.*retired/i, component);
      assert.deepEqual(fs.readdirSync(dir), [], `${component} created files`);
    }
    const version = spawnSync(process.execPath, [bin, "--version"], {
      cwd: dir, encoding: "utf8", timeout: 5000,
    });
    assert.equal(version.status, 0, `${component}: ${version.stderr}`);
    assert.match(version.stdout, /\d+\.\d+\.\d+/, component);
  }
});

test("sample quickstart compiles and exits without its former HTTP dashboard", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-sample-quickstart-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [path.join(packages, "evidence/bin/wheat.js"), "quickstart", "--dir", dir], {
    cwd: dir, encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Quickstart complete/);
  assert.doesNotMatch(result.stdout, /Starting dashboard|http:\/\/localhost:/);
  const claims = JSON.parse(fs.readFileSync(path.join(dir, "claims.json")));
  const compilation = JSON.parse(fs.readFileSync(path.join(dir, "compilation.json")));
  assert.ok(claims.claims.length > 0);
  assert.ok(compilation.status);
});

test("legacy startup rejects retired apps while process cleanup remains available", async () => {
  const { default: pm } = await import("../../legacy-cli/lib/pm.js");
  assert.throws(() => pm.startTool("wheat"), /dashboard.*retired/i);
  assert.equal(typeof pm.stopTool, "function");
  const result = spawnSync(process.execPath, [path.join(packages, "legacy-cli/bin/grainulation.js"), "up", "all"], {
    encoding: "utf8", timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dashboard.*retired/i);
});

test("legacy delegation rejects retired apps before source lookup or npx, in either JSON flag order", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-retired-delegation-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tools = path.join(dir, "tools");
  const cwd = path.join(dir, "project");
  const marker = path.join(dir, "launched");
  fs.mkdirSync(tools);
  fs.mkdirSync(cwd);
  const fakeProgram = '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.FAKE_NPX_MARKER, process.argv.slice(2).join(" ")+"\\n");\n';
  fs.writeFileSync(path.join(tools, "npx"), fakeProgram, { mode: 0o755 });
  const env = { ...process.env, PATH: tools + path.delimiter + process.env.PATH, FAKE_NPX_MARKER: marker };
  const legacy = path.join(packages, "legacy-cli/bin/grainulation.js");
  const product = path.join(packages, "../bin/grainulator.js");
  const router = path.join(packages, "legacy-cli/lib/router.js");
  const requests = [
    [legacy, "wheat", "serve"],
    [legacy, "silo", "serve", "--help"],
    [legacy, "--json", "wheat", "serve"],
    [legacy, "wheat", "--json", "serve"],
    [legacy, "--json", "serve"],
    [product, "legacy", "wheat", "serve"],
    [product, "legacy", "--json", "silo", "serve", "--help"],
    ["-e", `require(${JSON.stringify(router)}).delegate("wheat", ["--json", "serve"])`],
  ];
  // Exercise the fallback registry launcher and then the historical sibling checkout.
  for (const sibling of [false, true]) {
    if (sibling) {
      const wheat = path.join(dir, "wheat");
      fs.mkdirSync(wheat);
      fs.writeFileSync(path.join(wheat, "package.json"), JSON.stringify({ name: "@grainulation/wheat", bin: "old-wheat.js" }));
      fs.writeFileSync(path.join(wheat, "old-wheat.js"), fakeProgram);
    }
    for (const request of requests) {
      const result = spawnSync(process.execPath, request, { cwd, env, encoding: "utf8", timeout: 5000 });
      assert.equal(result.error, undefined, `${request}: ${result.error}`);
      assert.equal(result.status, 1, `${request}: ${result.stderr}`);
      assert.match(result.stderr, /dashboard.*retired/i);
      assert.equal(fs.existsSync(marker), false, `retired delegation launched a process: ${request}`);
    }
  }
  const allowed = spawnSync(process.execPath, [legacy, "silo", "serve-mcp"], { cwd, env, encoding: "utf8", timeout: 5000 });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(fs.readFileSync(marker, "utf8"), /@grainulation\/silo serve-mcp/);
});

test("evidence package API imports without retired connector or browser exports", async () => {
  const api = await import("../../evidence/lib/index.js");
  assert.deepEqual(Object.keys(api).sort(), ["compile", "guard", "init", "stats", "status", "update"]);
  for (const operation of Object.values(api)) assert.equal(typeof operation, "function");
});

test("quickstart reports compilation failure and preserves sample claims for recovery", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-quickstart-failure-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "compilation.json"));
  const result = spawnSync(process.execPath, [path.join(packages, "evidence/bin/wheat.js"), "quickstart", "--dir", dir], {
    cwd: dir, encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EISDIR|illegal operation on a directory/);
  assert.doesNotMatch(result.stdout, /Quickstart complete|Compiled in/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, "claims.json"))).claims.length > 0);
});
