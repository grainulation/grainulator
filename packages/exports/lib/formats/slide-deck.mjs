/** Self-contained, accessible Grainulator presentation with native scrolling. */
import { typeColors, escapeHtml as esc, capitalize } from "./_shared.mjs";

export const name = "slide-deck";
export const extension = ".html";
export const mimeType = "text/html; charset=utf-8";
export const description =
  "Accessible slide deck with native scrolling and paginated claim groups";

const chunks = (items, size = 4) => {
  const pages = [];
  for (let index = 0; index < items.length; index += size)
    pages.push(items.slice(index, index + size));
  return pages;
};

export function convert(compilation) {
  const meta = compilation.sprint_meta || compilation.meta || {};
  const claims = (compilation.resolved_claims || compilation.claims || []).filter(
    (claim) => !["reverted", "superseded", "refuted"].includes(claim.status),
  );
  const conflicts = compilation.conflict_graph?.unresolved || compilation.conflicts || [];
  const certificate = compilation.compilation_certificate || compilation.certificate || {};
  const title = meta.sprint || meta.question || "Sprint Deck";
  const compiled = compilation.compiled_at || certificate.compiled_at || "Not recorded";
  const hash = certificate.input_hash || certificate.sha256;
  const active = claims.filter((claim) => claim.status === "active").length;
  const byType = new Map();
  for (const claim of claims) {
    const type = claim.type || "unknown";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(claim);
  }
  const typeOrder = ["constraint", "factual", "recommendation", "risk", "estimate", "feedback"];
  const sortedTypes = [
    ...typeOrder.filter((type) => byType.has(type)),
    ...Array.from(byType.keys()).filter((type) => !typeOrder.includes(type)),
  ];
  const colorFor = (type) => Object.hasOwn(typeColors, type) ? typeColors[type] : typeColors.unknown;
  const slides = [];
  const addSlide = (label, content) => slides.push({ label, content });
  addSlide("Title", `<div class="slide-content title-slide">
    <h1>${esc(title)}</h1>
    ${meta.sprint && meta.question ? `<p class="question">${esc(meta.question)}</p>` : ""}
    <p class="meta">${esc(compiled)} · ${claims.length} claims</p>
  </div>`);
  addSlide("Summary", `<div class="slide-content">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="big-stat"><span class="num">${claims.length}</span><span class="label">Total</span></div>
      <div class="big-stat"><span class="num">${active}</span><span class="label">Active</span></div>
      ${conflicts.length ? `<div class="big-stat"><span class="num">${conflicts.length}</span><span class="label">Conflicts</span></div>` : ""}
    </div>
    <div class="type-stats">${sortedTypes.map((type) => `<div class="type-stat"><span class="dot" style="background:${colorFor(type)}" aria-hidden="true"></span>${esc(capitalize(type))}: ${byType.get(type).length}</div>`).join("\n")}</div>
  </div>`);
  for (const type of sortedTypes) {
    const pages = chunks(byType.get(type));
    pages.forEach((group, index) => {
      const label = `${capitalize(type)} claims${pages.length > 1 ? ` (${index + 1} of ${pages.length})` : ""}`;
      const items = group.map((claim) => `<li><strong>${esc(claim.id)}</strong>${Number.isFinite(claim.confidence) ? ` (${Math.round(claim.confidence * 100)}%)` : ""}: ${esc(claim.content || claim.text || "")}</li>`).join("\n");
      addSlide(label, `<div class="slide-content"><h2 style="border-left:4px solid ${colorFor(type)};padding-left:12px">${esc(label)}</h2><ul class="claim-list">${items}</ul></div>`);
    });
  }
  const conflictPages = chunks(conflicts);
  conflictPages.forEach((group, index) => {
    const label = `Conflicts${conflictPages.length > 1 ? ` (${index + 1} of ${conflictPages.length})` : ""}`;
    const items = group.map((conflict) => {
      const ids = conflict.ids?.join(" vs ") || [conflict.claimA, conflict.claimB].filter(Boolean).join(" vs ") || "unknown";
      return `<li><strong>${esc(ids)}</strong>${conflict.resolution ? " [resolved]" : ""}: ${esc(conflict.description || conflict.reason || "")}</li>`;
    }).join("\n");
    addSlide(label, `<div class="slide-content"><h2>${esc(label)}</h2><ul class="claim-list">${items}</ul></div>`);
  });
  addSlide("Certificate", `<div class="slide-content title-slide">
    <h2>Certificate</h2>
    <p class="mono">${claims.length} displayed claims</p>
    <p class="mono">${hash ? esc(String(hash).startsWith("sha256:") ? hash : `sha256:${hash}`) : "No compilation certificate recorded"}</p>
    <p class="meta">${esc(compiled)}</p>
  </div>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Slide Deck</title>
<style>
  :root { --bg:#0a0e1a; --surface:#111827; --border:#1e293b; --text:#e2e8f0; --muted:#94a3b8; --accent:#4ecdc4; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html { scroll-snap-type:y proximity; }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6; overflow-wrap:anywhere; }
  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .skip-nav { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
  .skip-nav:focus { position:fixed; top:8px; left:8px; width:auto; height:auto; padding:12px 24px; background:var(--accent); color:#000; font-weight:700; z-index:100; }
  .slide { scroll-snap-align:start; min-height:100vh; min-height:100svh; display:flex; align-items:center; justify-content:center; padding:3rem 2rem; }
  .slide:focus-visible { outline-offset:-4px; }
  .slide-content { max-width:900px; width:100%; min-width:0; }
  .title-slide { text-align:center; }
  h1 { font-size:clamp(2rem,5vw,3.5rem); line-height:1.15; margin-bottom:1rem; }
  h2 { font-size:clamp(1.5rem,3.5vw,2.4rem); line-height:1.25; margin-bottom:1.25rem; }
  .question { font-size:1.1rem; color:var(--muted); margin-bottom:1rem; }
  .meta { font-size:0.9rem; color:var(--muted); }
  .mono { font-family:monospace; font-size:1rem; color:var(--muted); margin-bottom:0.5rem; }
  .summary-grid { display:flex; flex-wrap:wrap; gap:2rem; justify-content:center; margin-bottom:2rem; }
  .big-stat { display:flex; flex-direction:column; align-items:center; }
  .big-stat .num { font-size:2.5rem; font-weight:700; }
  .big-stat .label { font-size:0.8rem; color:var(--muted); text-transform:uppercase; }
  .type-stats { display:flex; flex-wrap:wrap; gap:0.75rem; justify-content:center; }
  .type-stat { display:flex; align-items:center; gap:0.4rem; font-size:0.9rem; }
  .dot { width:10px; height:10px; flex-shrink:0; border-radius:50%; }
  .claim-list { list-style:none; }
  .claim-list li { padding:0.8rem 0; border-bottom:1px solid var(--border); font-size:1rem; }
  .claim-list li strong { font-family:monospace; }
  .slide-counter { position:fixed; bottom:0.5rem; right:0.5rem; background:var(--surface); color:var(--muted); padding:0.25rem 0.6rem; border-radius:4px; font-size:0.75rem; font-family:monospace; }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  footer { padding:2rem; border-top:1px solid var(--border); text-align:center; color:var(--muted); font-size:0.8rem; }
  @media(max-width:720px) { html { scroll-snap-type:none; } .slide { min-height:auto; padding:2.5rem 1rem; } }
  @media(prefers-reduced-motion:reduce) { html { scroll-snap-type:none; scroll-behavior:auto; } *,*::before,*::after { animation-duration:0.01ms!important; transition-duration:0.01ms!important; } }
  @media print { .skip-nav,.slide-counter { display:none; } .slide { min-height:0; break-after:page; } }
</style>
</head>
<body>
<a href="#main-content" class="skip-nav">Skip to content</a>
<main id="main-content" role="main" aria-roledescription="carousel" aria-label="${esc(title)} presentation" tabindex="-1">
${slides.map((slide, index) => `<section id="slide-${index + 1}" class="slide" role="group" aria-roledescription="slide" aria-label="Slide ${index + 1} of ${slides.length}: ${esc(slide.label)}" tabindex="0">${slide.content}</section>`).join("\n")}
</main>
<div class="slide-counter" aria-hidden="true">1 / ${slides.length}</div>
<div id="slide-announcer" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>
<footer role="contentinfo">Compiled by Grainulator · ${esc(compiled)} · ${claims.length} claims</footer>
<script>
(function() {
  var slides = document.querySelectorAll('[aria-roledescription="slide"]');
  var counter = document.querySelector('.slide-counter');
  var announcer = document.getElementById('slide-announcer');
  if (!('IntersectionObserver' in window)) return;
  // A viewport band works for expanded slides as well as short slides.
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var index = Array.prototype.indexOf.call(slides, entry.target);
        counter.textContent = (index + 1) + ' / ' + slides.length;
        announcer.textContent = entry.target.getAttribute('aria-label');
      }
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
  slides.forEach(function(slide) { observer.observe(slide); });
})();
</script>
</body>
</html>`;
}
