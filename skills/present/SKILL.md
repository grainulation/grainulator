---
name: present
description: Generate a presentation deck from the compiled sprint data.
tools:
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_status
  - mcp__mill__mill_convert
  - mcp__mill__mill_formats
  - Write
  - Read
---

# /present -- Generate a presentation

The user wants to create a slide deck or presentation from the sprint findings.

## Arguments

$ARGUMENTS

Optional: audience override, format (html, pdf). Default: html scroll-snap deck.

## Instructions

1. **Run `wheat_compile`** to ensure compilation is current.
   - If blocked by conflicts, stop and suggest `/resolve`.

2. **Read `compilation.json`** as the source of truth.

3. **Read the template** at `skills/_templates/scroll-snap-deck.html` for the canonical accessible HTML structure. All generated HTML MUST follow this template exactly.

4. **Structure the presentation**:
   - Slide 1: Title + research question + audience
   - Slide 2: Executive summary (3-4 bullet points)
   - Slides 3-N: One slide per topic with key findings
   - Risk slide: Top risks with mitigations
   - Recommendations slide: Prioritized action items
   - Evidence appendix: Claim IDs, sources, evidence tiers

5. **Generate** using `mill_convert` with the presentation template (dark scroll-snap for HTML).

6. **WCAG compliance checklist** -- first read and apply every item from
   `${CLAUDE_PLUGIN_ROOT}/skills/_templates/wcag-shared.md`, then verify
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

   Next steps:
     /brief              -- also generate a written brief
     /handoff            -- prepare for knowledge transfer
   ```
