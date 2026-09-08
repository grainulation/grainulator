import fs from "node:fs";
import path from "node:path";
import { computeCost } from "./tokens.js";

/**
 * Token Tracker — reads sprint_outcomes.jsonl and calculates cost-per-verified-claim.
 *
 * sprint_outcomes.jsonl is an append-only log where each line is a JSON object:
 *   { sprint, timestamp, input_tokens, output_tokens, cache_read_input_tokens,
 *     cache_creation_input_tokens, model, total_cost_usd, claims_count,
 *     verified_claims_count, phase }
 *
 * This module aggregates that data into actionable cost metrics.
 */

export const OUTCOMES_FILE = "sprint_outcomes.jsonl";

/**
 * Load sprint outcomes from a JSONL file.
 * @param {string} dir - Directory containing sprint_outcomes.jsonl
 * @returns {Array<object>} Parsed outcome entries
 */
export function loadOutcomes(dir) {
  const filePath = path.join(dir, OUTCOMES_FILE);
  if (!fs.existsSync(filePath)) return [];

  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim());

  const outcomes = [];
  for (const line of lines) {
    try {
      outcomes.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return outcomes;
}

/**
 * Append an outcome entry to the JSONL log.
 * @param {string} dir - Directory containing sprint_outcomes.jsonl
 * @param {object} entry - Outcome data to append
 */
export function appendOutcome(dir, entry) {
  const filePath = path.join(dir, OUTCOMES_FILE);
  const line = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });
  fs.appendFileSync(filePath, line + "\n", "utf8");
}

/**
 * Calculate cost-per-verified-claim from sprint_outcomes.jsonl.
 *
 * Returns per-sprint and aggregate metrics:
 *   - costPerVerifiedClaim: total cost / total verified claims
 *   - costPerClaim: total cost / total claims
 *   - costTrend: are sprints getting cheaper per verified claim over time?
 *   - modelBreakdown: cost by model
 *   - phaseBreakdown: cost by sprint phase
 *
 * @param {string} dir - Directory containing sprint_outcomes.jsonl
 * @returns {object} Token tracking report
 */
export function trackCosts(dir) {
  const outcomes = loadOutcomes(dir);

  if (outcomes.length === 0) {
    return {
      summary: {
        totalEntries: 0,
        totalCostUsd: 0,
        totalClaims: 0,
        totalVerifiedClaims: 0,
        costPerClaim: null,
        costPerVerifiedClaim: null,
        avgCostPerSprint: null,
      },
      perSprint: [],
      modelBreakdown: {},
      phaseBreakdown: {},
      costTrend: null,
      insight:
        "No sprint outcome data found. Append entries to sprint_outcomes.jsonl to track costs.",
    };
  }

  // Group by sprint name
  const bySprint = new Map();
  for (const o of outcomes) {
    const key = o.sprint || "unknown";
    if (!bySprint.has(key)) bySprint.set(key, []);
    bySprint.get(key).push(o);
  }

  let totalCostUsd = 0;
  let totalClaims = 0;
  let totalVerifiedClaims = 0;

  const perSprint = [];
  const modelBreakdown = {};
  const phaseBreakdown = {};

  for (const [sprintName, entries] of bySprint) {
    let sprintCost = 0;
    let sprintClaims = 0;
    let sprintVerified = 0;

    for (const e of entries) {
      const cost =
        e.total_cost_usd != null
          ? e.total_cost_usd
          : computeCost(
              {
                input_tokens: e.input_tokens || 0,
                output_tokens: e.output_tokens || 0,
                cache_read_input_tokens: e.cache_read_input_tokens || 0,
                cache_creation_input_tokens: e.cache_creation_input_tokens || 0,
              },
              e.model,
            ).totalCostUsd;

      sprintCost += cost;
      sprintClaims += e.claims_count || 0;
      sprintVerified += e.verified_claims_count || 0;

      // Model breakdown
      const model = e.model || "unknown";
      modelBreakdown[model] = (modelBreakdown[model] || 0) + cost;

      // Phase breakdown
      const phase = e.phase || "unknown";
      phaseBreakdown[phase] = (phaseBreakdown[phase] || 0) + cost;
    }

    totalCostUsd += sprintCost;
    totalClaims += sprintClaims;
    totalVerifiedClaims += sprintVerified;

    perSprint.push({
      sprint: sprintName,
      cost: round6(sprintCost),
      claims: sprintClaims,
      verifiedClaims: sprintVerified,
      costPerClaim: sprintClaims > 0 ? round6(sprintCost / sprintClaims) : null,
      costPerVerifiedClaim:
        sprintVerified > 0 ? round6(sprintCost / sprintVerified) : null,
      entries: entries.length,
    });
  }

  // Sort by timestamp of first entry
  perSprint.sort((a, b) => {
    const aTime = bySprint.get(a.sprint)?.[0]?.timestamp || "";
    const bTime = bySprint.get(b.sprint)?.[0]?.timestamp || "";
    return aTime.localeCompare(bTime);
  });

  // Cost trend: compare first half vs second half of sprints
  let costTrend = null;
  if (perSprint.length >= 4) {
    const mid = Math.floor(perSprint.length / 2);
    const firstHalf = perSprint
      .slice(0, mid)
      .filter((s) => s.costPerVerifiedClaim != null);
    const secondHalf = perSprint
      .slice(mid)
      .filter((s) => s.costPerVerifiedClaim != null);

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const avgFirst = avg(firstHalf.map((s) => s.costPerVerifiedClaim));
      const avgSecond = avg(secondHalf.map((s) => s.costPerVerifiedClaim));
      const changePercent =
        avgFirst > 0
          ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100)
          : null;

      costTrend = {
        direction:
          avgSecond < avgFirst
            ? "improving"
            : avgSecond > avgFirst
              ? "worsening"
              : "stable",
        firstHalfAvg: round6(avgFirst),
        secondHalfAvg: round6(avgSecond),
        changePercent,
      };
    }
  }

  // Round model and phase breakdowns
  for (const k of Object.keys(modelBreakdown))
    modelBreakdown[k] = round6(modelBreakdown[k]);
  for (const k of Object.keys(phaseBreakdown))
    phaseBreakdown[k] = round6(phaseBreakdown[k]);

  const costPerClaim =
    totalClaims > 0 ? round6(totalCostUsd / totalClaims) : null;
  const costPerVerifiedClaim =
    totalVerifiedClaims > 0 ? round6(totalCostUsd / totalVerifiedClaims) : null;
  const sprintCount = perSprint.length;
  const avgCostPerSprint =
    sprintCount > 0 ? round6(totalCostUsd / sprintCount) : null;

  return {
    summary: {
      totalEntries: outcomes.length,
      totalSprints: sprintCount,
      totalCostUsd: round6(totalCostUsd),
      totalClaims,
      totalVerifiedClaims,
      costPerClaim,
      costPerVerifiedClaim,
      avgCostPerSprint,
    },
    perSprint,
    modelBreakdown,
    phaseBreakdown,
    costTrend,
    insight: generateTrackerInsight(
      costPerVerifiedClaim,
      costTrend,
      modelBreakdown,
    ),
  };
}

function generateTrackerInsight(costPerVerified, costTrend, modelBreakdown) {
  const parts = [];

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
        `Cost per verified claim: $${costPerVerified.toFixed(4)}. Consider caching or reducing exploratory queries.`,
      );
    }
  }

  if (costTrend) {
    if (costTrend.direction === "improving") {
      parts.push(
        `Research is getting cheaper: cost per verified claim improved ${Math.abs(costTrend.changePercent)}% across recent sprints.`,
      );
    } else if (costTrend.direction === "worsening") {
      parts.push(
        `Cost per verified claim increased ${costTrend.changePercent}% in recent sprints -- investigate token usage patterns.`,
      );
    }
  }

  const models = Object.keys(modelBreakdown);
  if (models.length > 1) {
    const sorted = models.sort((a, b) => modelBreakdown[b] - modelBreakdown[a]);
    parts.push(
      `Top model by spend: ${sorted[0]} ($${modelBreakdown[sorted[0]].toFixed(4)}).`,
    );
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Token cost data tracked from sprint_outcomes.jsonl.";
}

function avg(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
