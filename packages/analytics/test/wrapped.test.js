/**
 * Unit tests: lib/wrapped.js
 *
 * generateWrapped produces a "Sprint Wrapped" summary from sprint objects.
 * Covers:
 *   - generateWrapped: happy path shape (period, personality, stats, highlights)
 *   - empty input (no sprints): returns zeroed stats + no-claim handling
 *   - computeWrappedStats: type/evidence distribution, tag + topic counts
 *   - detectPersonality: each archetype fires when its detect heuristic matches
 *   - ARCHETYPES export: shape and falls-back to "balanced"
 *   - tokenSummary integration when a token report is passed in
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateWrapped,
  computeWrappedStats,
  detectPersonality,
  ARCHETYPES,
} from "../lib/wrapped.js";

const NOW = new Date().toISOString();

function makeSprint(name, claims) {
  return { name, dir: `/tmp/${name}`, claims, compilation: null, gitLog: [] };
}

const BASE_CLAIMS = [
  {
    id: "r001",
    type: "factual",
    evidence: "documented",
    status: "active",
    text: "Fact 1",
    topic: "topic-a",
    tags: ["alpha"],
    timestamp: NOW,
  },
  {
    id: "r002",
    type: "factual",
    evidence: "tested",
    status: "active",
    text: "Fact 2",
    topic: "topic-a",
    tags: ["alpha", "beta"],
    timestamp: NOW,
  },
  {
    id: "p001",
    type: "recommendation",
    evidence: "tested",
    status: "active",
    text: "Rec 1",
    topic: "topic-b",
    tags: ["beta"],
    timestamp: NOW,
  },
];

describe("wrapped: ARCHETYPES export", () => {
  it("has the expected keys with label + description", () => {
    for (const key of [
      "challenger",
      "prototyper",
      "scholar",
      "strategist",
      "sentinel",
      "explorer",
      "balanced",
    ]) {
      assert.ok(ARCHETYPES[key], `missing archetype ${key}`);
      assert.equal(typeof ARCHETYPES[key].label, "string");
      assert.equal(typeof ARCHETYPES[key].description, "string");
      assert.equal(typeof ARCHETYPES[key].detect, "function");
    }
  });
});

describe("wrapped: generateWrapped (happy path)", () => {
  it("returns a report with period, personality, stats, and shareCard", () => {
    const sprint = makeSprint("test", BASE_CLAIMS);
    const r = generateWrapped([sprint]);
    assert.equal(r.sprintCount, 1);
    assert.ok(r.period);
    assert.ok(r.personality);
    assert.ok(r.personality.id);
    assert.ok(r.personality.label);
    assert.ok(r.stats);
    assert.equal(r.stats.totalClaims, 3);
    assert.ok(Array.isArray(r.highlights));
    assert.ok(r.shareCard);
    assert.equal(r.shareCard.sprintCount, 1);
    assert.equal(r.shareCard.totalClaims, 3);
    assert.equal(r.shareCard.personality, r.personality.label);
  });

  it("tierProgression is null when fewer than 2 sprints", () => {
    const sprint = makeSprint("solo", BASE_CLAIMS);
    const r = generateWrapped([sprint]);
    assert.equal(r.tierProgression, null);
  });

  it("tierProgression is computed across multiple sprints", () => {
    const s1 = makeSprint("s1", [
      {
        id: "r001",
        type: "factual",
        evidence: "stated",
        status: "active",
        text: "x",
        timestamp: NOW,
      },
    ]);
    const s2 = makeSprint("s2", [
      {
        id: "r002",
        type: "factual",
        evidence: "production",
        status: "active",
        text: "y",
        timestamp: NOW,
      },
    ]);
    const r = generateWrapped([s1, s2]);
    assert.ok(r.tierProgression);
    assert.ok(
      ["improving", "declining", "stable"].includes(r.tierProgression.trend),
    );
    assert.equal(r.tierProgression.sprints.length, 2);
  });

  it("integrates tokenSummary when opts.tokenReport is provided", () => {
    const sprint = makeSprint("tok", BASE_CLAIMS);
    const tokenReport = {
      summary: {
        totalCostUsd: 1.23,
        costPerVerifiedClaim: 0.05,
        avgCostPerSprint: 0.5,
      },
      costTrend: { direction: "improving", changePercent: -30 },
    };
    const r = generateWrapped([sprint], { tokenReport });
    assert.ok(r.tokenSummary);
    assert.equal(r.tokenSummary.totalCostUsd, 1.23);
    assert.equal(r.tokenSummary.costPerVerifiedClaim, 0.05);
    assert.equal(r.tokenSummary.costTrend.direction, "improving");
  });
});

describe("wrapped: generateWrapped (boundary / empty)", () => {
  it("handles an empty sprint list", () => {
    const r = generateWrapped([]);
    assert.equal(r.sprintCount, 0);
    assert.equal(r.stats.totalClaims, 0);
    assert.deepEqual(r.stats.typeDistribution, {});
    assert.deepEqual(r.stats.topTags, []);
    assert.equal(r.period.label, "All time");
  });

  it("handles sprints with no claims", () => {
    const r = generateWrapped([makeSprint("empty", [])]);
    assert.equal(r.sprintCount, 1);
    assert.equal(r.stats.totalClaims, 0);
    assert.equal(r.stats.avgClaimsPerSprint, 0);
  });
});

describe("wrapped: computeWrappedStats", () => {
  it("counts type + evidence distributions and tags", () => {
    const s = computeWrappedStats([makeSprint("t", BASE_CLAIMS)]);
    assert.equal(s.totalClaims, 3);
    assert.equal(s.typeDistribution.factual, 2);
    assert.equal(s.typeDistribution.recommendation, 1);
    assert.equal(s.evidenceDistribution.tested, 2);
    assert.equal(s.evidenceDistribution.documented, 1);
    // topTags sorted by count desc (alpha and beta both appear 2x)
    const alphaEntry = s.topTags.find((t) => t.tag === "alpha");
    const betaEntry = s.topTags.find((t) => t.tag === "beta");
    assert.equal(alphaEntry.count, 2);
    assert.equal(betaEntry.count, 2);
    // topTopics
    assert.ok(s.topTopics.find((t) => t.topic === "topic-a").count === 2);
  });

  it("supports object-shape evidence ({ tier: ... })", () => {
    const s = computeWrappedStats([
      makeSprint("obj", [
        {
          id: "r001",
          type: "factual",
          evidence: { tier: "tested" },
          status: "active",
          text: "x",
        },
      ]),
    ]);
    assert.equal(s.evidenceDistribution.tested, 1);
  });

  it("counts challenge claims by x-prefixed ID", () => {
    const s = computeWrappedStats([
      makeSprint("c", [
        {
          id: "x001",
          type: "risk",
          evidence: "web",
          status: "active",
          text: "y",
        },
        {
          id: "r001",
          type: "factual",
          evidence: "web",
          status: "active",
          text: "z",
        },
      ]),
    ]);
    // challengeRatio = (1 x-prefixed + 0 contested) / 2 = 0.5
    assert.ok(s.challengeRatio > 0.4 && s.challengeRatio < 0.6);
  });
});

describe("wrapped: detectPersonality", () => {
  it("selects 'challenger' when challengeRatio > 0.15", () => {
    const p = detectPersonality({ challengeRatio: 0.3 });
    assert.equal(p.id, "challenger");
  });

  it("selects 'prototyper' when testedRatio > 0.25", () => {
    const p = detectPersonality({ challengeRatio: 0, testedRatio: 0.3 });
    assert.equal(p.id, "prototyper");
  });

  it("selects 'scholar' when factualRatio > 0.45 and documentedRatio > 0.2", () => {
    const p = detectPersonality({
      challengeRatio: 0,
      testedRatio: 0,
      factualRatio: 0.6,
      documentedRatio: 0.3,
    });
    assert.equal(p.id, "scholar");
  });

  it("selects 'strategist' when recommendationRatio > 0.2", () => {
    const p = detectPersonality({
      challengeRatio: 0,
      testedRatio: 0,
      factualRatio: 0,
      documentedRatio: 0,
      recommendationRatio: 0.25,
    });
    assert.equal(p.id, "strategist");
  });

  it("selects 'sentinel' when riskRatio > 0.15", () => {
    const p = detectPersonality({
      challengeRatio: 0,
      testedRatio: 0,
      factualRatio: 0,
      documentedRatio: 0,
      recommendationRatio: 0,
      riskRatio: 0.3,
    });
    assert.equal(p.id, "sentinel");
  });

  it("selects 'explorer' when topicDiversity > 0.7", () => {
    const p = detectPersonality({
      challengeRatio: 0,
      testedRatio: 0,
      factualRatio: 0,
      documentedRatio: 0,
      recommendationRatio: 0,
      riskRatio: 0,
      topicDiversity: 0.9,
    });
    assert.equal(p.id, "explorer");
  });

  it("falls back to 'balanced' when no archetype matches", () => {
    const p = detectPersonality({
      challengeRatio: 0,
      testedRatio: 0,
      factualRatio: 0,
      documentedRatio: 0,
      recommendationRatio: 0,
      riskRatio: 0,
      topicDiversity: 0,
    });
    assert.equal(p.id, "balanced");
  });

  it("returned personality carries a confidence in [0,1]", () => {
    const p = detectPersonality({ challengeRatio: 0.3 });
    assert.ok(typeof p.confidence === "number");
    assert.ok(p.confidence >= 0 && p.confidence <= 1);
  });
});
