# barn/templates

Self-contained HTML templates for research sprint artifacts. No external dependencies -- all CSS is inlined, no JavaScript frameworks.

Template design was reviewed with [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky (@heydamir), licensed under CC BY 4.0. Evidence, decisions and report data carry the emphasis; document chrome stays quiet.

## explainer.html

Full-screen scroll-snap presentation template. Each `.slide` div fills the viewport and snaps into place on scroll.

**Placeholders to replace:**

- `{{TITLE}}` -- main presentation title
- `{{SUBTITLE}}` -- subtitle/description

**Layout components:**

- `.slide` -- full-screen section (scroll-snap aligned)
- `.card` -- content card with colored left border (add `.green`, `.orange`, `.red`, `.purple`, `.pink`)
- `.two-col` / `.three-col` -- column layouts
- `.label` -- sentence-case metadata label (add color class for variants)
- `.divider` -- accent-colored horizontal rule
- `table` -- styled data table
- `.claim-ref` -- monospace claim reference (e.g., `[r001]`)
- `.slide-nav` -- fixed dot navigation on the right edge
- `.fade-in` -- retained compatibility class; content is static

## dashboard.html

Sprint status dashboard. Designed to be populated from `compilation.json` data.

**Sections:**

- Phase progress track (define/research/prototype/evaluate/compile)
- Evidence strength bars by topic
- Conflict tracker (unresolved + resolved)
- Connected sources list
- Recent activity log
- Full claim inventory table with type/evidence badges

**Badge classes:**

- Claim types: `.factual`, `.constraint`, `.estimate`, `.risk`, `.recommendation`, `.feedback`
- Evidence tiers: `.production`, `.tested`, `.documented`, `.web`, `.stated`

## Usage

Copy a template into your project and replace the `{{PLACEHOLDER}}` values:

```bash
cp node_modules/@grainulation/barn/templates/explainer.html ./output/presentation.html
```

Both templates are mobile responsive with breakpoints at 768px and 480px.
