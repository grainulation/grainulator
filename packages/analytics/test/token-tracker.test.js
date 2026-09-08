/**
 * Unit tests: lib/token-tracker.js
 *
 * Exercises the sprint_outcomes.jsonl reader/aggregator:
 *   - loadOutcomes: happy path, missing file, malformed lines skipped
 *   - appendOutcome: writes a line with timestamp, round-trips via loadOutcomes
 *   - trackCosts: happy path aggregation (totals, per-sprint, breakdowns),
 *     empty dir (zeros + insight), cost trend improving/worsening/stable
 *
 * All disk I/O uses a per-test tempdir — no user-state pollution.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  loadOutcomes,
  appendOutcome,
  trackCosts,
  OUTCOMES_FILE,
} from "../lib/token-tracker.js";

let dir;

function makeEntry(overrides = {}) {
  return {
    sprint: "test-sprint",
    timestamp: "2026-01-01T00:00:00Z",
    total_cost_usd: 0.1,
    claims_count: 5,
    verified_claims_count: 3,
    model: "claude-opus-4-6",
    phase: "research",
    ...overrides,
  };
}

describe("token-tracker: OUTCOMES_FILE constant", () => {
  it("is 'sprint_outcomes.jsonl'", () => {
    assert.equal(OUTCOMES_FILE, "sprint_outcomes.jsonl");
  });
});

describe("token-tracker: loadOutcomes", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "harvest-track-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the file is missing", () => {
    assert.deepEqual(loadOutcomes(dir), []);
  });

  it("parses valid JSONL entries", () => {
    const p = path.join(dir, OUTCOMES_FILE);
    fs.writeFileSync(
      p,
      [
        JSON.stringify(makeEntry({ sprint: "a" })),
        JSON.stringify(makeEntry({ sprint: "b" })),
      ].join("\n") + "\n",
    );
    const out = loadOutcomes(dir);
    assert.equal(out.length, 2);
    assert.equal(out[0].sprint, "a");
    assert.equal(out[1].sprint, "b");
  });

  it("skips malformed lines silently", () => {
    const p = path.join(dir, OUTCOMES_FILE);
    fs.writeFileSync(
      p,
      [
        JSON.stringify(makeEntry({ sprint: "a" })),
        "{not json",
        JSON.stringify(makeEntry({ sprint: "b" })),
      ].join("\n") + "\n",
    );
    const out = loadOutcomes(dir);
    assert.equal(out.length, 2);
    assert.equal(out[0].sprint, "a");
    assert.equal(out[1].sprint, "b");
  });

  it("ignores blank lines", () => {
    const p = path.join(dir, OUTCOMES_FILE);
    fs.writeFileSync(p, "\n\n" + JSON.stringify(makeEntry()) + "\n\n");
    assert.equal(loadOutcomes(dir).length, 1);
  });
});

describe("token-tracker: appendOutcome", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "harvest-append-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("appends a line with an auto-generated timestamp when omitted", () => {
    appendOutcome(dir, {
      sprint: "s1",
      total_cost_usd: 0.01,
      claims_count: 1,
      verified_claims_count: 1,
    });
    const out = loadOutcomes(dir);
    assert.equal(out.length, 1);
    assert.equal(out[0].sprint, "s1");
    assert.ok(out[0].timestamp, "should have auto-generated timestamp");
    assert.match(out[0].timestamp, /\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves an explicit timestamp", () => {
    appendOutcome(dir, {
      sprint: "s1",
      timestamp: "2025-12-31T00:00:00Z",
      total_cost_usd: 0,
    });
    const out = loadOutcomes(dir);
    assert.equal(out[0].timestamp, "2025-12-31T00:00:00Z");
  });

  it("is append-only (multiple calls stack)", () => {
    appendOutcome(dir, { sprint: "a" });
    appendOutcome(dir, { sprint: "b" });
    appendOutcome(dir, { sprint: "c" });
    const out = loadOutcomes(dir);
    assert.deepEqual(
      out.map((e) => e.sprint),
      ["a", "b", "c"],
    );
  });
});

describe("token-tracker: trackCosts", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "harvest-track-costs-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns zeroed summary when no outcomes file", () => {
    const r = trackCosts(dir);
    assert.equal(r.summary.totalEntries, 0);
    assert.equal(r.summary.totalCostUsd, 0);
    assert.equal(r.summary.costPerVerifiedClaim, null);
    assert.deepEqual(r.perSprint, []);
    assert.match(r.insight, /No sprint outcome data/);
  });

  it("aggregates totals and per-sprint breakdown (happy path)", () => {
    const entries = [
      makeEntry({
        sprint: "s1",
        timestamp: "2026-01-01T00:00:00Z",
        total_cost_usd: 0.1,
        claims_count: 10,
        verified_claims_count: 5,
      }),
      makeEntry({
        sprint: "s1",
        timestamp: "2026-01-02T00:00:00Z",
        total_cost_usd: 0.05,
        claims_count: 2,
        verified_claims_count: 2,
      }),
      makeEntry({
        sprint: "s2",
        timestamp: "2026-01-03T00:00:00Z",
        total_cost_usd: 0.2,
        claims_count: 4,
        verified_claims_count: 4,
      }),
    ];
    fs.writeFileSync(
      path.join(dir, OUTCOMES_FILE),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const r = trackCosts(dir);
    assert.equal(r.summary.totalEntries, 3);
    assert.equal(r.summary.totalSprints, 2);
    assert.ok(Math.abs(r.summary.totalCostUsd - 0.35) < 1e-9);
    assert.equal(r.summary.totalClaims, 16);
    assert.equal(r.summary.totalVerifiedClaims, 11);
    assert.ok(r.summary.costPerVerifiedClaim > 0);
    assert.ok(r.summary.costPerClaim > 0);
    assert.equal(r.perSprint.length, 2);
    // Sprint s1 should have 2 entries and $0.15 total
    const s1 = r.perSprint.find((s) => s.sprint === "s1");
    assert.ok(Math.abs(s1.cost - 0.15) < 1e-9);
    assert.equal(s1.entries, 2);
    assert.equal(s1.claims, 12);
    assert.equal(s1.verifiedClaims, 7);
    // Model + phase breakdowns
    assert.ok(r.modelBreakdown["claude-opus-4-6"] > 0);
    assert.ok(r.phaseBreakdown.research > 0);
  });

  it("detects improving cost trend across >= 4 sprints", () => {
    // 4 sprints: first two expensive, last two cheap.
    const entries = [
      makeEntry({
        sprint: "s1",
        timestamp: "2026-01-01T00:00:00Z",
        total_cost_usd: 1.0,
        claims_count: 1,
        verified_claims_count: 1,
      }),
      makeEntry({
        sprint: "s2",
        timestamp: "2026-01-02T00:00:00Z",
        total_cost_usd: 0.9,
        claims_count: 1,
        verified_claims_count: 1,
      }),
      makeEntry({
        sprint: "s3",
        timestamp: "2026-01-03T00:00:00Z",
        total_cost_usd: 0.1,
        claims_count: 1,
        verified_claims_count: 1,
      }),
      makeEntry({
        sprint: "s4",
        timestamp: "2026-01-04T00:00:00Z",
        total_cost_usd: 0.05,
        claims_count: 1,
        verified_claims_count: 1,
      }),
    ];
    fs.writeFileSync(
      path.join(dir, OUTCOMES_FILE),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const r = trackCosts(dir);
    assert.ok(r.costTrend);
    assert.equal(r.costTrend.direction, "improving");
    assert.ok(r.costTrend.firstHalfAvg > r.costTrend.secondHalfAvg);
  });

  it("falls back to computeCost when total_cost_usd is absent", () => {
    // No total_cost_usd — tracker should derive via computeCost.
    const entry = {
      sprint: "compute",
      timestamp: "2026-01-01T00:00:00Z",
      input_tokens: 100_000,
      output_tokens: 10_000,
      claims_count: 2,
      verified_claims_count: 2,
      model: "claude-opus-4-6",
      phase: "research",
    };
    fs.writeFileSync(
      path.join(dir, OUTCOMES_FILE),
      JSON.stringify(entry) + "\n",
    );
    const r = trackCosts(dir);
    assert.ok(r.summary.totalCostUsd > 0, "should derive a positive cost");
  });
});
