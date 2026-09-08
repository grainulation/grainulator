---
name: feedback
description: Record stakeholder input — new constraints, corrections, or direction changes.
tools:
  - Bash
  - mcp__grainulator__add_claim
  - mcp__grainulator__compile
  - mcp__grainulator__search
  - mcp__grainulator__status
---

# /feedback -- Record stakeholder input

The user is relaying feedback from stakeholders that should be incorporated into the sprint.

## Arguments

$ARGUMENTS

## Instructions

1. **Parse the feedback**: Identify what the stakeholder said. This could be:
   - A new constraint ("CTO says prioritize speed over cost")
   - A correction ("compliance says we need SOC2 Type II, not Type I")
   - A direction change ("skip the custom build, focus on Auth0 vs Clerk")
   - A new question ("what about latency in EU regions?")

2. **Create feedback claims** as `f###` claims:
   - Type: `constraint` for hard requirements, `feedback` for opinions/preferences
   - Evidence tier: `stated` (stakeholder said it, not independently verified)
   - Tag with the stakeholder's name or role

3. **Check for conflicts**: Does this feedback contradict existing claims? If a stakeholder says "budget is $10K max" but research shows a solution at $15K, that's a conflict. Set `conflicts_with` on both claims.

4. Run `grainulator.compile` to surface any new conflicts.

5. **Print result**:

   ```
   Feedback recorded:
   - <f001>: <summary>
   - <f002>: <summary>

   Conflicts introduced: <N>

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
