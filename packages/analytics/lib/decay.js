/**
 * Knowledge freshness tracking.
 *
 * Identifies claims that may have become stale:
 * - Claims older than a threshold with no revalidation
 * - Claims referencing external tools/APIs that change frequently
 * - Claims with evidence tier "web" that are old (web content changes)
 * - Claims that were challenged but never resolved
 */

const VOLATILE_EVIDENCE = new Set(["stated", "web"]);
const DEFAULT_THRESHOLD_DAYS = 90;

/**
 * Topic-specific decay half-lives (in days).
 * Claims in fast-moving domains go stale faster than stable ones.
 * These are configurable defaults that can be overridden via opts.halfLives.
 */
export const DEFAULT_HALF_LIVES = {
  ai: 42, // ~6 weeks
  ml: 42,
  "ai/ml": 42,
  security: 14, // ~2 weeks
  vulnerability: 14,
  market: 28, // ~4 weeks
  pricing: 28,
  api: 90, // ~3 months
  sdk: 90,
  documentation: 90,
  architecture: 180, // ~6 months
  pattern: 180,
  regulatory: 365, // ~12 months
  compliance: 365,
  legal: 365,
};

/**
 * Tiered urgency levels for decay alerts.
 *
 * passive:  Age badges -- claim is aging, shown as metadata.
 * active:   Inline nudge -- claim is past half-life, warn when touched.
 * urgent:   Blocking -- claim is far past half-life, flag during compilation.
 */
const URGENCY_TIERS = {
  passive: { label: "aging", minRatio: 0.5 }, // past 50% of half-life
  active: { label: "stale", minRatio: 1.0 }, // past full half-life
  urgent: { label: "expired", minRatio: 2.0 }, // past 2x half-life
};

export function checkDecay(sprints, opts = {}) {
  const thresholdDays = opts.thresholdDays || DEFAULT_THRESHOLD_DAYS;
  const now = new Date();

  const allClaims = sprints.flatMap((s) =>
    s.claims.map((c) => ({ ...c, _sprint: s.name })),
  );

  const decaying = [];
  const stale = [];
  const unresolved = [];

  for (const claim of allClaims) {
    const created = claim.created || claim.date || claim.timestamp;
    const age = created ? daysBetween(new Date(created), now) : null;

    // Stale: old claims with volatile evidence
    if (
      age !== null &&
      age > thresholdDays &&
      VOLATILE_EVIDENCE.has(claim.evidence)
    ) {
      stale.push({
        id: claim.id,
        sprint: claim._sprint,
        type: claim.type,
        evidence: claim.evidence,
        ageDays: age,
        text: truncate(claim.text || claim.claim || claim.description, 120),
        reason: `${claim.evidence}-tier evidence is ${age} days old (threshold: ${thresholdDays}).`,
      });
    }

    // Decaying: any claim past threshold, regardless of evidence
    if (age !== null && age > thresholdDays * 1.5) {
      decaying.push({
        id: claim.id,
        sprint: claim._sprint,
        type: claim.type,
        evidence: claim.evidence,
        ageDays: age,
        text: truncate(claim.text || claim.claim || claim.description, 120),
        reason: `Claim is ${age} days old with no revalidation.`,
      });
    }

    // Unresolved: challenged claims still marked as contested
    if (claim.status === "contested" || claim.status === "challenged") {
      unresolved.push({
        id: claim.id,
        sprint: claim._sprint,
        type: claim.type,
        text: truncate(claim.text || claim.claim || claim.description, 120),
        reason: "Claim was challenged but never resolved.",
      });
    }
  }

  // Deduplicate (a claim might appear in both stale and decaying)
  const decayingIds = new Set(decaying.map((c) => c.id));
  const dedupedStale = stale.filter((c) => !decayingIds.has(c.id));

  // Sort by age descending
  const sortByAge = (a, b) => (b.ageDays || 0) - (a.ageDays || 0);
  decaying.sort(sortByAge);
  dedupedStale.sort(sortByAge);

  return {
    summary: {
      totalClaims: allClaims.length,
      staleCount: dedupedStale.length,
      decayingCount: decaying.length,
      unresolvedCount: unresolved.length,
      thresholdDays,
    },
    stale: dedupedStale,
    decaying,
    unresolved,
    insight: generateDecayInsight(
      allClaims.length,
      dedupedStale,
      decaying,
      unresolved,
    ),
  };
}

function daysBetween(a, b) {
  return Math.floor(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}

function generateDecayInsight(total, stale, decaying, unresolved) {
  const parts = [];

  if (decaying.length > 0) {
    parts.push(
      `${decaying.length} claim(s) are significantly outdated and should be revalidated or archived.`,
    );
  }

  if (stale.length > 0) {
    parts.push(
      `${stale.length} claim(s) have volatile evidence (stated/web) that may no longer be accurate.`,
    );
  }

  if (unresolved.length > 0) {
    parts.push(
      `${unresolved.length} challenged claim(s) remain unresolved -- use /resolve to settle them.`,
    );
  }

  const decayRate =
    total > 0
      ? Math.round(((stale.length + decaying.length) / total) * 100)
      : 0;
  if (decayRate > 30) {
    parts.push(
      `Knowledge decay rate is ${decayRate}% -- consider a refresh sprint.`,
    );
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Knowledge base looks fresh -- no decay detected.";
}

/**
 * Topic-aware decay alerts with tiered urgency.
 *
 * Uses half-lives per topic to compute urgency. Claims in fast-moving domains
 * (AI, security) get flagged sooner than stable domains (architecture, legal).
 *
 * @param {Array} sprints
 * @param {object} [opts] - { halfLives: override map }
 * @returns {object} - { alerts, byUrgency, topicDecayRates }
 */
export function decayAlerts(sprints, opts = {}) {
  const halfLives = { ...DEFAULT_HALF_LIVES, ...(opts.halfLives || {}) };
  const now = new Date();

  const allClaims = sprints.flatMap((s) =>
    s.claims.map((c) => ({ ...c, _sprint: s.name })),
  );
  const alerts = [];

  for (const claim of allClaims) {
    const created = claim.created || claim.date || claim.timestamp;
    if (!created) continue;

    const ageDays = daysBetween(new Date(created), now);
    const halfLife = resolveHalfLife(claim, halfLives);
    const ratio = ageDays / halfLife;

    let urgency = null;
    if (ratio >= URGENCY_TIERS.urgent.minRatio) urgency = "urgent";
    else if (ratio >= URGENCY_TIERS.active.minRatio) urgency = "active";
    else if (ratio >= URGENCY_TIERS.passive.minRatio) urgency = "passive";

    if (urgency) {
      alerts.push({
        id: claim.id,
        sprint: claim._sprint,
        type: claim.type,
        evidence: claim.evidence,
        topic: claim.topic || null,
        ageDays,
        halfLife,
        decayRatio: Math.round(ratio * 100) / 100,
        urgency,
        text: truncate(
          claim.text || claim.claim || claim.description || claim.content,
          120,
        ),
      });
    }
  }

  // Group by urgency
  const byUrgency = {
    urgent: alerts.filter((a) => a.urgency === "urgent"),
    active: alerts.filter((a) => a.urgency === "active"),
    passive: alerts.filter((a) => a.urgency === "passive"),
  };

  // Topic decay rates: which topics decay fastest in practice
  const topicStats = {};
  for (const alert of alerts) {
    const topic = alert.topic || "general";
    if (!topicStats[topic])
      topicStats[topic] = { count: 0, totalRatio: 0, urgentCount: 0 };
    topicStats[topic].count++;
    topicStats[topic].totalRatio += alert.decayRatio;
    if (alert.urgency === "urgent") topicStats[topic].urgentCount++;
  }

  const topicDecayRates = Object.entries(topicStats)
    .map(([topic, stats]) => ({
      topic,
      alertCount: stats.count,
      avgDecayRatio: Math.round((stats.totalRatio / stats.count) * 100) / 100,
      urgentCount: stats.urgentCount,
    }))
    .sort((a, b) => b.avgDecayRatio - a.avgDecayRatio);

  return {
    summary: {
      totalAlerts: alerts.length,
      urgent: byUrgency.urgent.length,
      active: byUrgency.active.length,
      passive: byUrgency.passive.length,
    },
    alerts,
    byUrgency,
    topicDecayRates,
    insight: generateAlertInsight(byUrgency, topicDecayRates),
  };
}

/**
 * Resolve the half-life for a claim based on its topic and tags.
 */
function resolveHalfLife(claim, halfLives) {
  // Check topic field first
  if (claim.topic) {
    const topicLower = claim.topic.toLowerCase();
    for (const [key, days] of Object.entries(halfLives)) {
      if (topicLower.includes(key)) return days;
    }
  }

  // Check tags
  if (claim.tags) {
    for (const tag of claim.tags) {
      const tagLower = tag.toLowerCase();
      if (halfLives[tagLower]) return halfLives[tagLower];
    }
  }

  // Default based on evidence tier: volatile evidence decays faster
  if (VOLATILE_EVIDENCE.has(claim.evidence)) return 60;
  return DEFAULT_THRESHOLD_DAYS;
}

function generateAlertInsight(byUrgency, topicDecayRates) {
  const parts = [];

  if (byUrgency.urgent.length > 0) {
    parts.push(
      `${byUrgency.urgent.length} claim(s) are well past their knowledge half-life and should be revalidated before use.`,
    );
  }

  if (byUrgency.active.length > 0) {
    parts.push(
      `${byUrgency.active.length} claim(s) have reached their decay threshold -- consider refreshing when you next touch these topics.`,
    );
  }

  if (topicDecayRates.length > 0) {
    const fastest = topicDecayRates[0];
    if (fastest.avgDecayRatio > 1.5) {
      parts.push(
        `Topic "${fastest.topic}" has the highest decay rate (${fastest.alertCount} alerts). This domain moves fast -- consider shorter review cycles.`,
      );
    }
  }

  return parts.length > 0
    ? parts.join(" ")
    : "No topic-specific decay concerns detected.";
}
