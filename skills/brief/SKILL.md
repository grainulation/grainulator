---
name: brief
description: Generate a compiled decision brief from the current sprint's claims.
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
  - mcp__grainulator__exports_preview
  - mcp__plugin_grainulator_grainulator__exports_preview
  - Write
  - Read
---

# /brief -- Generate a decision brief

The user wants a compiled output document from the current sprint.

## Arguments

$ARGUMENTS

Optional: audience override. Output is Markdown.

## Instructions

1. **Compile the explicit sprint** using the available `compile` MCP tool or
   `grainulator compile --dir <sprint>`. Resolve material conflicts using evidence
   within the user's authorization; keep unresolved findings visible.
2. **Check readiness** with `status`. Investigate gaps that affect the requested
   decision, without imposing claim-count or topic quotas.
3. **Read `compilation.json`** as the source for the brief. Preserve the compiled
   claim IDs, source references, evidence tiers and verification status.
4. **Generate Markdown** using the available export tool:

   ```json
   {"dir":"<sprint>","format":"markdown","source":"compilation.json","output":"output/brief.md"}
   ```

   CLI fallback:

   ```sh
   grainulator export export --dir <sprint> --format markdown compilation.json -o output/brief.md
   ```

5. **Edit the text into a decision brief** with the decision, findings, risks,
   recommendations and evidence appendix. Keep every material conclusion traceable
   to its claim IDs and sources. Do not imply that stated claims were tested.
6. **Verify and link `output/brief.md`**, then report remaining uncertainty and
   the current Auto and Manual next steps. Other tools can render the Markdown;
   Grainulator does not generate HTML, slide decks or PDFs.

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
