/**
 * Prediction vs outcome scoring.
 *
 * Compares estimate claims against calibrate claims (from wheat's /calibrate).
 * Answers: "How often were our estimates right?"
 *
 * Scoring:
 * - Each estimate claim gets matched to calibration claims by ID reference or tag overlap
 * - Calibration claims contain actual outcomes and a confidence delta
 * - We compute accuracy, overconfidence, and underconfidence rates
 */

export function calibrate(sprints) {
  const allClaims = sprints.flatMap((s) =>
    s.claims.map((c) => ({ ...c, _sprint: s.name })),
  );

  const estimates = allClaims.filter((c) => c.type === "estimate");
  const calibrations = allClaims.filter(
    (c) => c.id && (c.id.startsWith("cal") || c.type === "calibration"),
  );

  // Match calibrations to estimates
  const scored = [];
  for (const cal of calibrations) {
    const refs = cal.references || cal.refs || [];
    const matchedEstimates = estimates.filter(
      (e) =>
        refs.includes(e.id) ||
        (cal.tags && e.tags && cal.tags.some((t) => e.tags.includes(t))),
    );

    for (const est of matchedEstimates) {
      scored.push({
        estimateId: est.id,
        calibrationId: cal.id,
        sprint: est._sprint,
        estimateText: est.text || est.claim || est.description,
        outcomeText: cal.text || cal.claim || cal.description,
        estimateConfidence: est.confidence || null,
        actualOutcome: cal.outcome || cal.actual || null,
        accurate: cal.accurate ?? null,
        delta: cal.delta ?? null,
      });
    }
  }

  // Unmatched estimates -- predictions with no follow-up
  const scoredEstimateIds = new Set(scored.map((s) => s.estimateId));
  const unmatched = estimates.filter((e) => !scoredEstimateIds.has(e.id));

  // Compute aggregate stats
  const accurateCount = scored.filter((s) => s.accurate === true).length;
  const inaccurateCount = scored.filter((s) => s.accurate === false).length;
  const totalScored = accurateCount + inaccurateCount;
  const accuracyRate =
    totalScored > 0 ? Math.round((accurateCount / totalScored) * 100) : null;

  // Confidence calibration: group by confidence bucket
  const buckets = {
    high: { total: 0, accurate: 0 },
    medium: { total: 0, accurate: 0 },
    low: { total: 0, accurate: 0 },
  };
  for (const s of scored) {
    const conf = s.estimateConfidence;
    let bucket = "medium";
    if (typeof conf === "number") {
      bucket = conf >= 0.7 ? "high" : conf >= 0.4 ? "medium" : "low";
    } else if (typeof conf === "string") {
      bucket = conf.toLowerCase();
    }
    if (buckets[bucket]) {
      buckets[bucket].total++;
      if (s.accurate === true) buckets[bucket].accurate++;
    }
  }

  const calibrationScore = Object.fromEntries(
    Object.entries(buckets)
      .filter(([, v]) => v.total > 0)
      .map(([k, v]) => [k, Math.round((v.accurate / v.total) * 100)]),
  );

  // Brier score: mean squared error between predicted probability and outcome (0=perfect, 1=worst)
  const brierData = computeBrierScore(scored);

  // Calibration curve: bin predictions by confidence, compare to actual outcome rate
  const calibrationCurve = computeCalibrationCurve(scored);

  return {
    summary: {
      totalEstimates: estimates.length,
      totalCalibrations: calibrations.length,
      matched: scored.length,
      unmatched: unmatched.length,
      accuracyRate,
      brierScore: brierData.score,
    },
    calibrationByConfidence: calibrationScore,
    calibrationCurve,
    brierScore: brierData,
    scored: scored.map((s) => ({
      estimateId: s.estimateId,
      calibrationId: s.calibrationId,
      sprint: s.sprint,
      accurate: s.accurate,
      delta: s.delta,
    })),
    unmatchedEstimates: unmatched.map((e) => ({
      id: e.id,
      sprint: e._sprint,
      text: e.text || e.claim || e.description,
      age: e.created ? daysSince(e.created) : null,
    })),
    insight: generateInsight(
      accuracyRate,
      calibrationScore,
      unmatched.length,
      estimates.length,
      brierData,
      calibrationCurve,
    ),
  };
}

/**
 * Compute Brier score -- mean squared difference between predicted probability and outcome.
 * Scale: 0 (perfect) to 1 (worst). Metaculus community achieves 0.10-0.20.
 */
function computeBrierScore(scored) {
  const withProbability = scored.filter(
    (s) => s.accurate !== null && s.estimateConfidence !== null,
  );

  if (withProbability.length === 0) {
    return { score: null, n: 0, interpretation: null };
  }

  let sumSquaredError = 0;
  for (const s of withProbability) {
    const predicted = normalizeConfidence(s.estimateConfidence);
    const outcome = s.accurate ? 1 : 0;
    sumSquaredError += (predicted - outcome) ** 2;
  }

  const score =
    Math.round((sumSquaredError / withProbability.length) * 1000) / 1000;

  let interpretation;
  if (score <= 0.1)
    interpretation =
      "Excellent calibration -- approaching expert forecaster levels.";
  else if (score <= 0.2)
    interpretation =
      "Good calibration -- comparable to prediction market aggregates.";
  else if (score <= 0.3)
    interpretation =
      "Moderate calibration -- room for improvement in confidence estimates.";
  else
    interpretation =
      "Weak calibration -- predictions are poorly matched to outcomes.";

  return { score, n: withProbability.length, interpretation };
}

/**
 * Build calibration curve data: bin predictions into buckets, compare predicted vs actual rates.
 * Perfect calibration follows the diagonal (predicted 70% → 70% actually happen).
 */
function computeCalibrationCurve(scored) {
  const BINS = [
    { min: 0, max: 0.2, label: "0-20%" },
    { min: 0.2, max: 0.4, label: "20-40%" },
    { min: 0.4, max: 0.6, label: "40-60%" },
    { min: 0.6, max: 0.8, label: "60-80%" },
    { min: 0.8, max: 1.01, label: "80-100%" },
  ];

  const withData = scored.filter(
    (s) => s.accurate !== null && s.estimateConfidence !== null,
  );

  if (withData.length === 0) return { bins: [], bias: null };

  const bins = BINS.map((bin) => {
    const inBin = withData.filter((s) => {
      const conf = normalizeConfidence(s.estimateConfidence);
      return conf >= bin.min && conf < bin.max;
    });

    const count = inBin.length;
    const accurateCount = inBin.filter((s) => s.accurate).length;
    const actualRate =
      count > 0 ? Math.round((accurateCount / count) * 100) : null;
    const midpoint = Math.round(((bin.min + bin.max) / 2) * 100);

    return {
      label: bin.label,
      predicted: midpoint,
      actual: actualRate,
      count,
    };
  });

  // Overall bias direction
  let overconfidentBins = 0;
  let underconfidentBins = 0;
  for (const bin of bins) {
    if (bin.count === 0 || bin.actual === null) continue;
    if (bin.predicted > bin.actual) overconfidentBins++;
    else if (bin.predicted < bin.actual) underconfidentBins++;
  }

  let bias = null;
  if (overconfidentBins > underconfidentBins) bias = "overconfident";
  else if (underconfidentBins > overconfidentBins) bias = "underconfident";
  else if (overconfidentBins > 0) bias = "mixed";

  return { bins, bias };
}

/**
 * Normalize confidence to 0-1 range.
 */
function normalizeConfidence(conf) {
  if (typeof conf === "number") return Math.max(0, Math.min(1, conf));
  if (typeof conf === "string") {
    const lower = conf.toLowerCase();
    if (lower === "high") return 0.8;
    if (lower === "medium") return 0.5;
    if (lower === "low") return 0.2;
  }
  return 0.5; // default
}

function generateInsight(
  accuracy,
  byConfidence,
  unmatchedCount,
  totalEstimates,
  brierData,
  calibrationCurve,
) {
  const parts = [];

  if (accuracy !== null) {
    if (accuracy >= 80) {
      parts.push(
        `Strong calibration: ${accuracy}% of scored predictions were accurate.`,
      );
    } else if (accuracy >= 50) {
      parts.push(
        `Moderate calibration: ${accuracy}% accuracy. Room for improvement.`,
      );
    } else {
      parts.push(
        `Weak calibration: only ${accuracy}% accuracy. Estimates may need more evidence before committing.`,
      );
    }
  }

  if (byConfidence.high !== undefined && byConfidence.low !== undefined) {
    if (byConfidence.high < byConfidence.low) {
      parts.push(
        "Overconfidence detected: high-confidence predictions are less accurate than low-confidence ones.",
      );
    }
  }

  if (totalEstimates > 0 && unmatchedCount / totalEstimates > 0.5) {
    parts.push(
      `${unmatchedCount} of ${totalEstimates} estimates have no calibration follow-up. Run /calibrate to close the loop.`,
    );
  }

  if (brierData && brierData.score !== null) {
    parts.push(`Brier score: ${brierData.score} (${brierData.interpretation})`);
  }

  if (calibrationCurve && calibrationCurve.bias) {
    if (calibrationCurve.bias === "overconfident") {
      parts.push(
        "Systematic overconfidence detected: your high-confidence predictions resolve less often than expected. Consider adding buffer to estimates.",
      );
    } else if (calibrationCurve.bias === "underconfident") {
      parts.push(
        "You tend to underestimate -- your predictions succeed more often than your confidence suggests. Trust your analysis more.",
      );
    }
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Not enough data to generate calibration insights.";
}

function daysSince(dateStr) {
  try {
    const then = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}
