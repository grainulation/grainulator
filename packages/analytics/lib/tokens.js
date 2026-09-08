/**
 * Token cost tracking and attribution.
 *
 * Tracks token consumption from Agent SDK data per sprint, per user, per model.
 * Computes cost-per-verified-claim as the key efficiency metric.
 *
 * Agent SDK exposes: total_cost_usd, input_tokens, output_tokens,
 * cache_creation_input_tokens, cache_read_input_tokens per query() call.
 *
 * Pricing (per MTok, Opus 4.6 defaults):
 *   input:         $5.00
 *   output:        $25.00
 *   cache_read:    $0.50  (90% discount on input)
 *   cache_write:   $6.25  (1.25x input)
 */

export const DEFAULT_PRICING = {
  "claude-opus-4-6": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-haiku-4-5": {
    input: 0.8,
    output: 4.0,
    cacheRead: 0.08,
    cacheWrite: 1.0,
  },
};

const DEFAULT_MODEL = "claude-opus-4-6";

/**
 * Compute cost from token counts and pricing.
 * @param {object} usage - { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
 * @param {string} [model] - Model identifier
 * @param {object} [customPricing] - Override pricing
 * @returns {object} - { totalCostUsd, breakdown }
 */
export function computeCost(usage, model, customPricing) {
  const pricing =
    (customPricing && customPricing[model]) ||
    DEFAULT_PRICING[model] ||
    DEFAULT_PRICING[DEFAULT_MODEL];

  const input = ((usage.input_tokens || 0) / 1_000_000) * pricing.input;
  const output = ((usage.output_tokens || 0) / 1_000_000) * pricing.output;
  const cacheRead =
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheRead;
  const cacheWrite =
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cacheWrite;

  const totalCostUsd = round6(input + output + cacheRead + cacheWrite);

  return {
    totalCostUsd,
    breakdown: {
      input: round6(input),
      output: round6(output),
      cacheRead: round6(cacheRead),
      cacheWrite: round6(cacheWrite),
    },
    tokens: {
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
      total:
        (usage.input_tokens || 0) +
        (usage.output_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0),
    },
  };
}

/**
 * Analyze token economics across sprints.
 *
 * Each sprint may have a `tokenUsage` field (from Agent SDK interception)
 * or a `compilation.tokenUsage` field. Format:
 *   { input_tokens, output_tokens, cache_read_input_tokens,
 *     cache_creation_input_tokens, model, total_cost_usd }
 *
 * @param {Array} sprints - Sprint objects
 * @returns {object} - Token economics report
 */
export function analyzeTokens(sprints) {
  const sprintCosts = [];
  let totalCostUsd = 0;
  let totalTokens = 0;
  let totalClaims = 0;
  let totalVerifiedClaims = 0;

  for (const sprint of sprints) {
    const usage = extractUsage(sprint);
    const claimCount = sprint.claims.length;
    const verifiedCount = countVerifiedClaims(sprint);

    totalClaims += claimCount;
    totalVerifiedClaims += verifiedCount;

    if (!usage) {
      sprintCosts.push({
        sprint: sprint.name,
        cost: null,
        tokens: null,
        claimCount,
        verifiedClaims: verifiedCount,
        costPerClaim: null,
        costPerVerifiedClaim: null,
      });
      continue;
    }

    const model = usage.model || DEFAULT_MODEL;
    const cost =
      usage.total_cost_usd != null
        ? {
            totalCostUsd: usage.total_cost_usd,
            breakdown: null,
            tokens: tokenSummary(usage),
          }
        : computeCost(usage, model);

    totalCostUsd += cost.totalCostUsd;
    totalTokens += cost.tokens.total;

    const costPerClaim =
      claimCount > 0 ? round6(cost.totalCostUsd / claimCount) : null;
    const costPerVerifiedClaim =
      verifiedCount > 0 ? round6(cost.totalCostUsd / verifiedCount) : null;

    sprintCosts.push({
      sprint: sprint.name,
      model,
      cost: cost.totalCostUsd,
      breakdown: cost.breakdown,
      tokens: cost.tokens,
      claimCount,
      verifiedClaims: verifiedCount,
      costPerClaim,
      costPerVerifiedClaim,
    });
  }

  // Cache efficiency: ratio of cache reads to total input
  const totalCacheReads = sprintCosts.reduce(
    (a, s) => a + (s.tokens ? s.tokens.cacheRead : 0),
    0,
  );
  const totalInput = sprintCosts.reduce(
    (a, s) =>
      a +
      (s.tokens
        ? s.tokens.input + s.tokens.cacheRead + s.tokens.cacheWrite
        : 0),
    0,
  );
  const cacheHitRate =
    totalInput > 0 ? Math.round((totalCacheReads / totalInput) * 100) : null;

  const sprintsWithCost = sprintCosts.filter((s) => s.cost !== null);
  const avgCostPerSprint =
    sprintsWithCost.length > 0
      ? round6(totalCostUsd / sprintsWithCost.length)
      : null;
  const costPerVerifiedClaim =
    totalVerifiedClaims > 0 ? round6(totalCostUsd / totalVerifiedClaims) : null;
  const costPerClaim =
    totalClaims > 0 ? round6(totalCostUsd / totalClaims) : null;

  return {
    summary: {
      totalSprints: sprints.length,
      sprintsWithUsageData: sprintsWithCost.length,
      totalCostUsd: round6(totalCostUsd),
      totalTokens,
      totalClaims,
      totalVerifiedClaims,
      costPerClaim,
      costPerVerifiedClaim,
      avgCostPerSprint,
      cacheHitRate,
    },
    perSprint: sprintCosts,
    insight: generateTokenInsight(
      sprintCosts,
      costPerVerifiedClaim,
      cacheHitRate,
    ),
  };
}

/**
 * Extract token usage data from a sprint.
 */
function extractUsage(sprint) {
  // Direct tokenUsage on sprint
  if (sprint.tokenUsage) return sprint.tokenUsage;
  // From compilation metadata
  if (sprint.compilation && sprint.compilation.tokenUsage)
    return sprint.compilation.tokenUsage;
  // From compilation.meta
  if (
    sprint.compilation &&
    sprint.compilation.meta &&
    sprint.compilation.meta.tokenUsage
  ) {
    return sprint.compilation.meta.tokenUsage;
  }
  return null;
}

/**
 * Count claims that survived compilation (verified).
 * A claim is "verified" if it has evidence >= documented, or status is active/resolved.
 */
function countVerifiedClaims(sprint) {
  if (sprint.compilation && sprint.compilation.claims) {
    return sprint.compilation.claims.length;
  }
  // Fallback: count claims with evidence better than stated/web
  return sprint.claims.filter((c) => {
    const tier = c.evidence || "stated";
    return tier !== "stated" && tier !== "web";
  }).length;
}

function tokenSummary(usage) {
  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
    cacheWrite: usage.cache_creation_input_tokens || 0,
    total:
      (usage.input_tokens || 0) +
      (usage.output_tokens || 0) +
      (usage.cache_read_input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0),
  };
}

function generateTokenInsight(sprintCosts, costPerVerified, cacheHitRate) {
  const parts = [];
  const withCost = sprintCosts.filter((s) => s.cost !== null);

  if (withCost.length === 0) {
    return "No token usage data found. Token tracking requires Agent SDK integration.";
  }

  if (costPerVerified !== null) {
    if (costPerVerified < 0.01) {
      parts.push(
        `Excellent efficiency: $${costPerVerified.toFixed(4)} per verified claim.`,
      );
    } else if (costPerVerified < 0.05) {
      parts.push(
        `Good efficiency: $${costPerVerified.toFixed(4)} per verified claim.`,
      );
    } else {
      parts.push(
        `Cost per verified claim: $${costPerVerified.toFixed(4)}. Consider improving cache usage or reducing exploratory queries.`,
      );
    }
  }

  if (cacheHitRate !== null) {
    if (cacheHitRate > 50) {
      parts.push(
        `Strong cache utilization at ${cacheHitRate}% -- prompt caching is working well.`,
      );
    } else if (cacheHitRate > 20) {
      parts.push(
        `Cache hit rate: ${cacheHitRate}%. Room to improve by reusing system prompts across operations.`,
      );
    }
  }

  // Trend: cost per claim improving over time?
  if (withCost.length >= 3) {
    const firstHalf = withCost.slice(0, Math.floor(withCost.length / 2));
    const secondHalf = withCost.slice(Math.floor(withCost.length / 2));
    const avgFirst = avg(firstHalf.map((s) => s.costPerClaim).filter(Boolean));
    const avgSecond = avg(
      secondHalf.map((s) => s.costPerClaim).filter(Boolean),
    );
    if (avgFirst && avgSecond && avgSecond < avgFirst * 0.85) {
      parts.push(
        "Research is getting cheaper: cost per claim is trending down across recent sprints.",
      );
    }
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Token usage tracked across sprints.";
}

function avg(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
