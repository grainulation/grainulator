---
name: present
description: Generate a presentation deck from the compiled sprint data.
allowed-tools:
  - Bash
  - mcp__grainulator__compile
  - mcp__plugin_grainulator_grainulator__compile
  - mcp__grainulator__status
  - mcp__plugin_grainulator_grainulator__status
  - mcp__grainulator__exports_convert
  - mcp__plugin_grainulator_grainulator__exports_convert
  - mcp__grainulator__exports_formats
  - mcp__plugin_grainulator_grainulator__exports_formats
  - Write
  - Read
---

# /present -- Generate a presentation

The user wants to create a slide deck or presentation from the sprint findings.

## Arguments

$ARGUMENTS

Optional: audience override, format (html, pdf). Default: html scroll-snap deck.

## Instructions

1. **Run `grainulator.compile`** to ensure compilation is current.
   - Resolve material conflicts using available evidence within scope. Ask only when an unresolved decision needs the user; never present blocked findings as settled.

2. **Read `compilation.json`** as the source of truth.

3. **Read the template** at `${CLAUDE_PLUGIN_ROOT}/templates/scroll-snap-deck.html` for the canonical accessible HTML structure. Follow its structure and accessibility markup; vary the content, not the shell.

4. **Structure the presentation**:
   - Slide 1: Title + research question + audience
   - Slide 2: Executive summary (3-4 bullet points)
   - Slides 3-N: One slide per topic with key findings
   - Risk slide: Top risks with mitigations
   - Recommendations slide: Prioritized action items
   - Evidence appendix: Claim IDs, sources, evidence tiers

5. **Generate an HTML deck** using `grainulator.exports_convert` with catalog format `slide-deck`:

   ```json
   {"dir":"<sprint>","format":"slide-deck","source":"compilation.json","output":"output/presentation.html"}
   ```

   The converter does not accept a template argument. Customize the generated HTML artifact against the scroll-snap template and the narrative structure above, preserving evidence references and accessibility. The catalog ID is `slide-deck`, not `html` or `pdf`; use `exports_formats` to discover other supported formats.

   For a requested PDF, finish the HTML and use an available local renderer. If Playwright and Chromium are installed, load the local HTML, emulate print media, and call `page.pdf({path: <absolute-pdf-path>, printBackground: true})`. Verify the resulting file. If no PDF renderer is available, deliver the HTML and explain that PDF rendering remains unavailable; browser Print → Save as PDF is a manual fallback. Never claim that an HTML file is a completed PDF.

6. **WCAG compliance checklist** -- first read and apply every item from
   `${CLAUDE_PLUGIN_ROOT}/templates/wcag-shared.md`, then verify
   these presentation-specific items (the shared file defines the
   `<main>` baseline; for presentations extend its role/aria-label):
   - [ ] `<main id="main-content" role="main" aria-roledescription="carousel" aria-label="...">` wrapping all slides
   - [ ] Each slide is `<section aria-roledescription="slide" aria-label="Slide N of M: Title" tabindex="0">` (NOT `<div class="slide">`)
   - [ ] First slide uses `<h1>`, all subsequent slides use `<h2>`, card titles within slides use `<h3>`
   - [ ] `<div id="slide-announcer" role="status" aria-live="polite" aria-atomic="true" class="sr-only">` for transition announcements
   - [ ] IntersectionObserver script that updates the announcer (no Space/ArrowKey trapping)

7. **Write output** to `output/presentation.<ext>`.

8. **Print summary**:

   ```
   Presentation generated: output/presentation.<ext>
   Slides: <count>

   Auto

   - <authorized next action>

   Manual

   - <action requiring the user, or None.>
   ```

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
