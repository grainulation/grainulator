/**
 * mill format: html-report
 *
 * Self-contained HTML report with inline CSS (dark theme).
 * Claims grouped by type with colored badges, filterable via CSS class toggles.
 * Accessible: semantic landmarks, ARIA roles, keyboard support, reduced-motion.
 * Zero dependencies — node built-in only.
 */

import { typeColors, escapeHtml as esc, capitalize } from "./_shared.mjs";

export const name = "html-report";
export const extension = ".html";
export const mimeType = "text/html; charset=utf-8";
export const description =
  "Self-contained dark-theme HTML report with type filters and claim cards";

/**
 * Convert a compilation object to an HTML report.
 * @param {object} compilation - The compilation.json content
 * @returns {string} HTML output
 */
export function convert(compilation) {
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
  const conflicts = compilation.conflicts || [];
  const certificate = compilation.certificate || {};

  const title = meta.sprint || meta.question || "Sprint Report";
  const compiled = certificate.compiled_at || new Date().toISOString();

  // Group claims by type (skip reverted)
  const byType = {};
  const typeCounts = {};
  for (const c of claims) {
    if (c.status === "reverted") continue;
    const t = c.type || "unknown";
    if (!byType[t]) byType[t] = [];
    byType[t].push(c);
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  const typeOrder = [
    "constraint",
    "factual",
    "recommendation",
    "risk",
    "estimate",
    "feedback",
  ];
  const sortedTypes = typeOrder.filter((t) => byType[t]);
  for (const t of Object.keys(byType)) {
    if (!sortedTypes.includes(t)) sortedTypes.push(t);
  }

  const active = claims.filter((c) => c.status === "active").length;

  // Build filter buttons with aria-pressed
  const filterButtons = sortedTypes
    .map((t) => {
      const color = typeColors[t] || typeColors.unknown;
      return `<button class="filter-btn active" data-type="${esc(t)}" style="--badge-color:${color}" aria-pressed="true" onclick="toggleType('${esc(t)}')">${capitalize(t)} (${typeCounts[t]})</button>`;
    })
    .join("\n      ");

  // Build type sections
  const sections = sortedTypes
    .map((t) => {
      const group = byType[t];
      const color = typeColors[t] || typeColors.unknown;
      const cards = group
        .map((c) => {
          const body = esc(c.content || c.text || "");
          const evidenceTier =
            typeof c.evidence === "string"
              ? c.evidence
              : c.evidence?.tier || c.evidence_tier || "";
          const conf =
            c.confidence != null ? Math.round(c.confidence * 100) : null;
          const tags = Array.isArray(c.tags)
            ? c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")
            : "";
          const confBar =
            conf != null
              ? `<div class="conf-bar" role="progressbar" aria-valuenow="${conf}" aria-valuemin="0" aria-valuemax="100" aria-label="Confidence: ${conf}%"><div class="conf-fill" style="width:${conf}%"></div><span class="conf-label">${conf}%</span></div>`
              : "";
          return `
        <article class="claim-card" aria-labelledby="claim-${esc(c.id)}">
          <div class="card-header">
            <span class="claim-id" id="claim-${esc(c.id)}">${esc(c.id)}</span>
            ${evidenceTier ? `<span class="evidence-badge">evidence: ${esc(evidenceTier)}</span>` : ""}
            <span class="status-badge status-${esc(c.status || "active")}">status: ${esc(c.status || "active")}</span>
          </div>
          <p class="card-body">${body}</p>
          ${tags ? `<div class="card-tags" aria-label="Tags">${tags}</div>` : ""}
          ${confBar}
        </article>`;
        })
        .join("\n");

      return `
    <section class="type-section" data-type="${esc(t)}" aria-label="${capitalize(t)} claims">
      <h2 style="border-left:4px solid ${color};padding-left:12px">${capitalize(t)}s (${group.length})</h2>
      <div class="cards">${cards}
      </div>
    </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --bg:#0a0e1a; --surface:#111827; --border:#1e293b; --text:#e2e8f0; --muted:#94a3b8; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6; padding:2rem; }
  a.skip-link { position:absolute; top:-40px; left:0; background:var(--surface); color:var(--text); padding:0.5rem 1rem; z-index:100; border-radius:0 0 4px 0; text-decoration:none; }
  a.skip-link:focus { top:0; outline:2px solid #3b82f6; }
  header { margin-bottom:2rem; }
  header h1 { font-size:1.8rem; margin-bottom:0.5rem; }
  header p { color:var(--muted); font-size:0.9rem; }
  .stats-bar { display:flex; gap:1.5rem; padding:1rem; background:var(--surface); border-radius:8px; margin-bottom:1.5rem; flex-wrap:wrap; }
  .stat { text-align:center; }
  .stat .num { font-size:1.4rem; font-weight:700; }
  .stat .label { font-size:0.75rem; color:var(--muted); text-transform:uppercase; }
  .filters { display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:2rem; }
  .filter-btn { background:var(--surface); color:var(--text); border:1px solid var(--border); padding:0.4rem 0.8rem; border-radius:4px; cursor:pointer; font-size:0.85rem; transition:opacity 0.2s; }
  .filter-btn:focus-visible { outline:2px solid #3b82f6; outline-offset:2px; }
  .filter-btn.active { border-color:var(--badge-color); box-shadow:0 0 0 1px var(--badge-color); }
  .filter-btn:not(.active) { opacity:0.4; }
  .type-section { margin-bottom:2rem; }
  .type-section[hidden] { display:none; }
  .type-section h2 { font-size:1.2rem; margin-bottom:1rem; }
  .cards { display:grid; gap:0.75rem; }
  .claim-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:1rem; }
  .card-header { display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; }
  .claim-id { font-weight:700; font-family:monospace; font-size:0.85rem; }
  .evidence-badge { background:#1e3a5f; color:#60a5fa; padding:0.15rem 0.5rem; border-radius:3px; font-size:0.75rem; }
  .status-badge { padding:0.15rem 0.5rem; border-radius:3px; font-size:0.7rem; text-transform:uppercase; }
  .status-active { background:#064e3b; color:#34d399; }
  .status-superseded { background:#4a3728; color:#fbbf24; }
  .card-body { color:var(--text); font-size:0.9rem; }
  .card-tags { display:flex; gap:0.3rem; flex-wrap:wrap; margin-top:0.5rem; }
  .tag { background:var(--border); padding:0.1rem 0.4rem; border-radius:3px; font-size:0.7rem; color:var(--muted); }
  .conf-bar { position:relative; height:6px; background:var(--border); border-radius:3px; margin-top:0.5rem; }
  .conf-fill { height:100%; background:#3b82f6; border-radius:3px; }
  .conf-label { position:absolute; right:0; top:-16px; font-size:0.7rem; color:var(--muted); }
  footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--border); color:var(--muted); font-size:0.8rem; font-family:monospace; }
  @media (prefers-reduced-motion:reduce) { .filter-btn { transition:none; } }
  @media print { body { background:#fff; color:#000; } .skip-link { display:none; } .filter-btn { border-color:#ccc; } }
</style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header role="banner">
    <h1>${esc(title)}</h1>
    ${meta.question ? `<p>${esc(meta.question)}</p>` : ""}
    <p>Compiled: <time datetime="${esc(compiled)}">${esc(compiled)}</time>${meta.audience ? ` | Audience: ${esc(meta.audience)}` : ""}</p>
  </header>

  <main id="main-content" role="main">
  <section aria-label="Summary statistics">
  <h2 class="sr-only">Summary</h2>
  <div class="stats-bar" role="list">
    <div class="stat" role="listitem"><div class="num" aria-label="${claims.length} total claims">${claims.length}</div><div class="label">Total</div></div>
    <div class="stat" role="listitem"><div class="num" aria-label="${active} active claims">${active}</div><div class="label">Active</div></div>
    ${sortedTypes.map((t) => `<div class="stat" role="listitem"><div class="num" aria-label="${typeCounts[t]} ${t} claims">${typeCounts[t]}</div><div class="label">${capitalize(t)}</div></div>`).join("\n    ")}
    ${conflicts.length ? `<div class="stat" role="listitem"><div class="num" aria-label="${conflicts.length} conflicts">${conflicts.length}</div><div class="label">Conflicts</div></div>` : ""}
  </div>
  </section>

  <nav class="filters" aria-label="Filter claims by type">
    ${filterButtons}
  </nav>

  ${sections}
  </main>

  <footer role="contentinfo">
    <p>Certificate: ${certificate.claim_count || claims.length} claims | sha256:${(certificate.sha256 || "unknown").slice(0, 16)}</p>
  </footer>

  <script>
    function toggleType(type) {
      var btn = document.querySelector('.filter-btn[data-type="' + type + '"]');
      var section = document.querySelector('.type-section[data-type="' + type + '"]');
      if (!btn || !section) return;
      var isActive = btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', String(isActive));
      if (isActive) { section.removeAttribute('hidden'); } else { section.setAttribute('hidden', ''); }
    }
    // Keyboard support: Enter/Space toggles filter buttons
    document.querySelectorAll('.filter-btn').forEach(function(btn) {
      btn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
    });
  </script>
</body>
</html>`;
}
