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

4. **Generate the brief** using `mill_convert`:
   - Format: user-requested or default to HTML
   - Structure: Executive summary, key findings by topic, risks and mitigations, recommendations, evidence appendix
   - Include claim IDs as references throughout

5. **Write output** to `output/brief.<ext>` in the sprint directory.

6. **Print summary**:
   ```
   Brief generated: output/brief.<ext>
   Claims: <count> active, <count> topics
   Strongest evidence: <tier>

   Next steps:
     /present            -- turn this into a slide deck
     /blind-spot         -- check for gaps before sharing
     /status             -- review the full sprint dashboard
   ```
