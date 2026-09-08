/**
 * Sprint timing and phase analysis.
 *
 * Uses git log timestamps and claim metadata to understand:
 * - How long sprints take end-to-end
 * - Which phases take the most time
 * - Where sprints stall (gaps between commits)
 * - Claims-per-day throughput
 */

const PHASE_PREFIXES = {
  cal: "calibration",
  burn: "control-burn",
  d: "define",
  r: "research",
  p: "prototype",
  e: "evaluate",
  f: "feedback",
  x: "challenge",
  w: "witness",
};

export function measureVelocity(sprints) {
  const results = [];

  for (const sprint of sprints) {
    const claims = sprint.claims;
    const gitLog = sprint.gitLog || [];

    // Extract timestamps from claims
    const claimDates = claims
      .map((c) => c.created || c.date || c.timestamp)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a - b);

    // Extract timestamps from git log
    const gitDates = gitLog
      .map((g) => new Date(g.date))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a - b);

    // Use whichever source has data
    const allDates = [...claimDates, ...gitDates].sort((a, b) => a - b);

    if (allDates.length < 2) {
      results.push({
        sprint: sprint.name,
        durationDays: null,
        claimsPerDay: null,
        phases: extractPhaseTimings(claims),
        stalls: [],
        note: "Insufficient timestamp data.",
      });
      continue;
    }

    const startDate = allDates[0];
    const endDate = allDates[allDates.length - 1];
    const durationDays = Math.max(
      1,
      Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)),
    );
    const claimsPerDay = Math.round((claims.length / durationDays) * 10) / 10;

    // Detect stalls: gaps > 2 days between consecutive activity
    const stalls = [];
    for (let i = 1; i < allDates.length; i++) {
      const gap = (allDates[i] - allDates[i - 1]) / (1000 * 60 * 60 * 24);
      if (gap > 2) {
        stalls.push({
          afterDate: allDates[i - 1].toISOString().split("T")[0],
          beforeDate: allDates[i].toISOString().split("T")[0],
          gapDays: Math.round(gap * 10) / 10,
        });
      }
    }

    results.push({
      sprint: sprint.name,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      durationDays,
      totalClaims: claims.length,
      claimsPerDay,
      phases: extractPhaseTimings(claims),
      stalls,
      gitCommits: gitLog.length,
    });
  }

  // Aggregate stats
  const validResults = results.filter((r) => r.durationDays !== null);
  const avgDuration =
    validResults.length > 0
      ? Math.round(
          (validResults.reduce((a, r) => a + r.durationDays, 0) /
            validResults.length) *
            10,
        ) / 10
      : null;
  const avgClaimsPerDay =
    validResults.length > 0
      ? Math.round(
          (validResults.reduce((a, r) => a + r.claimsPerDay, 0) /
            validResults.length) *
            10,
        ) / 10
      : null;
  const totalStalls = results.reduce((a, r) => a + r.stalls.length, 0);

  return {
    summary: {
      sprintsAnalyzed: validResults.length,
      avgDurationDays: avgDuration,
      avgClaimsPerDay,
      totalStalls,
    },
    sprints: results,
    insight: generateVelocityInsight(validResults, totalStalls),
  };
}

function extractPhaseTimings(claims) {
  const phases = {};

  for (const claim of claims) {
    if (!claim.id) continue;
    // Extract prefix — try multi-character prefixes first, then single-character
    const match = claim.id.match(/^([a-z]+)/);
    if (!match) continue;
    const letters = match[1];
    const prefix =
      Object.keys(PHASE_PREFIXES).find((k) => letters.startsWith(k)) ||
      letters.charAt(0);
    const phaseName = PHASE_PREFIXES[prefix] || prefix;

    if (!phases[phaseName]) {
      phases[phaseName] = { count: 0, firstDate: null, lastDate: null };
    }
    phases[phaseName].count++;

    const date = claim.created || claim.date || claim.timestamp;
    if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        if (
          !phases[phaseName].firstDate ||
          d < new Date(phases[phaseName].firstDate)
        ) {
          phases[phaseName].firstDate = d.toISOString().split("T")[0];
        }
        if (
          !phases[phaseName].lastDate ||
          d > new Date(phases[phaseName].lastDate)
        ) {
          phases[phaseName].lastDate = d.toISOString().split("T")[0];
        }
      }
    }
  }

  return phases;
}

function generateVelocityInsight(results, totalStalls) {
  const parts = [];

  if (results.length === 0) {
    return "No sprint timing data available.";
  }

  const avgDuration =
    results.reduce((a, r) => a + r.durationDays, 0) / results.length;
  parts.push(
    `Average sprint duration: ${Math.round(avgDuration * 10) / 10} days.`,
  );

  if (totalStalls > 0) {
    parts.push(
      `${totalStalls} stall(s) detected across sprints (gaps > 2 days between activity).`,
    );
  }

  // Find the slowest phase across all sprints
  const phaseTotals = {};
  for (const r of results) {
    for (const [phase, data] of Object.entries(r.phases)) {
      phaseTotals[phase] = (phaseTotals[phase] || 0) + data.count;
    }
  }
  const topPhase = Object.entries(phaseTotals).sort((a, b) => b[1] - a[1])[0];
  if (topPhase) {
    parts.push(
      `Most active phase: ${topPhase[0]} (${topPhase[1]} claims across all sprints).`,
    );
  }

  return parts.join(" ");
}
