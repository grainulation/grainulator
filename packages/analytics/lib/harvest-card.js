/**
 * Harvest Reports -- Spotify Wrapped for research.
 *
 * Generates:
 *   1. SVG card (1200x630, dark theme, self-contained) for GitHub README embedding
 *   2. Stats object for the full HTML report
 *
 * Design principles (from spec):
 *   - Pure temporal self-comparison (no percentiles)
 *   - Personal-best anchoring, not period-over-period deltas
 *   - Researcher archetype as identity artifact
 *   - Asymmetric framing: celebrate improvement, reframe decline
 *   - Template-based NLG (deterministic, zero-dep)
 *   - Sparkline of activity over time
 *   - Milestone detection (firsts, records, shifts)
 */

import { analyze } from "./analyzer.js";
import { calibrate } from "./calibration.js";
// ── Season detection ─────────────────────────────────────────────────────────

const SEASONS = [
  { name: "Spring", start: [3, 20], glyph: "\u{1F331}" },
  { name: "Summer", start: [6, 20], glyph: "\u{1F31E}" },
  { name: "Autumn", start: [9, 22], glyph: "\u{1F342}" },
  { name: "Winter", start: [12, 21], glyph: "\u{2744}\u{FE0F}" },
];

export function getSeason(date) {
  const d = date instanceof Date ? date : new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();

  for (let i = SEASONS.length - 1; i >= 0; i--) {
    const [sm, sd] = SEASONS[i].start;
    if (month > sm || (month === sm && day >= sd)) {
      return { ...SEASONS[i], year };
    }
  }
  // Before March 20 = still Winter of previous year
  return { ...SEASONS[3], year: year - 1 };
}

// ── Researcher archetype ─────────────────────────────────────────────────────

const ARCHETYPES = [
  {
    id: "evidence-hunter",
    label: "Evidence Hunter",
    test: (s) =>
      (s.evidenceTier.documented +
        s.evidenceTier.tested +
        s.evidenceTier.production) /
        Math.max(s.totalClaims, 1) >
      0.6,
  },
  {
    id: "risk-mapper",
    label: "Risk Mapper",
    test: (s) => (s.types.risk || 0) / Math.max(s.totalClaims, 1) > 0.2,
  },
  {
    id: "challenge-seeker",
    label: "Challenge Seeker",
    test: (s) =>
      s.challengeCount > 0 &&
      s.challengeCount / Math.max(s.totalClaims, 1) > 0.1,
  },
  {
    id: "the-prototyper",
    label: "The Prototyper",
    test: (s) =>
      (s.types.estimate || 0) / Math.max(s.totalClaims, 1) > 0.15 &&
      s.evidenceTier.tested > 0,
  },
  {
    id: "deep-researcher",
    label: "Deep Researcher",
    test: (s) => s.avgClaimsPerSprint > 15,
  },
  {
    id: "broad-explorer",
    label: "Broad Explorer",
    test: (s) => s.topicCount > 5,
  },
];

export function detectArchetype(stats) {
  for (const arch of ARCHETYPES) {
    if (arch.test(stats)) return arch;
  }
  return { id: "researcher", label: "Researcher" };
}

// ── Milestone detection ──────────────────────────────────────────────────────

export function detectMilestones(sprints) {
  const milestones = [];
  const allClaims = sprints.flatMap((s) =>
    s.claims.map((c) => ({ ...c, _sprint: s.name })),
  );

  // Firsts: first use of each claim type
  const typeFirsts = {};
  for (const c of allClaims) {
    if (!typeFirsts[c.type]) typeFirsts[c.type] = c._sprint;
  }
  for (const [type, sprint] of Object.entries(typeFirsts)) {
    milestones.push({
      kind: "first",
      label: `First ${type} claim`,
      sprint,
      type: "first-type",
    });
  }

  // Records: most claims in a single sprint
  let maxClaims = 0;
  let maxClaimsSprint = null;
  for (const s of sprints) {
    if (s.claims.length > maxClaims) {
      maxClaims = s.claims.length;
      maxClaimsSprint = s.name;
    }
  }
  if (maxClaimsSprint) {
    milestones.push({
      kind: "record",
      label: `Deepest sprint: ${maxClaims} claims`,
      sprint: maxClaimsSprint,
      value: maxClaims,
    });
  }

  // Evidence depth record
  const evidenceRank = {
    stated: 1,
    web: 2,
    documented: 3,
    tested: 4,
    production: 5,
  };
  let maxEvidence = 0;
  let maxEvidenceSprint = null;
  for (const s of sprints) {
    const avgEvidence =
      s.claims.length > 0
        ? s.claims.reduce((a, c) => a + (evidenceRank[c.evidence] || 1), 0) /
          s.claims.length
        : 0;
    if (avgEvidence > maxEvidence) {
      maxEvidence = avgEvidence;
      maxEvidenceSprint = s.name;
    }
  }
  if (maxEvidenceSprint) {
    milestones.push({
      kind: "record",
      label: `Highest evidence depth`,
      sprint: maxEvidenceSprint,
      value: Math.round(maxEvidence * 10) / 10,
    });
  }

  return milestones;
}

// ── Sparkline SVG path ───────────────────────────────────────────────────────

function sparklinePath(values, width, height) {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = Math.round(i * step * 10) / 10;
    const y = Math.round((height - (v / max) * height) * 10) / 10;
    return `${x},${y}`;
  });
  return `M${points.join(" L")}`;
}

// ── Compute report stats ─────────────────────────────────────────────────────

export function computeReportStats(sprints) {
  const analysis = analyze(sprints);
  const calibration = calibrate(sprints);

  // Per-sprint claim counts for sparkline
  const sprintCounts = sprints.map((s) => s.claims.length);

  // Evidence tier counts
  const evidenceTier = {
    stated: analysis.evidenceDistribution.stated || 0,
    web: analysis.evidenceDistribution.web || 0,
    documented: analysis.evidenceDistribution.documented || 0,
    tested: analysis.evidenceDistribution.tested || 0,
    production: analysis.evidenceDistribution.production || 0,
  };

  // Topic diversity
  const topics = new Set();
  for (const s of sprints) {
    for (const c of s.claims) {
      if (c.topic) topics.add(c.topic);
    }
  }

  // Challenge claims (x* prefix)
  const challengeCount = sprints.reduce(
    (a, s) => a + s.claims.filter((c) => c.id && c.id.startsWith("x")).length,
    0,
  );

  const stats = {
    totalSprints: sprints.length,
    totalClaims: analysis.summary.totalClaims,
    avgClaimsPerSprint: analysis.summary.averageClaimsPerSprint,
    types: analysis.typeDistribution,
    evidenceTier,
    topicCount: topics.size,
    challengeCount,
    accuracyRate: calibration.summary.accuracyRate,
    brierScore: calibration.brierScore ? calibration.brierScore.score : null,
    calibrationCurve: calibration.calibrationCurve || null,
    sprintCounts,
  };

  const archetype = detectArchetype(stats);
  const milestones = detectMilestones(sprints);
  const season = getSeason(new Date());

  return { ...stats, archetype, milestones, season };
}

// ── SVG card generation ──────────────────────────────────────────────────────

function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a self-contained SVG card (1200x630) for GitHub README embedding.
 *
 * Dark theme (#0d1117 background), no external resources, Camo-compatible.
 * Includes SMIL animation for reveal effect, with prefers-reduced-motion fallback.
 */
export function generateCard(sprints) {
  const stats = computeReportStats(sprints);
  const s = stats.season;
  const seasonLabel = `${s.name} ${s.year}`;

  // Sparkline
  const sparkWidth = 200;
  const sparkHeight = 40;
  const sparkD = sparklinePath(stats.sprintCounts, sparkWidth, sparkHeight);

  // Top evidence tier
  const topTier = Object.entries(stats.evidenceTier).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topTierLabel = topTier ? `${topTier[0]} (${topTier[1]})` : "N/A";

  // Calibration display
  const calDisplay =
    stats.accuracyRate !== null ? `${stats.accuracyRate}%` : "--";
  const brierDisplay =
    stats.brierScore !== null ? stats.brierScore.toFixed(2) : "--";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"
     role="img" aria-labelledby="harvest-title harvest-desc">
  <title id="harvest-title">Harvest Report: ${escapeXml(seasonLabel)} — ${stats.totalClaims} claims, ${stats.totalSprints} sprints, ${escapeXml(stats.archetype.label)}</title>
  <desc id="harvest-desc">Research analytics card showing ${stats.totalSprints} sprints with ${stats.totalClaims} claims. Archetype: ${escapeXml(stats.archetype.label)}. Prediction accuracy: ${calDisplay}.</desc>
  <style>
    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; }
      .fade-in { opacity: 1 !important; }
    }
    .fade-in { opacity: 0; animation: fadeIn 0.6s ease-out forwards; }
    .fade-in-d1 { animation-delay: 0.2s; }
    .fade-in-d2 { animation-delay: 0.4s; }
    .fade-in-d3 { animation-delay: 0.6s; }
    .fade-in-d4 { animation-delay: 0.8s; }
    @keyframes fadeIn { to { opacity: 1; } }
    @keyframes drawLine { from { stroke-dashoffset: 600; } to { stroke-dashoffset: 0; } }
    .sparkline { stroke-dasharray: 600; stroke-dashoffset: 600; animation: drawLine 1.5s ease-out 0.5s forwards; }
    @media (prefers-reduced-motion: reduce) { .sparkline { stroke-dashoffset: 0 !important; } }
  </style>

  <!-- Background -->
  <rect width="1200" height="630" rx="16" fill="#0d1117"/>
  <rect x="0" y="0" width="1200" height="4" fill="#f97316" rx="2"/>

  <!-- Season label -->
  <text x="60" y="60" fill="#9ca3af" font-family="system-ui, -apple-system, sans-serif" font-size="18" class="fade-in">${escapeXml(seasonLabel)}</text>

  <!-- Archetype -->
  <text x="60" y="110" fill="#f97316" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="700" class="fade-in fade-in-d1">${escapeXml(stats.archetype.label)}</text>

  <!-- Stat blocks -->
  <g class="fade-in fade-in-d2">
    <!-- Sprints -->
    <text x="60" y="190" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">SPRINTS</text>
    <text x="60" y="230" fill="#e6edf3" font-family="system-ui, sans-serif" font-size="36" font-weight="600">${stats.totalSprints}</text>

    <!-- Claims -->
    <text x="240" y="190" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">CLAIMS</text>
    <text x="240" y="230" fill="#e6edf3" font-family="system-ui, sans-serif" font-size="36" font-weight="600">${stats.totalClaims}</text>

    <!-- Accuracy -->
    <text x="440" y="190" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">ACCURACY</text>
    <text x="440" y="230" fill="#e6edf3" font-family="system-ui, sans-serif" font-size="36" font-weight="600">${calDisplay}</text>

    <!-- Brier Score -->
    <text x="640" y="190" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">BRIER SCORE</text>
    <text x="640" y="230" fill="#e6edf3" font-family="system-ui, sans-serif" font-size="36" font-weight="600">${brierDisplay}</text>
  </g>

  <!-- Evidence tier bar -->
  <g class="fade-in fade-in-d3">
    <text x="60" y="300" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">EVIDENCE DEPTH</text>
    ${renderEvidenceBar(stats.evidenceTier, stats.totalClaims)}
    <text x="60" y="360" fill="#6e7681" font-family="system-ui, sans-serif" font-size="12">Top tier: ${escapeXml(topTierLabel)}</text>
  </g>

  <!-- Sparkline -->
  <g class="fade-in fade-in-d4" transform="translate(60, 390)">
    <text x="0" y="0" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">ACTIVITY</text>
    ${sparkD ? `<path d="${sparkD}" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="sparkline" transform="translate(0, 15)"/>` : '<text x="0" y="40" fill="#6e7681" font-family="system-ui, sans-serif" font-size="12">Not enough data for sparkline</text>'}
  </g>

  <!-- Milestones -->
  <g class="fade-in fade-in-d4" transform="translate(60, 480)">
    <text x="0" y="0" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">MILESTONES</text>
    ${stats.milestones
      .slice(0, 3)
      .map(
        (m, i) =>
          `<text x="0" y="${22 + i * 22}" fill="#8b949e" font-family="system-ui, sans-serif" font-size="13">${escapeXml(m.label)}</text>`,
      )
      .join("\n    ")}
  </g>

  <!-- Calibration curve mini (right side) -->
  ${stats.calibrationCurve && stats.calibrationCurve.bins.length > 0 ? renderMiniCalibrationCurve(stats.calibrationCurve, 850, 160) : ""}

  <!-- Topics badge -->
  <g class="fade-in fade-in-d3" transform="translate(850, 390)">
    <text x="0" y="0" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">TOPICS</text>
    <text x="0" y="35" fill="#e6edf3" font-family="system-ui, sans-serif" font-size="28" font-weight="600">${stats.topicCount}</text>
    <text x="60" y="35" fill="#6e7681" font-family="system-ui, sans-serif" font-size="13">unique</text>
  </g>

  <!-- Footer -->
  <text x="60" y="605" fill="#484f58" font-family="system-ui, sans-serif" font-size="12">Powered by Harvest</text>
  <text x="1140" y="605" fill="#484f58" font-family="system-ui, sans-serif" font-size="12" text-anchor="end">${escapeXml(new Date().toISOString().split("T")[0])}</text>
</svg>`;

  return { svg, stats };
}

function renderEvidenceBar(tiers, total) {
  if (total === 0)
    return '<rect x="60" y="310" width="700" height="20" rx="4" fill="#161b22"/>';
  const barWidth = 700;
  const colors = {
    stated: "#6e7681",
    web: "#8b949e",
    documented: "#58a6ff",
    tested: "#3fb950",
    production: "#f97316",
  };
  const order = ["stated", "web", "documented", "tested", "production"];
  let x = 60;
  const rects = [];
  for (const tier of order) {
    const count = tiers[tier] || 0;
    if (count === 0) continue;
    const w = Math.max(2, Math.round((count / total) * barWidth));
    rects.push(
      `<rect x="${x}" y="310" width="${w}" height="20" fill="${colors[tier]}"/>`,
    );
    x += w;
  }
  return `<rect x="60" y="310" width="${barWidth}" height="20" rx="4" fill="#161b22"/>\n    ${rects.join("\n    ")}`;
}

/**
 * Render a mini calibration curve in the SVG card.
 * Shows predicted vs actual as dots with a diagonal reference line.
 */
function renderMiniCalibrationCurve(curve, ox, oy) {
  const size = 120;
  const elements = [];

  // Background
  elements.push(
    `<rect x="${ox}" y="${oy}" width="${size}" height="${size}" rx="4" fill="#161b22"/>`,
  );

  // Diagonal (perfect calibration)
  elements.push(
    `<line x1="${ox}" y1="${oy + size}" x2="${ox + size}" y2="${oy}" stroke="#30363d" stroke-width="1" stroke-dasharray="4,4"/>`,
  );

  // Label
  elements.push(
    `<text x="${ox}" y="${oy - 8}" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="14">CALIBRATION</text>`,
  );

  // Plot bins as dots
  for (const bin of curve.bins) {
    if (bin.count === 0 || bin.actual === null) continue;
    const x = ox + (bin.predicted / 100) * size;
    const y = oy + size - (bin.actual / 100) * size;
    const r = Math.min(8, Math.max(3, bin.count));
    elements.push(
      `<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="${r}" fill="#f97316" opacity="0.8"/>`,
    );
  }

  // Axis labels
  elements.push(
    `<text x="${ox}" y="${oy + size + 15}" fill="#484f58" font-family="system-ui, sans-serif" font-size="10">0%</text>`,
  );
  elements.push(
    `<text x="${ox + size}" y="${oy + size + 15}" fill="#484f58" font-family="system-ui, sans-serif" font-size="10" text-anchor="end">100%</text>`,
  );

  // Bias indicator
  if (curve.bias) {
    const biasLabel =
      curve.bias === "overconfident"
        ? "overconfident"
        : curve.bias === "underconfident"
          ? "underconfident"
          : "mixed";
    elements.push(
      `<text x="${ox + size / 2}" y="${oy + size + 28}" fill="#8b949e" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">${biasLabel}</text>`,
    );
  }

  return elements.join("\n  ");
}

/**
 * Generate the embed snippet for the user.
 */
export function generateEmbedSnippet(filename) {
  return {
    markdown: `![Harvest Report](./${filename})`,
    html: `<img src="./${filename}" alt="Harvest Report" width="600">`,
    path: `./${filename}`,
  };
}
