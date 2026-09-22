---
name: research
description: Execute a multi-pass research investigation, adding claims with evidence.
allowed-tools:
  - Bash
  - mcp__grainulator__add_claim
  - mcp__plugin_grainulator_grainulator__add_claim
  - mcp__grainulator__compile
  - mcp__plugin_grainulator_grainulator__compile
  - mcp__grainulator__search
  - mcp__plugin_grainulator_grainulator__search
  - mcp__grainulator__status
  - mcp__plugin_grainulator_grainulator__status
  - mcp__grainulator__memory_search
  - mcp__plugin_grainulator_grainulator__memory_search
  - mcp__grainulator__memory_pull
  - mcp__plugin_grainulator_grainulator__memory_pull
  - WebSearch
  - WebFetch
  - Read
  - Grep
  - Glob
---

# /research -- Investigate a topic

The user wants to research a topic within the current sprint.

## Arguments

$ARGUMENTS

## Instructions

1. **Identify the active sprint** from the explicit task directory, active sprint in AGENTS.md, or configured context, including nested sprints. Check cwd only as a fallback. Ask only if the intended target remains ambiguous; always pass the resolved dir explicitly.

2. **Choose the decisive open question** from the task, current evidence, and compiler feedback. Investigate the landscape, implementation, risks, or alternatives only as they matter to the requested outcome. There is no fixed pass count.

3. **Investigate and record what you actually learn**:
   - Prefer repository code and relevant tests for implementation questions; use primary sources for external facts.
   - Use DeepWiki only when available and useful. Local code and available web tools remain valid fallbacks.
   - Add distinct supported findings through `grainulator.add_claim`, with unique IDs, appropriate claim types and evidence tiers, and source artifacts when available. Do not pad the ledger or manufacture risks to satisfy a type distribution.
   - Run `grainulator.compile` after a meaningful change. Address material contradictions and weaknesses within the user’s scope; explain limitations that cannot be resolved with available evidence.
   - Continue implementation and verification when the user requested working changes.

4. **Finish against the user’s done criteria**, not a claim count or compiler score. Stop investigation when the requested outcome is supported and further passes would not change the decision. If the user requested a brief or report, execute that workflow without asking again. If useful authorized work remains, continue it.

5. **Present the result and next steps** using the contract below. If the user requested next steps only, omit the result recap.

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
