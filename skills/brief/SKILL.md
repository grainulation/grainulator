---
name: brief
description: Generate a compiled decision brief from the current sprint's claims.
tools:
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_status
  - mcp__mill__mill_convert
  - mcp__mill__mill_formats
  - mcp__mill__mill_preview
  - Write
  - Read
---

# /brief -- Generate a decision brief

The user wants a compiled output document from the current sprint.

## Arguments

$ARGUMENTS

Optional: output format (pdf, html, md). Default: html.

## Instructions

1. **Run `wheat_compile`** to ensure compilation is current and there are no blocking conflicts.
   - If compilation fails due to unresolved conflicts, stop and suggest `/resolve`.

2. **Check sprint readiness** via `wheat_status`:
   - Minimum 5 active claims to generate a meaningful brief
   - At least 2 topics covered
   - Warn if all claims are the same type (type monoculture)

3. **Read `compilation.json`** -- this is the source of truth, never read claims.json directly for output.

4. **Read the template** at `${CLAUDE_PLUGIN_ROOT}/skills/_templates/sidebar-brief.html` for the canonical accessible HTML structure. All generated HTML MUST follow this template exactly. Note: the path uses `${CLAUDE_PLUGIN_ROOT}` because the template lives in the Grainulator plugin directory, not the user's repo.

5. **Generate the brief** using `mill_convert`:
   - Format: user-requested or default to HTML
   - Structure: Executive summary, key findings by topic, risks and mitigations, recommendations, evidence appendix
   - Include claim IDs as references throughout

6. **WCAG compliance checklist** -- verify the generated HTML includes all of these:
   - [ ] `<a href="#main-content" class="skip-nav">Skip to content</a>` as first child of `<body>`
   - [ ] `<main id="main-content" role="main">` wrapping all content
   - [ ] `<nav aria-label="Table of contents">` wrapping sidebar links
   - [ ] `aria-current="page"` on active sidebar link (JS IntersectionObserver updates this)
   - [ ] Heading hierarchy: `<h1>` page title, `<h2>` sections, `<h3>` subsections -- never skip levels
   - [ ] All `<table>` elements have `<caption>` and `<th scope="col|row">`
   - [ ] Mobile sidebar uses `<details><summary>` disclosure, not `display: none`
   - [ ] `:focus-visible` outline styles (2px solid #4ecdc4, offset 2px)
   - [ ] `.sr-only` utility class defined in CSS
   - [ ] Severity indicators (`.sev--critical`, `.sev--high`, etc.) always include text labels, never color alone
   - [ ] Tags include text prefix (e.g., "Tested: verified"), never color alone
   - [ ] Gradient text has `@supports not (-webkit-background-clip: text)` fallback
   - [ ] `<footer role="contentinfo">` at end of document

7. **Write output** to `output/brief.<ext>` in the sprint directory.

8. **Print summary**:

   ```
   Brief generated: output/brief.<ext>
   Claims: <count> active, <count> topics
   Strongest evidence: <tier>

   Next steps:
     /present            -- turn this into a slide deck
     /blind-spot         -- check for gaps before sharing
     /status             -- review the full sprint dashboard
   ```
