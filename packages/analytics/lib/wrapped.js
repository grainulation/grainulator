/**
 * Harvest Wrapped — Spotify-Wrapped-style report data for research sprints.
 *
 * Generates a "Harvest Report" with:
 *   1. Sprint count and velocity trends
 *   2. Claim type distribution and ratios
 *   3. Evidence tier progression (are you testing more over time?)
 *   4. "Research personality" type based on command usage patterns
 *   5. Key milestones and achievements
 *
 * Based on claims from harvest-in-grainulator and token-economics sprints:
 *   - r628: Wrapped data points (sprint count, type ratios, personality)
 *   - r627: Spotify Wrapped viral design (personalization, identity, shareability)
 *   - r602: Behavioral science (make patterns feel like identity, not metrics)
 *   - d005: Harvest Reports = Spotify Wrapped for research
 */

/**
 * Research personality archetypes based on command/claim usage patterns.
 * Each archetype has detection heuristics and a descriptive label.
 */
export const ARCHETYPES = {
  challenger: {
    id: "challenger",
    label: "The Challenger",
    emoji: "sword",
    description:
      "You stress-test everything. High challenge and contest rates mean your surviving claims are battle-hardened.",
    detect: (stats) => stats.challengeRatio > 0.15,
  },
  prototyper: {
    id: "prototyper",
    label: "The Prototyper",
    emoji: "lab",
    description:
      "You build to learn. Heavy prototype and tested-evidence usage means you validate through hands-on experimentation.",
    detect: (stats) => stats.testedRatio > 0.25,
  },
  scholar: {
    id: "scholar",
    label: "The Scholar",
    emoji: "book",
    description:
      "You research deeply. High factual claim counts and documented evidence show rigorous investigation.",
    detect: (stats) => stats.factualRatio > 0.45 && stats.documentedRatio > 0.2,
  },
  strategist: {
    id: "strategist",
    label: "The Strategist",
    emoji: "chess",
    description:
      "You drive toward decisions. High recommendation-to-factual ratios show you synthesize findings into action.",
    detect: (stats) => stats.recommendationRatio > 0.2,
  },
  sentinel: {
    id: "sentinel",
    label: "The Sentinel",
    emoji: "shield",
    description:
      "You spot what could go wrong. High risk identification means you protect decisions from blind spots.",
    detect: (stats) => stats.riskRatio > 0.15,
  },
  explorer: {
    id: "explorer",
    label: "The Explorer",
    emoji: "compass",
    description:
      "You cover wide ground. Diverse topics and broad tag coverage show you leave no stone unturned.",
    detect: (stats) => stats.topicDiversity > 0.7,
  },
  balanced: {
    id: "balanced",
    label: "The Balanced Researcher",
    emoji: "scales",
    description:
      "You maintain equilibrium across research activities. A well-rounded approach with no single dominant pattern.",
    detect: () => true, // fallback
  },
};

/**
 * Generate Harvest Wrapped report data.
 *
 * @param {Array} sprints - Sprint objects (from loadSprintData)
 * @param {object} [opts] - Options
 * @param {object} [opts.tokenReport] - Token tracking report (from trackCosts or analyzeTokens)
 * @returns {object} Wrapped report data
 */
export function generateWrapped(sprints, opts = {}) {
  const stats = computeWrappedStats(sprints);
  const personality = detectPersonality(stats);
  const tierProgression = computeTierProgression(sprints);
  const highlights = computeHighlights(sprints, stats);
  const tokenSummary = summarizeTokens(opts.tokenReport);

  return {
    period: determinePeriod(sprints),
    sprintCount: sprints.length,
    personality,
    stats: {
      totalClaims: stats.totalClaims,
      totalActiveClaims: stats.activeClaims,
      typeDistribution: stats.typeDistribution,
      evidenceDistribution: stats.evidenceDistribution,
      topTags: stats.topTags,
      topTopics: stats.topTopics,
      avgClaimsPerSprint: stats.avgClaimsPerSprint,
    },
    tierProgression,
    highlights,
    tokenSummary,
    shareCard: buildShareCard(sprints.length, stats, personality),
  };
}

/**
 * Compute raw stats for wrapped report.
 */
export function computeWrappedStats(sprints) {
  const typeDistribution = {};
  const evidenceDistribution = {};
  const tagCounts = {};
  const topicCounts = {};
  let totalClaims = 0;
  let activeClaims = 0;
  let challengeClaims = 0;
  let contestedClaims = 0;

  for (const sprint of sprints) {
    for (const c of sprint.claims || []) {
      totalClaims++;
      if (c.status === "active") activeClaims++;
      if (c.status === "contested") contestedClaims++;

      const type = c.type || "unknown";
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;

      // Handle both string and object evidence formats
      const evidence =
        typeof c.evidence === "string"
          ? c.evidence
          : c.evidence?.tier || c.evidence_tier || "unknown";
      evidenceDistribution[evidence] =
        (evidenceDistribution[evidence] || 0) + 1;

      // Track challenge claims (x-prefixed IDs)
      if (c.id && c.id.startsWith("x")) challengeClaims++;

      // Tags
      for (const tag of c.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }

      // Topics
      const topic = c.topic || null;
      if (topic) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }
  }

  // Ratios for personality detection
  const factualRatio =
    totalClaims > 0 ? (typeDistribution.factual || 0) / totalClaims : 0;
  const recommendationRatio =
    totalClaims > 0 ? (typeDistribution.recommendation || 0) / totalClaims : 0;
  const riskRatio =
    totalClaims > 0 ? (typeDistribution.risk || 0) / totalClaims : 0;
  const testedRatio =
    totalClaims > 0 ? (evidenceDistribution.tested || 0) / totalClaims : 0;
  const documentedRatio =
    totalClaims > 0 ? (evidenceDistribution.documented || 0) / totalClaims : 0;
  const challengeRatio =
    totalClaims > 0 ? (challengeClaims + contestedClaims) / totalClaims : 0;

  // Topic diversity: unique topics / total claims (normalized 0-1)
  const uniqueTopics = Object.keys(topicCounts).length;
  const topicDiversity =
    totalClaims > 0 ? Math.min(1, uniqueTopics / Math.sqrt(totalClaims)) : 0;

  // Top tags and topics
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  return {
    totalClaims,
    activeClaims,
    typeDistribution,
    evidenceDistribution,
    factualRatio,
    recommendationRatio,
    riskRatio,
    testedRatio,
    documentedRatio,
    challengeRatio,
    topicDiversity,
    topTags,
    topTopics,
    avgClaimsPerSprint:
      sprints.length > 0 ? Math.round(totalClaims / sprints.length) : 0,
  };
}

/**
 * Detect research personality archetype from usage stats.
 */
export function detectPersonality(stats) {
  // Check archetypes in priority order (most specific first)
  const priorityOrder = [
    "challenger",
    "prototyper",
    "scholar",
    "strategist",
    "sentinel",
    "explorer",
    "balanced",
  ];

  for (const id of priorityOrder) {
    const archetype = ARCHETYPES[id];
    if (archetype.detect(stats)) {
      return {
        id: archetype.id,
        label: archetype.label,
        description: archetype.description,
        confidence: computePersonalityConfidence(id, stats),
      };
    }
  }

  return ARCHETYPES.balanced;
}

/**
 * Compute confidence score for a personality match.
 */
function computePersonalityConfidence(id, stats) {
  switch (id) {
    case "challenger":
      return Math.min(1, stats.challengeRatio / 0.3);
    case "prototyper":
      return Math.min(1, stats.testedRatio / 0.5);
    case "scholar":
      return Math.min(1, (stats.factualRatio + stats.documentedRatio) / 0.8);
    case "strategist":
      return Math.min(1, stats.recommendationRatio / 0.4);
    case "sentinel":
      return Math.min(1, stats.riskRatio / 0.3);
    case "explorer":
      return Math.min(1, stats.topicDiversity);
    default:
      return 0.5;
  }
}

/**
 * Compute evidence tier progression across sprints (ordered by time).
 * Shows if the researcher is using higher-quality evidence over time.
 */
function computeTierProgression(sprints) {
  const tierWeight = {
    stated: 1,
    web: 2,
    documented: 3,
    tested: 4,
    production: 5,
  };

  if (sprints.length < 2) return null;

  const sprintScores = sprints.map((sprint) => {
    const claims = sprint.claims || [];
    if (claims.length === 0)
      return { sprint: sprint.name, avgTier: 0, claims: 0 };

    let totalWeight = 0;
    for (const c of claims) {
      const evidence =
        typeof c.evidence === "string"
          ? c.evidence
          : c.evidence?.tier || c.evidence_tier || "stated";
      totalWeight += tierWeight[evidence] || 1;
    }

    return {
      sprint: sprint.name,
      avgTier: Math.round((totalWeight / claims.length) * 100) / 100,
      claims: claims.length,
    };
  });

  // Trend: compare first half vs second half
  const mid = Math.floor(sprintScores.length / 2);
  const firstHalf = sprintScores.slice(0, mid).filter((s) => s.claims > 0);
  const secondHalf = sprintScores.slice(mid).filter((s) => s.claims > 0);

  const avgFirst =
    firstHalf.length > 0
      ? firstHalf.reduce((a, s) => a + s.avgTier, 0) / firstHalf.length
      : 0;
  const avgSecond =
    secondHalf.length > 0
      ? secondHalf.reduce((a, s) => a + s.avgTier, 0) / secondHalf.length
      : 0;

  return {
    sprints: sprintScores,
    trend:
      avgSecond > avgFirst
        ? "improving"
        : avgSecond < avgFirst
          ? "declining"
          : "stable",
    firstHalfAvg: Math.round(avgFirst * 100) / 100,
    secondHalfAvg: Math.round(avgSecond * 100) / 100,
  };
}

/**
 * Compute highlights and achievements.
 */
function computeHighlights(sprints, stats) {
  const highlights = [];

  // Sprint milestones
  if (sprints.length >= 10)
    highlights.push({
      type: "milestone",
      text: `${sprints.length} sprints completed`,
    });
  if (sprints.length >= 50)
    highlights.push({
      type: "milestone",
      text: "Power researcher: 50+ sprints",
    });

  // Claim milestones
  if (stats.totalClaims >= 100)
    highlights.push({
      type: "milestone",
      text: `${stats.totalClaims} claims across all sprints`,
    });

  // Evidence quality
  const tested = stats.evidenceDistribution.tested || 0;
  const production = stats.evidenceDistribution.production || 0;
  const highQuality = tested + production;
  if (highQuality > 0 && stats.totalClaims > 0) {
    const pct = Math.round((highQuality / stats.totalClaims) * 100);
    if (pct >= 30)
      highlights.push({
        type: "quality",
        text: `${pct}% of claims backed by tested or production evidence`,
      });
  }

  // Challenge rate
  if (stats.challengeRatio > 0.1) {
    highlights.push({
      type: "rigor",
      text: `${Math.round(stats.challengeRatio * 100)}% challenge rate -- strong adversarial testing`,
    });
  }

  // Top tag
  if (stats.topTags.length > 0) {
    highlights.push({
      type: "focus",
      text: `Most researched tag: "${stats.topTags[0].tag}" (${stats.topTags[0].count} claims)`,
    });
  }

  // Most productive sprint
  let maxClaims = 0;
  let maxSprint = null;
  for (const s of sprints) {
    if ((s.claims || []).length > maxClaims) {
      maxClaims = (s.claims || []).length;
      maxSprint = s.name;
    }
  }
  if (maxSprint) {
    highlights.push({
      type: "record",
      text: `Most productive sprint: "${maxSprint}" with ${maxClaims} claims`,
    });
  }

  return highlights;
}

/**
 * Summarize token costs for the wrapped report.
 */
function summarizeTokens(tokenReport) {
  if (!tokenReport || !tokenReport.summary) return null;

  const s = tokenReport.summary;
  return {
    totalCostUsd: s.totalCostUsd || 0,
    costPerVerifiedClaim: s.costPerVerifiedClaim || null,
    avgCostPerSprint: s.avgCostPerSprint || null,
    costTrend: tokenReport.costTrend || null,
  };
}

/**
 * Determine the reporting period from sprint data.
 */
function determinePeriod(sprints) {
  const timestamps = [];
  for (const sprint of sprints) {
    for (const c of sprint.claims || []) {
      const ts = c.timestamp || c.created;
      if (ts) timestamps.push(new Date(ts));
    }
  }

  if (timestamps.length === 0) {
    return { start: null, end: null, label: "All time" };
  }

  timestamps.sort((a, b) => a - b);
  const start = timestamps[0];
  const end = timestamps[timestamps.length - 1];

  // Determine label
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const label =
    start.getFullYear() === end.getFullYear()
      ? `${months[start.getMonth()]}--${months[end.getMonth()]} ${end.getFullYear()}`
      : `${months[start.getMonth()]} ${start.getFullYear()}--${months[end.getMonth()]} ${end.getFullYear()}`;

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label,
  };
}

/**
 * Build shareable summary card data (no proprietary content).
 */
function buildShareCard(sprintCount, stats, personality) {
  return {
    sprintCount,
    totalClaims: stats.totalClaims,
    personality: personality.label,
    topEvidenceTier: getTopEvidenceTier(stats.evidenceDistribution),
    avgClaimsPerSprint: stats.avgClaimsPerSprint,
  };
}

function getTopEvidenceTier(distribution) {
  const tiers = ["production", "tested", "documented", "web", "stated"];
  for (const tier of tiers) {
    if (distribution[tier] > 0) return tier;
  }
  return "stated";
}
