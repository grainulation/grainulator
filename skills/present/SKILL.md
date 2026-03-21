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

3. **Structure the presentation**:
   - Slide 1: Title + research question + audience
   - Slide 2: Executive summary (3-4 bullet points)
   - Slides 3-N: One slide per topic with key findings
   - Risk slide: Top risks with mitigations
   - Recommendations slide: Prioritized action items
   - Evidence appendix: Claim IDs, sources, evidence tiers

4. **Generate** using `mill_convert` with the presentation template (dark scroll-snap for HTML).

5. **Write output** to `output/presentation.<ext>`.

6. **Print summary**:
   ```
   Presentation generated: output/presentation.<ext>
   Slides: <count>

   Next steps:
     /brief              -- also generate a written brief
     /handoff            -- prepare for knowledge transfer
   ```
