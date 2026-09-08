import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate retrospective HTML reports.
 *
 * Combines all analysis modules into a single dark-themed HTML report.
 */

export function generateReport(sprints, fns) {
  const analysis = fns.analyzeFn(sprints);
  const calibration = fns.calibrateFn(sprints);
  const patterns = fns.patternsFn(sprints);
  const decay = fns.decayFn(sprints);
  const velocity = fns.velocityFn(sprints);
  const tokens = fns.tokensFn ? fns.tokensFn(sprints) : null;
  const wrapped = fns.wrappedFn
    ? fns.wrappedFn(sprints, { tokenReport: tokens })
    : null;

  // Try to load template
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "retrospective.html",
  );
  let template;
  try {
    template = fs.readFileSync(templatePath, "utf8");
  } catch {
    template = getDefaultTemplate();
  }

  // Inject data into template
  const html = template
    .replace("{{GENERATED_DATE}}", new Date().toISOString().split("T")[0])
    .replace("{{SPRINT_COUNT}}", String(analysis.summary.totalSprints))
    .replace("{{CLAIM_COUNT}}", String(analysis.summary.totalClaims))
    .replace("{{AVG_CLAIMS}}", String(analysis.summary.averageClaimsPerSprint))
    .replace(
      "{{ACCURACY_RATE}}",
      calibration.summary.accuracyRate !== null
        ? calibration.summary.accuracyRate + "%"
        : "N/A",
    )
    .replace("{{ESTIMATE_COUNT}}", String(calibration.summary.totalEstimates))
    .replace("{{MATCHED_COUNT}}", String(calibration.summary.matched))
    .replace("{{UNMATCHED_COUNT}}", String(calibration.summary.unmatched))
    .replace("{{CALIBRATION_INSIGHT}}", escapeHtml(calibration.insight))
    .replace("{{PATTERN_COUNT}}", String(patterns.summary.patternsFound))
    .replace(
      "{{ANTI_PATTERN_COUNT}}",
      String(patterns.summary.antiPatternsFound),
    )
    .replace("{{PATTERN_INSIGHT}}", escapeHtml(patterns.insight))
    .replace("{{PATTERNS_LIST}}", renderPatternsList(patterns))
    .replace("{{ANTI_PATTERNS_LIST}}", renderAntiPatternsList(patterns))
    .replace("{{STALE_COUNT}}", String(decay.summary.staleCount))
    .replace("{{DECAYING_COUNT}}", String(decay.summary.decayingCount))
    .replace("{{UNRESOLVED_COUNT}}", String(decay.summary.unresolvedCount))
    .replace("{{DECAY_INSIGHT}}", escapeHtml(decay.insight))
    .replace(
      "{{AVG_DURATION}}",
      velocity.summary.avgDurationDays !== null
        ? velocity.summary.avgDurationDays + " days"
        : "N/A",
    )
    .replace(
      "{{AVG_CLAIMS_PER_DAY}}",
      velocity.summary.avgClaimsPerDay !== null
        ? String(velocity.summary.avgClaimsPerDay)
        : "N/A",
    )
    .replace("{{TOTAL_STALLS}}", String(velocity.summary.totalStalls))
    .replace("{{VELOCITY_INSIGHT}}", escapeHtml(velocity.insight))
    .replace(
      "{{TYPE_DISTRIBUTION}}",
      renderDistribution(analysis.typeDistribution),
    )
    .replace(
      "{{EVIDENCE_DISTRIBUTION}}",
      renderDistribution(analysis.evidenceDistribution),
    )
    .replace(
      "{{WEAK_CLAIMS_TABLE}}",
      renderWeakClaimsTable(analysis.weakClaims),
    )
    .replace(
      "{{DECAY_TABLE}}",
      renderDecayTable([...decay.stale, ...decay.decaying]),
    )
    .replace("{{VELOCITY_TABLE}}", renderVelocityTable(velocity.sprints))
    .replace("{{TOKEN_COST_SECTION}}", renderTokenCostSection(tokens))
    .replace("{{WRAPPED_SECTION}}", renderWrappedSection(wrapped));

  return html;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDistribution(dist) {
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([key, val]) =>
        `<div class="bar-row"><span class="bar-label">${escapeHtml(key)}</span><div class="bar" style="width: ${Math.min(100, val * 5)}%">${val}</div></div>`,
    )
    .join("\n");
}

function renderPatternsList(patterns) {
  if (patterns.patterns.length === 0)
    return '<p class="muted">No positive patterns detected yet.</p>';
  return (
    "<ul>" +
    patterns.patterns
      .map(
        (p) =>
          `<li><strong>${escapeHtml(p.pattern)}</strong> (${escapeHtml(p.sprint)}): ${escapeHtml(p.description)}</li>`,
      )
      .join("") +
    "</ul>"
  );
}

function renderAntiPatternsList(patterns) {
  if (patterns.antiPatterns.length === 0)
    return '<p class="muted">No anti-patterns detected.</p>';
  return (
    "<ul>" +
    patterns.antiPatterns
      .map(
        (p) =>
          `<li class="severity-${p.severity}"><strong>${escapeHtml(p.pattern)}</strong> (${escapeHtml(p.sprint)}): ${escapeHtml(p.description)}</li>`,
      )
      .join("") +
    "</ul>"
  );
}

function renderWeakClaimsTable(claims) {
  if (claims.length === 0)
    return '<p class="muted">All claims have solid evidence.</p>';
  const rows = claims
    .slice(0, 20)
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.sprint)}</td><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.evidence)}</td><td>${escapeHtml(String(c.text || ""))}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>ID</th><th>Sprint</th><th>Type</th><th>Evidence</th><th>Claim</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderDecayTable(items) {
  if (items.length === 0)
    return '<p class="muted">No knowledge decay detected.</p>';
  const rows = items
    .slice(0, 20)
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.sprint)}</td><td>${c.ageDays || "?"} days</td><td>${escapeHtml(c.reason)}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>ID</th><th>Sprint</th><th>Age</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderVelocityTable(sprintResults) {
  if (sprintResults.length === 0)
    return '<p class="muted">No velocity data available.</p>';
  const rows = sprintResults
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.sprint)}</td><td>${s.durationDays ?? "N/A"}</td><td>${s.totalClaims ?? "?"}</td><td>${s.claimsPerDay ?? "N/A"}</td><td>${s.stalls.length}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Sprint</th><th>Days</th><th>Claims</th><th>Claims/Day</th><th>Stalls</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTokenCostSection(tokens) {
  if (!tokens || !tokens.summary) return "";
  const s = tokens.summary;

  if (s.sprintsWithUsageData === 0 && s.totalCostUsd === 0) {
    return '<section class="report-section"><h2>Token Costs</h2><p class="muted">No token usage data available. Integrate Agent SDK to track costs.</p></section>';
  }

  const rows = (tokens.perSprint || [])
    .filter((sp) => sp.cost !== null)
    .slice(0, 20)
    .map(
      (sp) =>
        `<tr><td>${escapeHtml(sp.sprint)}</td><td>$${sp.cost?.toFixed(4) || "?"}</td><td>${sp.claimCount}</td><td>${sp.verifiedClaims}</td><td>${sp.costPerVerifiedClaim !== null ? "$" + sp.costPerVerifiedClaim.toFixed(4) : "N/A"}</td></tr>`,
    )
    .join("");

  const table = rows
    ? `<table><thead><tr><th>Sprint</th><th>Cost</th><th>Claims</th><th>Verified</th><th>Cost/Verified</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";

  return `<section class="report-section">
  <h2>Token Costs</h2>
  <div class="stats-row">
    <div class="stat-box"><span class="stat-num">$${s.totalCostUsd?.toFixed(4) || "0"}</span><span class="stat-label">Total Cost</span></div>
    <div class="stat-box"><span class="stat-num">${s.costPerVerifiedClaim !== null ? "$" + s.costPerVerifiedClaim.toFixed(4) : "N/A"}</span><span class="stat-label">Cost / Verified Claim</span></div>
    <div class="stat-box"><span class="stat-num">${s.avgCostPerSprint !== null ? "$" + s.avgCostPerSprint.toFixed(4) : "N/A"}</span><span class="stat-label">Avg Cost / Sprint</span></div>
    <div class="stat-box"><span class="stat-num">${s.cacheHitRate !== null ? s.cacheHitRate + "%" : "N/A"}</span><span class="stat-label">Cache Hit Rate</span></div>
  </div>
  <p class="insight">${escapeHtml(tokens.insight || "")}</p>
  ${table}
</section>`;
}

function renderWrappedSection(wrapped) {
  if (!wrapped) return "";

  const personality = wrapped.personality || {};
  const stats = wrapped.stats || {};
  const highlights = wrapped.highlights || [];
  const tierProg = wrapped.tierProgression;
  const tokenSum = wrapped.tokenSummary;

  const highlightItems =
    highlights.length > 0
      ? "<ul>" +
        highlights
          .map(
            (h) =>
              `<li><strong>[${escapeHtml(h.type)}]</strong> ${escapeHtml(h.text)}</li>`,
          )
          .join("") +
        "</ul>"
      : '<p class="muted">Keep researching to unlock achievements.</p>';

  const tierTrend = tierProg
    ? `<p>Evidence quality trend: <strong>${escapeHtml(tierProg.trend)}</strong> (early avg: ${tierProg.firstHalfAvg}, recent avg: ${tierProg.secondHalfAvg})</p>`
    : "";

  const tokenLine =
    tokenSum && tokenSum.totalCostUsd > 0
      ? `<p>Total research cost: <strong>$${tokenSum.totalCostUsd.toFixed(4)}</strong>${tokenSum.costPerVerifiedClaim ? ` | $${tokenSum.costPerVerifiedClaim.toFixed(4)} per verified claim` : ""}${tokenSum.costTrend ? ` | Trend: ${tokenSum.costTrend.direction}` : ""}</p>`
      : "";

  const topTagsList = (stats.topTags || [])
    .slice(0, 5)
    .map(
      (t) =>
        `<span class="wrapped-tag">${escapeHtml(t.tag)} (${t.count})</span>`,
    )
    .join(" ");

  return `<section class="report-section wrapped-section">
  <h2>Harvest Wrapped${wrapped.period ? " -- " + escapeHtml(wrapped.period.label) : ""}</h2>
  <div class="personality-card">
    <h3>${escapeHtml(personality.label || "Researcher")}</h3>
    <p>${escapeHtml(personality.description || "")}</p>
  </div>
  <div class="stats-row">
    <div class="stat-box"><span class="stat-num">${wrapped.sprintCount || 0}</span><span class="stat-label">Sprints</span></div>
    <div class="stat-box"><span class="stat-num">${stats.totalClaims || 0}</span><span class="stat-label">Total Claims</span></div>
    <div class="stat-box"><span class="stat-num">${stats.avgClaimsPerSprint || 0}</span><span class="stat-label">Avg Claims/Sprint</span></div>
  </div>
  ${tierTrend}
  ${tokenLine}
  ${topTagsList ? '<div class="wrapped-tags">' + topTagsList + "</div>" : ""}
  <h3>Highlights</h3>
  ${highlightItems}
</section>`;
}

function getDefaultTemplate() {
  // Fallback inline template if file not found
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Harvest Retrospective</title>
<style>body{background:#0f0f0f;color:#e5e5e5;font-family:system-ui;padding:2rem;max-width:900px;margin:0 auto}
h1,h2{color:#f97316}.muted{color:#888}
.report-section{margin-bottom:2rem;padding:1rem;background:#1a1a1a;border-radius:8px}
.stats-row{display:flex;gap:1.5rem;flex-wrap:wrap;margin:1rem 0}
.stat-box{text-align:center;flex:1;min-width:100px}
.stat-num{font-size:1.4rem;font-weight:700;display:block}
.stat-label{font-size:0.75rem;color:#888;text-transform:uppercase}
.insight{color:#94a3b8;font-style:italic;margin:0.5rem 0}
.personality-card{background:#1e293b;border-left:4px solid #f97316;padding:1rem;border-radius:4px;margin-bottom:1rem}
.personality-card h3{margin:0 0 0.5rem 0;color:#f97316}
.wrapped-tags{display:flex;gap:0.3rem;flex-wrap:wrap;margin:0.5rem 0}
.wrapped-tag{background:#1e293b;padding:0.15rem 0.5rem;border-radius:3px;font-size:0.8rem;color:#94a3b8}
table{width:100%;border-collapse:collapse;margin:1rem 0}
th,td{text-align:left;padding:0.4rem 0.6rem;border-bottom:1px solid #333}
th{color:#f97316;font-size:0.8rem;text-transform:uppercase}
</style></head>
<body><h1>Harvest Retrospective</h1><p>Generated: {{GENERATED_DATE}}</p>
<p>{{SPRINT_COUNT}} sprints, {{CLAIM_COUNT}} claims</p>
{{WRAPPED_SECTION}}
{{TOKEN_COST_SECTION}}
</body></html>`;
}
