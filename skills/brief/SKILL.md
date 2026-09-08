---
name: brief
description: Generate a compiled decision brief from the current sprint's claims.
tools:
  - Bash
  - mcp__grainulator__compile
  - mcp__grainulator__status
  - mcp__grainulator__exports_convert
  - mcp__grainulator__exports_formats
  - mcp__grainulator__exports_preview
  - Write
  - Read
---

# /brief -- Generate a decision brief

The user wants a compiled output document from the current sprint.

## Arguments

$ARGUMENTS

Optional: output format (pdf, html, md). Default: html.

## Instructions

1. **Run `grainulator.compile`** to ensure compilation is current and there are no blocking conflicts.
   - If compilation reports unresolved conflicts, resolve them using available evidence within the existing authorization. Request user input only for a decision that cannot be inferred; do not present blocked findings as settled.

2. **Check sprint readiness** via `grainulator.status`:
   - Check whether the evidence supports the requested decision and scope.
   - Investigate material gaps; do not require a claim count or topic quota.
   - Describe remaining uncertainty honestly.

3. **Read `compilation.json`** -- this is the source of truth, never read claims.json directly for output.

4. **Read the template** at `${CLAUDE_PLUGIN_ROOT}/templates/sidebar-brief.html` for the canonical accessible HTML structure. Follow its structure and accessibility markup; vary the content, not the shell. Note: the path uses `${CLAUDE_PLUGIN_ROOT}` because the template lives in the Grainulator plugin directory, not the user's repo.

5. **Generate the brief** with `grainulator.exports_convert`, using the actual catalog IDs rather than filename extensions:

   | Requested output | Converter format | Output path |
   | --- | --- | --- |
   | HTML (default) | `html-report` | `output/brief.html` |
   | Markdown / md | `markdown` | `output/brief.md` |
   | PDF | `html-report`, then local PDF rendering | `output/brief.pdf` |

   For example, call `exports_convert` with:

   ```json
   {"dir":"<sprint>","format":"html-report","source":"compilation.json","output":"output/brief.html"}
   ```

   The converter does not accept a template argument. Use the generated artifact as a starting point, then customize its HTML with the sidebar-brief template: executive summary, findings by topic, risks, recommendations and an evidence appendix. Preserve claim IDs and verify the accessibility requirements below. For another supported output, discover its exact ID through `exports_formats`.

   For PDF, finish the HTML first. Use an available local renderer; for example, when Playwright and Chromium are installed, load the local HTML, emulate print media, and call `page.pdf({path: <absolute-pdf-path>, printBackground: true})`. If no PDF renderer is available, deliver the HTML and state that PDF rendering remains unavailable; the user can use their browser’s Print → Save as PDF. Do not call `exports_convert` with format `pdf`, or claim a PDF exists before verifying the file.

6. **WCAG compliance checklist** -- first read and apply every item from
   `${CLAUDE_PLUGIN_ROOT}/templates/wcag-shared.md`, then verify
   these brief-specific items:
   - [ ] `<nav aria-label="Table of contents">` wrapping sidebar links
   - [ ] `aria-current="page"` on active sidebar link (JS IntersectionObserver updates this)
   - [ ] Heading hierarchy: `<h1>` page title, `<h2>` sections, `<h3>` subsections -- never skip levels
   - [ ] All `<table>` elements have `<caption>` and `<th scope="col|row">`
   - [ ] Mobile sidebar uses `<details><summary>` disclosure, not `display: none`
   - [ ] Tags include text prefix (e.g., "Tested: verified"), never color alone

7. **Write output** to `output/brief.<ext>` in the sprint directory.

8. **Print summary**:

   ```
   Brief generated: output/brief.<ext>
   Claims: <count> active, <count> topics
   Strongest evidence: <tier>

   Auto

   - <authorized next action>

   Manual

   - <action requiring the user, or None.>
   ```

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
