import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { analyze } from "../lib/analyzer.js";
import { calibrate } from "../lib/calibration.js";
import { detectPatterns } from "../lib/patterns.js";
import { checkDecay, decayAlerts, DEFAULT_HALF_LIVES } from "../lib/decay.js";
import { measureVelocity } from "../lib/velocity.js";
import { analyzeTokens, computeCost, DEFAULT_PRICING } from "../lib/tokens.js";
import {
  generateCard,
  computeReportStats,
  getSeason,
  detectArchetype,
  detectMilestones,
} from "../lib/harvest-card.js";

// --- Test fixtures ---

function makeSprint(name, claims, gitLog) {
  return {
    name,
    dir: `/tmp/${name}`,
    claims,
    compilation: null,
    gitLog: gitLog || [],
  };
}

const NOW = new Date().toISOString();
const OLD_DATE = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(); // 120 days ago
const RECENT_DATE = new Date(
  Date.now() - 5 * 24 * 60 * 60 * 1000,
).toISOString(); // 5 days ago

const SAMPLE_CLAIMS = [
  {
    id: "d001",
    type: "constraint",
    evidence: "stated",
    status: "active",
    text: "Must use zero deps",
    created: OLD_DATE,
  },
  {
    id: "r001",
    type: "factual",
    evidence: "documented",
    status: "active",
    text: "Node fs.watch works on macOS",
    created: OLD_DATE,
    tags: ["node", "fs"],
  },
  {
    id: "r002",
    type: "factual",
    evidence: "web",
    status: "active",
    text: "SSE supported in all browsers",
    created: OLD_DATE,
    tags: ["sse", "browser"],
  },
  {
    id: "p001",
    type: "estimate",
    evidence: "tested",
    status: "active",
    text: "Prototype handles 100 concurrent connections",
    created: RECENT_DATE,
    confidence: "high",
    tags: ["perf"],
  },
  {
    id: "p002",
    type: "recommendation",
    evidence: "tested",
    status: "active",
    text: "Use SSE for real-time updates",
    created: RECENT_DATE,
  },
  {
    id: "x001",
    type: "risk",
    evidence: "documented",
    status: "contested",
    text: "fs.watch may miss events on Linux",
    created: RECENT_DATE,
  },
  {
    id: "e001",
    type: "estimate",
    evidence: "stated",
    status: "active",
    text: "Migration takes 2 weeks",
    created: OLD_DATE,
    confidence: 0.8,
    tags: ["perf"],
  },
  {
    id: "cal001",
    type: "calibration",
    evidence: "production",
    status: "active",
    text: "Migration actually took 3 weeks",
    created: NOW,
    references: ["e001"],
    accurate: false,
    delta: 1,
  },
];

const SAMPLE_SPRINT = makeSprint("test-sprint", SAMPLE_CLAIMS);

// --- Analyzer tests ---

describe("analyzer", () => {
  it("counts claims correctly", () => {
    const result = analyze([SAMPLE_SPRINT]);
    assert.equal(result.summary.totalSprints, 1);
    assert.equal(result.summary.totalClaims, SAMPLE_CLAIMS.length);
  });

  it("computes type distribution", () => {
    const result = analyze([SAMPLE_SPRINT]);
    assert.equal(result.typeDistribution.factual, 2);
    assert.equal(result.typeDistribution.estimate, 2);
    assert.equal(result.typeDistribution.recommendation, 1);
  });

  it("finds weak claims", () => {
    const result = analyze([SAMPLE_SPRINT]);
    const weakIds = result.weakClaims.map((c) => c.id);
    assert.ok(weakIds.includes("d001")); // stated
    assert.ok(weakIds.includes("r002")); // web
    assert.ok(weakIds.includes("e001")); // stated
  });

  it("tracks tag frequency", () => {
    const result = analyze([SAMPLE_SPRINT]);
    assert.equal(result.tagFrequency.perf, 2);
    assert.equal(result.tagFrequency.node, 1);
  });

  it("handles empty sprints", () => {
    const empty = makeSprint("empty", []);
    const result = analyze([empty]);
    assert.equal(result.summary.totalClaims, 0);
    assert.equal(result.summary.averageClaimsPerSprint, 0);
  });

  it("handles multiple sprints", () => {
    const sprint2 = makeSprint("sprint-2", [
      {
        id: "r010",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: "Another fact",
      },
    ]);
    const result = analyze([SAMPLE_SPRINT, sprint2]);
    assert.equal(result.summary.totalSprints, 2);
    assert.equal(result.summary.totalClaims, SAMPLE_CLAIMS.length + 1);
  });
});

// --- Calibration tests ---

describe("calibration", () => {
  it("matches calibration to estimates", () => {
    const result = calibrate([SAMPLE_SPRINT]);
    assert.equal(result.summary.totalEstimates, 2);
    assert.equal(result.summary.totalCalibrations, 1);
    assert.equal(result.summary.matched, 1);
  });

  it("identifies unmatched estimates", () => {
    const result = calibrate([SAMPLE_SPRINT]);
    assert.equal(result.summary.unmatched, 1);
    assert.equal(result.unmatchedEstimates[0].id, "p001");
  });

  it("computes accuracy rate", () => {
    const result = calibrate([SAMPLE_SPRINT]);
    assert.equal(result.summary.accuracyRate, 0); // cal001 says accurate: false
  });

  it("handles no estimates", () => {
    const sprint = makeSprint("no-est", [
      {
        id: "r001",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: "A fact",
      },
    ]);
    const result = calibrate([sprint]);
    assert.equal(result.summary.totalEstimates, 0);
    assert.equal(result.summary.accuracyRate, null);
  });
});

// --- Patterns tests ---

describe("patterns", () => {
  it("detects prototype-before-recommend", () => {
    const result = detectPatterns([SAMPLE_SPRINT]);
    const protoPattern = result.patterns.find(
      (p) => p.pattern === "prototype-before-recommend",
    );
    assert.ok(protoPattern, "Should detect prototype-before-recommend pattern");
  });

  it("detects adversarial testing", () => {
    const result = detectPatterns([SAMPLE_SPRINT]);
    const challenge = result.patterns.find(
      (p) => p.pattern === "adversarial-testing",
    );
    assert.ok(challenge, "Should detect adversarial-testing pattern");
  });

  it("detects recommend-without-research anti-pattern", () => {
    const sprint = makeSprint("no-research", [
      {
        id: "p001",
        type: "recommendation",
        evidence: "stated",
        status: "active",
        text: "Just do it",
      },
      {
        id: "p002",
        type: "recommendation",
        evidence: "stated",
        status: "active",
        text: "And this too",
      },
    ]);
    const result = detectPatterns([sprint]);
    const antiPattern = result.antiPatterns.find(
      (p) => p.pattern === "recommend-without-research",
    );
    assert.ok(antiPattern, "Should detect recommend-without-research");
  });

  it("handles empty sprint", () => {
    const result = detectPatterns([makeSprint("empty", [])]);
    assert.equal(result.summary.patternsFound, 0);
    assert.equal(result.summary.antiPatternsFound, 0);
  });
});

// --- Decay tests ---

describe("decay", () => {
  it("finds stale claims with volatile evidence", () => {
    const result = checkDecay([SAMPLE_SPRINT], { thresholdDays: 90 });
    const staleIds = result.stale.map((c) => c.id);
    assert.ok(
      staleIds.includes("d001") || result.decaying.some((c) => c.id === "d001"),
      "Old stated claim should be flagged",
    );
  });

  it("finds unresolved challenged claims", () => {
    const result = checkDecay([SAMPLE_SPRINT]);
    const unresolvedIds = result.unresolved.map((c) => c.id);
    assert.ok(
      unresolvedIds.includes("x001"),
      "Contested claim should be unresolved",
    );
  });

  it("respects custom threshold", () => {
    const result = checkDecay([SAMPLE_SPRINT], { thresholdDays: 200 });
    // With 200-day threshold, 120-day-old claims should not be stale
    assert.equal(result.summary.staleCount, 0);
  });

  it("handles claims without dates", () => {
    const sprint = makeSprint("no-dates", [
      {
        id: "r001",
        type: "factual",
        evidence: "web",
        status: "active",
        text: "No date",
      },
    ]);
    const result = checkDecay([sprint]);
    assert.equal(result.summary.staleCount, 0);
    assert.equal(result.summary.decayingCount, 0);
  });
});

// --- Velocity tests ---

describe("velocity", () => {
  it("computes sprint duration", () => {
    const result = measureVelocity([SAMPLE_SPRINT]);
    const sprint = result.sprints[0];
    assert.ok(sprint.durationDays > 0, "Duration should be positive");
  });

  it("computes claims per day", () => {
    const result = measureVelocity([SAMPLE_SPRINT]);
    const sprint = result.sprints[0];
    assert.ok(sprint.claimsPerDay > 0, "Claims per day should be positive");
  });

  it("extracts phase timings", () => {
    const result = measureVelocity([SAMPLE_SPRINT]);
    const phases = result.sprints[0].phases;
    assert.ok(phases.research, "Should have research phase");
    assert.ok(phases.prototype, "Should have prototype phase");
  });

  it("handles sprint with insufficient data", () => {
    const sprint = makeSprint("no-time", [
      {
        id: "r001",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: "No dates",
      },
    ]);
    const result = measureVelocity([sprint]);
    assert.equal(result.sprints[0].durationDays, null);
  });

  it("detects stalls", () => {
    const dates = [
      new Date(Date.now() - 30 * 86400000).toISOString(),
      new Date(Date.now() - 25 * 86400000).toISOString(),
      // 20-day gap
      new Date(Date.now() - 5 * 86400000).toISOString(),
    ];
    const sprint = makeSprint("stall-test", [
      {
        id: "r001",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: "A",
        created: dates[0],
      },
      {
        id: "r002",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: "B",
        created: dates[1],
      },
      {
        id: "r003",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: "C",
        created: dates[2],
      },
    ]);
    const result = measureVelocity([sprint]);
    assert.ok(result.sprints[0].stalls.length > 0, "Should detect a stall");
  });
});

// --- Token cost tracking tests ---

describe("tokens", () => {
  it("computes cost from token usage", () => {
    const usage = {
      input_tokens: 100_000,
      output_tokens: 10_000,
      cache_read_input_tokens: 50_000,
      cache_creation_input_tokens: 20_000,
    };
    const result = computeCost(usage, "claude-opus-4-6");
    assert.ok(result.totalCostUsd > 0, "Should compute a positive cost");
    assert.ok(result.breakdown.input > 0);
    assert.ok(result.breakdown.output > 0);
    assert.equal(result.tokens.total, 180_000);
  });

  it("computes cost per verified claim", () => {
    const sprint = makeSprint("token-test", [
      {
        id: "r001",
        type: "factual",
        evidence: "documented",
        status: "active",
        text: "Fact 1",
      },
      {
        id: "r002",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: "Fact 2",
      },
      {
        id: "d001",
        type: "constraint",
        evidence: "stated",
        status: "active",
        text: "Constraint",
      },
    ]);
    sprint.tokenUsage = {
      input_tokens: 50_000,
      output_tokens: 5_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      model: "claude-opus-4-6",
    };
    const result = analyzeTokens([sprint]);
    assert.equal(result.summary.totalClaims, 3);
    assert.equal(result.summary.totalVerifiedClaims, 2); // documented + tested
    assert.ok(result.summary.costPerVerifiedClaim > 0);
    assert.ok(result.summary.costPerClaim > 0);
  });

  it("handles sprints without token data", () => {
    const result = analyzeTokens([SAMPLE_SPRINT]);
    assert.equal(result.summary.sprintsWithUsageData, 0);
    assert.equal(result.summary.totalCostUsd, 0);
    assert.ok(result.insight.includes("No token usage data"));
  });

  it("uses default pricing for unknown models", () => {
    const result = computeCost({ input_tokens: 1_000_000 }, "unknown-model");
    // Falls back to opus pricing: $5/MTok
    assert.equal(result.breakdown.input, 5);
  });
});

// --- Calibration curve tests ---

describe("calibration curves", () => {
  it("computes Brier score", () => {
    const sprint = makeSprint("brier-test", [
      {
        id: "e001",
        type: "estimate",
        evidence: "tested",
        status: "active",
        text: "Est 1",
        confidence: 0.8,
        tags: ["alpha"],
        created: NOW,
      },
      {
        id: "e002",
        type: "estimate",
        evidence: "tested",
        status: "active",
        text: "Est 2",
        confidence: 0.3,
        tags: ["beta"],
        created: NOW,
      },
      {
        id: "cal001",
        type: "calibration",
        evidence: "production",
        status: "active",
        text: "Cal 1",
        references: ["e001"],
        accurate: true,
        created: NOW,
      },
      {
        id: "cal002",
        type: "calibration",
        evidence: "production",
        status: "active",
        text: "Cal 2",
        references: ["e002"],
        accurate: false,
        created: NOW,
      },
    ]);
    const result = calibrate([sprint]);
    assert.ok(result.brierScore, "Should have brierScore");
    assert.ok(
      result.brierScore.score !== null,
      "Brier score should not be null",
    );
    assert.ok(
      result.brierScore.score >= 0 && result.brierScore.score <= 1,
      "Brier score should be 0-1",
    );
    assert.equal(result.brierScore.n, 2);
  });

  it("builds calibration curve bins", () => {
    const sprint = makeSprint("curve-test", [
      {
        id: "e001",
        type: "estimate",
        evidence: "tested",
        status: "active",
        text: "High conf",
        confidence: 0.9,
        created: NOW,
      },
      {
        id: "e002",
        type: "estimate",
        evidence: "tested",
        status: "active",
        text: "Low conf",
        confidence: 0.2,
        created: NOW,
      },
      {
        id: "cal001",
        type: "calibration",
        evidence: "production",
        status: "active",
        text: "Cal 1",
        references: ["e001"],
        accurate: true,
        created: NOW,
      },
      {
        id: "cal002",
        type: "calibration",
        evidence: "production",
        status: "active",
        text: "Cal 2",
        references: ["e002"],
        accurate: true,
        created: NOW,
      },
    ]);
    const result = calibrate([sprint]);
    assert.ok(result.calibrationCurve, "Should have calibrationCurve");
    assert.ok(
      Array.isArray(result.calibrationCurve.bins),
      "Should have bins array",
    );
    assert.equal(result.calibrationCurve.bins.length, 5);
  });

  it("detects overconfidence bias", () => {
    const claims = [];
    // High-confidence predictions that fail
    for (let i = 0; i < 5; i++) {
      claims.push({
        id: `e${i}`,
        type: "estimate",
        evidence: "tested",
        status: "active",
        text: `Est ${i}`,
        confidence: 0.9,
        created: NOW,
      });
      claims.push({
        id: `cal${i}`,
        type: "calibration",
        evidence: "production",
        status: "active",
        text: `Cal ${i}`,
        references: [`e${i}`],
        accurate: false,
        created: NOW,
      });
    }
    const sprint = makeSprint("overconf-test", claims);
    const result = calibrate([sprint]);
    // With 5 high-confidence misses, should detect overconfidence
    assert.ok(result.calibrationCurve);
  });

  it("includes Brier score in summary", () => {
    const sprint = makeSprint("summary-test", [
      {
        id: "e001",
        type: "estimate",
        evidence: "tested",
        status: "active",
        text: "Est",
        confidence: 0.5,
        created: NOW,
      },
      {
        id: "cal001",
        type: "calibration",
        evidence: "production",
        status: "active",
        text: "Cal",
        references: ["e001"],
        accurate: true,
        created: NOW,
      },
    ]);
    const result = calibrate([sprint]);
    assert.ok(
      "brierScore" in result.summary,
      "summary should include brierScore",
    );
  });
});

// --- Decay alerts tests ---

describe("decay alerts", () => {
  it("generates topic-aware alerts", () => {
    const sprint = makeSprint("decay-alert-test", [
      {
        id: "r001",
        type: "factual",
        evidence: "web",
        status: "active",
        text: "AI claim",
        topic: "ai-models",
        created: OLD_DATE,
        tags: ["ai"],
      },
      {
        id: "r002",
        type: "factual",
        evidence: "documented",
        status: "active",
        text: "Architecture claim",
        topic: "system-architecture",
        created: OLD_DATE,
        tags: ["architecture"],
      },
    ]);
    const result = decayAlerts([sprint]);
    assert.ok(result.summary.totalAlerts > 0, "Should have alerts");
    // AI claim (42-day half-life) should be more urgent than architecture (180-day)
    const aiAlert = result.alerts.find((a) => a.id === "r001");
    const archAlert = result.alerts.find((a) => a.id === "r002");
    assert.ok(aiAlert, "AI claim should have an alert");
    assert.ok(
      aiAlert.decayRatio > (archAlert ? archAlert.decayRatio : 0),
      "AI claim should decay faster",
    );
  });

  it("assigns tiered urgency levels", () => {
    const veryOld = new Date(
      Date.now() - 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const sprint = makeSprint("urgency-test", [
      {
        id: "r001",
        type: "factual",
        evidence: "web",
        status: "active",
        text: "Very old claim",
        topic: "security",
        created: veryOld,
        tags: ["security"],
      },
    ]);
    const result = decayAlerts([sprint]);
    const alert = result.alerts.find((a) => a.id === "r001");
    assert.ok(alert, "Should have alert for very old security claim");
    assert.equal(
      alert.urgency,
      "urgent",
      "Year-old security claim should be urgent",
    );
  });

  it("groups alerts by urgency", () => {
    const result = decayAlerts([SAMPLE_SPRINT]);
    assert.ok("urgent" in result.byUrgency);
    assert.ok("active" in result.byUrgency);
    assert.ok("passive" in result.byUrgency);
  });

  it("computes topic decay rates", () => {
    const sprint = makeSprint("topic-rates", [
      {
        id: "r001",
        type: "factual",
        evidence: "web",
        status: "active",
        text: "Claim 1",
        topic: "ai-research",
        created: OLD_DATE,
        tags: ["ai"],
      },
      {
        id: "r002",
        type: "factual",
        evidence: "web",
        status: "active",
        text: "Claim 2",
        topic: "ai-research",
        created: OLD_DATE,
        tags: ["ai"],
      },
    ]);
    const result = decayAlerts([sprint]);
    assert.ok(
      result.topicDecayRates.length > 0,
      "Should have topic decay rates",
    );
  });

  it("exports DEFAULT_HALF_LIVES", () => {
    assert.ok(DEFAULT_HALF_LIVES.ai === 42);
    assert.ok(DEFAULT_HALF_LIVES.security === 14);
    assert.ok(DEFAULT_HALF_LIVES.architecture === 180);
  });
});

// --- Harvest card tests ---

describe("harvest card", () => {
  it("generates SVG card", () => {
    const { svg, stats } = generateCard([SAMPLE_SPRINT]);
    assert.ok(svg.includes("<svg"), "Output should be SVG");
    assert.ok(svg.includes('viewBox="0 0 1200 630"'), "Should be 1200x630");
    assert.ok(
      svg.includes('role="img"'),
      "Should have role=img for accessibility",
    );
    assert.ok(svg.includes("<title"), "Should have title for accessibility");
    assert.ok(stats.totalSprints === 1);
    assert.ok(stats.totalClaims === SAMPLE_CLAIMS.length);
  });

  it("detects researcher archetype", () => {
    const stats = computeReportStats([SAMPLE_SPRINT]);
    assert.ok(stats.archetype, "Should have archetype");
    assert.ok(stats.archetype.label, "Archetype should have label");
    assert.ok(stats.archetype.id, "Archetype should have id");
  });

  it("detects milestones", () => {
    const milestones = detectMilestones([SAMPLE_SPRINT]);
    assert.ok(milestones.length > 0, "Should detect milestones");
    const firstTypes = milestones.filter((m) => m.kind === "first");
    assert.ok(firstTypes.length > 0, "Should detect first-use milestones");
    const records = milestones.filter((m) => m.kind === "record");
    assert.ok(records.length > 0, "Should detect record milestones");
  });

  it("detects correct season", () => {
    // March 21 should be Spring
    const spring = getSeason(new Date(2026, 2, 21));
    assert.equal(spring.name, "Spring");
    // January 1 should be Winter of previous year
    const winter = getSeason(new Date(2026, 0, 1));
    assert.equal(winter.name, "Winter");
    assert.equal(winter.year, 2025);
    // July 1 should be Summer
    const summer = getSeason(new Date(2026, 6, 1));
    assert.equal(summer.name, "Summer");
  });

  it("handles empty sprints gracefully", () => {
    const empty = makeSprint("empty", []);
    const { svg, stats } = generateCard([empty]);
    assert.ok(svg.includes("<svg"), "Should still generate SVG");
    assert.equal(stats.totalClaims, 0);
  });

  it("includes calibration curve in card when data available", () => {
    const sprint = makeSprint("cal-card-test", [
      {
        id: "e001",
        type: "estimate",
        evidence: "tested",
        status: "active",
        text: "Est",
        confidence: 0.8,
        created: NOW,
      },
      {
        id: "cal001",
        type: "calibration",
        evidence: "production",
        status: "active",
        text: "Cal",
        references: ["e001"],
        accurate: true,
        created: NOW,
      },
    ]);
    const { svg } = generateCard([sprint]);
    assert.ok(
      svg.includes("CALIBRATION"),
      "Should include calibration section in card",
    );
  });

  it("escapes XML in card output", () => {
    const sprint = makeSprint("xss-test", [
      {
        id: "r001",
        type: "factual",
        evidence: "tested",
        status: "active",
        text: '<script>alert("xss")</script>',
        topic: '"><img onerror=alert(1)>',
        created: NOW,
      },
    ]);
    const { svg } = generateCard([sprint]);
    assert.ok(
      !svg.includes("<script>"),
      "Should not contain unescaped script tags",
    );
  });
});
