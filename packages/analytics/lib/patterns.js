/**
 * Decision pattern detection.
 *
 * Analyzes what research approaches lead to better outcomes by examining:
 * - Which command sequences produce the most well-evidenced claims
 * - Whether prototyping before recommending leads to better accuracy
 * - Whether challenge/witness steps improve final outcomes
 * - Common anti-patterns (e.g., jumping to recommendations without research)
 */

const EVIDENCE_RANK = {
  stated: 1,
  web: 2,
  documented: 3,
  tested: 4,
  production: 5,
};

export function detectPatterns(sprints) {
  const patterns = [];
  const antiPatterns = [];

  for (const sprint of sprints) {
    const claims = sprint.claims;
    if (claims.length === 0) continue;

    const avgEvidence = averageEvidenceLevel(claims);
    const hasPrototype = claims.some((c) => c.id && c.id.startsWith("p"));
    const hasChallenge = claims.some((c) => c.id && c.id.startsWith("x"));
    const hasWitness = claims.some((c) => c.id && c.id.startsWith("w"));
    const recommendations = claims.filter((c) => c.type === "recommendation");
    const estimates = claims.filter((c) => c.type === "estimate");

    // Pattern: prototype-before-recommend
    if (hasPrototype && recommendations.length > 0) {
      const protoIndices = claims
        .map((c, i) => (c.id && c.id.startsWith("p") ? i : -1))
        .filter((i) => i >= 0);
      const recIndices = claims
        .map((c, i) => (c.type === "recommendation" ? i : -1))
        .filter((i) => i >= 0);

      const prototypedFirst = protoIndices.some((pi) =>
        recIndices.some((ri) => pi < ri),
      );

      if (prototypedFirst) {
        patterns.push({
          sprint: sprint.name,
          pattern: "prototype-before-recommend",
          description:
            "Prototyped before making recommendations -- tends to produce higher-evidence claims.",
          evidenceLevel: avgEvidence,
        });
      }
    }

    // Pattern: adversarial testing
    if (hasChallenge) {
      patterns.push({
        sprint: sprint.name,
        pattern: "adversarial-testing",
        description:
          "Used /challenge to stress-test claims -- builds confidence in findings.",
        claimsChallenged: claims.filter((c) => c.id && c.id.startsWith("x"))
          .length,
      });
    }

    // Pattern: external corroboration
    if (hasWitness) {
      patterns.push({
        sprint: sprint.name,
        pattern: "external-corroboration",
        description:
          "Used /witness to corroborate claims with external sources.",
        witnessCount: claims.filter((c) => c.id && c.id.startsWith("w")).length,
      });
    }

    // Anti-pattern: recommend without research
    const researchClaims = claims.filter((c) => c.id && c.id.startsWith("r"));
    if (recommendations.length > 0 && researchClaims.length === 0) {
      antiPatterns.push({
        sprint: sprint.name,
        pattern: "recommend-without-research",
        description: "Recommendations made without dedicated research claims.",
        severity: "high",
      });
    }

    // Anti-pattern: estimate without evidence
    const weakEstimates = estimates.filter(
      (c) => (EVIDENCE_RANK[c.evidence] || 0) <= 2,
    );
    if (weakEstimates.length > estimates.length * 0.5 && estimates.length > 0) {
      antiPatterns.push({
        sprint: sprint.name,
        pattern: "weak-estimates",
        description: `${weakEstimates.length}/${estimates.length} estimates have weak evidence (stated/web only).`,
        severity: "medium",
      });
    }

    // Anti-pattern: type monoculture
    const typeCounts = {};
    for (const c of claims) {
      typeCounts[c.type || "unknown"] =
        (typeCounts[c.type || "unknown"] || 0) + 1;
    }
    const maxType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    if (maxType && maxType[1] / claims.length > 0.7 && claims.length > 5) {
      antiPatterns.push({
        sprint: sprint.name,
        pattern: "type-monoculture",
        description: `${Math.round((maxType[1] / claims.length) * 100)}% of claims are "${maxType[0]}" -- diversity of analysis may be lacking.`,
        severity: "low",
      });
    }
  }

  // Cross-sprint patterns
  const crossSprint = analyzeCrossSprintTrends(sprints, patterns);

  return {
    summary: {
      totalSprints: sprints.length,
      patternsFound: patterns.length,
      antiPatternsFound: antiPatterns.length,
    },
    patterns,
    antiPatterns,
    crossSprint,
    insight: generatePatternInsight(patterns, antiPatterns, crossSprint),
  };
}

function extractPhases(claims) {
  const phases = new Set();
  for (const c of claims) {
    if (!c.id) continue;
    const prefix = c.id.replace(/\d+$/, "");
    phases.add(prefix);
  }
  return [...phases];
}

function averageEvidenceLevel(claims) {
  const levels = claims
    .map((c) => EVIDENCE_RANK[c.evidence] || 0)
    .filter((l) => l > 0);
  if (levels.length === 0) return 0;
  return (
    Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10
  );
}

function analyzeCrossSprintTrends(sprints, patterns) {
  const trends = {};

  // How many sprints use each pattern?
  for (const p of patterns) {
    trends[p.pattern] = trends[p.pattern] || { count: 0, sprints: [] };
    trends[p.pattern].count++;
    trends[p.pattern].sprints.push(p.sprint);
  }

  // Evidence level trend across sprints (are we getting better?)
  const evidenceTrend = sprints.map((s) => ({
    sprint: s.name,
    avgEvidence: averageEvidenceLevel(s.claims),
    claimCount: s.claims.length,
  }));

  return { patternFrequency: trends, evidenceTrend };
}

function generatePatternInsight(patterns, antiPatterns, crossSprint) {
  const parts = [];

  const protoBeforeRec = patterns.filter(
    (p) => p.pattern === "prototype-before-recommend",
  );
  if (protoBeforeRec.length > 0) {
    parts.push(
      `${protoBeforeRec.length} sprint(s) prototyped before recommending -- good practice.`,
    );
  }

  const noResearch = antiPatterns.filter(
    (p) => p.pattern === "recommend-without-research",
  );
  if (noResearch.length > 0) {
    parts.push(
      `${noResearch.length} sprint(s) recommended without dedicated research -- consider adding /research steps.`,
    );
  }

  const trend = crossSprint.evidenceTrend;
  if (trend.length >= 2) {
    const first = trend[0].avgEvidence;
    const last = trend[trend.length - 1].avgEvidence;
    if (last > first) {
      parts.push("Evidence quality is trending up across sprints.");
    } else if (last < first) {
      parts.push(
        "Evidence quality has declined -- recent sprints may need stronger validation.",
      );
    }
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Not enough sprint data to detect clear patterns.";
}
