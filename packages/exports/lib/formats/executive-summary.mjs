/**
 * mill format: executive-summary
 *
 * Single-page HTML showing only active risks, top recommendations,
 * and confidence-weighted findings. Filters out resolved/low-confidence noise.
 * Accessible: semantic landmarks, table captions/scope, skip link.
 * Zero dependencies — node built-in only.
 */

import { escapeHtml as esc, capitalize } from "./_shared.mjs";

export const name = "executive-summary";
export const extension = ".html";
export const mimeType = "text/html; charset=utf-8";
export const description =
  "Compact executive summary: active risks, recommendations, evidence coverage";

/**
 * Convert a compilation object to an executive summary HTML page.
 * @param {object} compilation - The compilation.json content
 * @returns {string} HTML output
 */
export function convert(compilation) {
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
  const certificate = compilation.certificate || {};

  const title = meta.sprint || meta.question || "Executive Summary";

  // Active risks sorted by confidence desc
  const risks = claims
    .filter((c) => c.type === "risk" && c.status === "active")
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // Active recommendations sorted by confidence desc
  const recs = claims
    .filter((c) => c.type === "recommendation" && c.status === "active")
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // Evidence coverage — count by tier
  const tierOrder = ["production", "tested", "documented", "web", "stated"];
  const tierCounts = {};
  for (const c of claims) {
    if (c.status === "reverted") continue;
    const tier =
      typeof c.evidence === "string"
        ? c.evidence
        : c.evidence?.tier || c.evidence_tier || "unknown";
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  }

  const riskRows = risks
    .map((c) => {
      const conf =
        c.confidence != null ? Math.round(c.confidence * 100) + "%" : "--";
      const tier =
        typeof c.evidence === "string" ? c.evidence : c.evidence?.tier || "";
      return `<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.content || c.text || "")}</td><td class="center">${esc(tier)}</td><td class="center">${conf}</td></tr>`;
    })
    .join("\n");

  const recRows = recs
    .map((c) => {
      const conf =
        c.confidence != null ? Math.round(c.confidence * 100) + "%" : "--";
      const tier =
        typeof c.evidence === "string" ? c.evidence : c.evidence?.tier || "";
      return `<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.content || c.text || "")}</td><td class="center">${esc(tier)}</td><td class="center">${conf}</td></tr>`;
    })
    .join("\n");

  const evidenceRows = tierOrder
    .filter((t) => tierCounts[t])
    .map(
      (t) =>
        `<tr><td>${capitalize(t)}</td><td class="center">${tierCounts[t]}</td></tr>`,
    )
    .join("\n");
  // Include unknown tiers
  const extraTiers = Object.keys(tierCounts)
    .filter((t) => !tierOrder.includes(t))
    .map(
      (t) =>
        `<tr><td>${capitalize(t)}</td><td class="center">${tierCounts[t]}</td></tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Executive Summary</title>
<style>
  :root { --bg:#0a0e1a; --surface:#111827; --border:#1e293b; --text:#e2e8f0; --muted:#94a3b8; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6; padding:2rem; max-width:900px; margin:0 auto; }
  a.skip-link { position:absolute; top:-40px; left:0; background:var(--surface); color:var(--text); padding:0.5rem 1rem; z-index:100; border-radius:0 0 4px 0; }
  a.skip-link:focus { top:0; }
  h1 { font-size:1.6rem; margin-bottom:0.25rem; }
  .subtitle { color:var(--muted); font-size:0.9rem; margin-bottom:2rem; }
  h2 { font-size:1.1rem; margin:1.5rem 0 0.75rem; padding-bottom:0.4rem; border-bottom:1px solid var(--border); }
  h2 .count { color:var(--muted); font-weight:400; }
  table { width:100%; border-collapse:collapse; margin-bottom:1rem; }
  caption { text-align:left; font-size:0.75rem; color:var(--muted); padding-bottom:0.25rem; caption-side:top; }
  th { text-align:left; font-size:0.75rem; text-transform:uppercase; color:var(--muted); padding:0.5rem; border-bottom:1px solid var(--border); }
  td { padding:0.5rem; border-bottom:1px solid var(--border); font-size:0.88rem; vertical-align:top; }
  .center { text-align:center; }
  .mono { font-family:monospace; font-size:0.8rem; white-space:nowrap; }
  .risk-table tr:hover { background:rgba(243,156,18,0.06); }
  .rec-table tr:hover { background:rgba(46,204,113,0.06); }
  .empty { color:var(--muted); font-style:italic; padding:1rem 0; }
  footer { margin-top:2rem; padding-top:0.75rem; border-top:1px solid var(--border); color:var(--muted); font-size:0.75rem; font-family:monospace; }
</style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header role="banner">
    <h1>${esc(title)}</h1>
    <p class="subtitle">${meta.question ? esc(meta.question) : ""}${meta.question && certificate.compiled_at ? " | " : ""}${certificate.compiled_at ? "Compiled: " + esc(certificate.compiled_at) : ""}</p>
  </header>

  <main id="main-content">
  <section aria-label="Key risks">
  <h2>Key Risks <span class="count">(${risks.length})</span></h2>
  ${
    risks.length > 0
      ? `
  <table class="risk-table">
    <caption>Active risks sorted by confidence</caption>
    <thead><tr><th scope="col">ID</th><th scope="col">Description</th><th scope="col">Evidence</th><th scope="col">Confidence</th></tr></thead>
    <tbody>${riskRows}</tbody>
  </table>`
      : '<p class="empty">No active risks.</p>'
  }
  </section>

  <section aria-label="Recommendations">
  <h2>Recommendations <span class="count">(${recs.length})</span></h2>
  ${
    recs.length > 0
      ? `
  <table class="rec-table">
    <caption>Active recommendations sorted by confidence</caption>
    <thead><tr><th scope="col">ID</th><th scope="col">Description</th><th scope="col">Evidence</th><th scope="col">Confidence</th></tr></thead>
    <tbody>${recRows}</tbody>
  </table>`
      : '<p class="empty">No active recommendations.</p>'
  }
  </section>

  <section aria-label="Evidence coverage">
  <h2>Evidence Coverage</h2>
  <table>
    <caption>Claims count per evidence tier</caption>
    <thead><tr><th scope="col">Tier</th><th scope="col">Claims</th></tr></thead>
    <tbody>${evidenceRows}${extraTiers}</tbody>
  </table>
  </section>
  </main>

  <footer role="contentinfo">
    Certificate: ${certificate.claim_count || claims.length} claims | sha256:${(certificate.sha256 || "unknown").slice(0, 16)}
  </footer>
</body>
</html>`;
}
