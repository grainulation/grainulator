/**
 * Tests for the orchard-to-grainulator bridge (emit.js).
 * Uses node:test + node:assert -- zero dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { emitInstructions } from "../lib/emit.js";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "orchard-emit-test-"));
}

function writeClaims(dir, meta = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "claims.json"),
    JSON.stringify({ meta, claims: [] }),
  );
}

describe("emitInstructions()", () => {
  it("returns instructions for ready sprints with questions", () => {
    const tmp = makeTmpDir();
    const sprintDir = path.join(tmp, "sprint-a");
    writeClaims(sprintDir, { question: "Should we use Kafka?" });

    const config = {
      sprints: [{ path: "sprint-a", status: "not-started", depends_on: [] }],
    };

    const result = emitInstructions(config, tmp);
    assert.equal(result.length, 1);
    assert.equal(result[0].question, "Should we use Kafka?");
    assert.equal(result[0].dir, sprintDir);
    assert.ok(Array.isArray(result[0].tools));

    fs.rmSync(tmp, { recursive: true });
  });

  it("skips sprints with status done or active", () => {
    const tmp = makeTmpDir();
    writeClaims(path.join(tmp, "done-sprint"), { question: "Done?" });
    writeClaims(path.join(tmp, "active-sprint"), { question: "Active?" });

    const config = {
      sprints: [
        { path: "done-sprint", status: "done", depends_on: [] },
        { path: "active-sprint", status: "active", depends_on: [] },
      ],
    };

    const result = emitInstructions(config, tmp);
    assert.equal(result.length, 0);

    fs.rmSync(tmp, { recursive: true });
  });

  it("skips sprints with unmet dependencies", () => {
    const tmp = makeTmpDir();
    writeClaims(path.join(tmp, "blocked"), { question: "Blocked?" });
    writeClaims(path.join(tmp, "dep"), { question: "Dep?" });

    const config = {
      sprints: [
        { path: "dep", status: "not-started", depends_on: [] },
        { path: "blocked", status: "not-started", depends_on: ["dep"] },
      ],
    };

    // dep is not-started (not done/compiled), so blocked should not appear
    // but dep itself should appear (no deps)
    const result = emitInstructions(config, tmp);
    assert.equal(result.length, 1);
    assert.ok(result[0].dir.endsWith("dep"));

    fs.rmSync(tmp, { recursive: true });
  });

  it("emits 2 of 3 sprints when 1 is blocked", () => {
    const tmp = makeTmpDir();
    writeClaims(path.join(tmp, "a"), { question: "Q-A?" });
    writeClaims(path.join(tmp, "b"), { question: "Q-B?" });
    writeClaims(path.join(tmp, "c"), { question: "Q-C?" });

    const config = {
      sprints: [
        { path: "a", status: "done", depends_on: [] },
        { path: "b", status: "not-started", depends_on: ["a"] },
        { path: "c", status: "not-started", depends_on: ["a", "b"] },
      ],
    };

    // a is done, b depends on a (met), c depends on a+b (b is not-started → not met)
    const result = emitInstructions(config, tmp);
    assert.equal(result.length, 1);
    assert.ok(result[0].dir.endsWith("b"));

    fs.rmSync(tmp, { recursive: true });
  });

  it("uses question from orchard config if present", () => {
    const tmp = makeTmpDir();
    const sprintDir = path.join(tmp, "s");
    fs.mkdirSync(sprintDir, { recursive: true });
    // No claims.json, but question in config

    const config = {
      sprints: [
        {
          path: "s",
          status: "not-started",
          depends_on: [],
          question: "From config",
        },
      ],
    };

    const result = emitInstructions(config, tmp);
    assert.equal(result.length, 1);
    assert.equal(result[0].question, "From config");

    fs.rmSync(tmp, { recursive: true });
  });
});
