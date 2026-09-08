---
name: analytics
description: Sprint analytics — type distributions, stale claims, velocity, prediction scoring
tools:
  - mcp__grainulator__status
  - Bash
  - Read
---

# /analytics -- Sprint analytics and retrospective

The user wants quantitative analysis of the current sprint: claim type distributions, evidence quality, stale claims, and velocity metrics.

## Arguments

$ARGUMENTS

Optional: `--full` to generate an HTML retrospective report. `--calibrate` to run prediction scoring.

## Instructions

1. **Detect the sprint directory**:
   - Run `grainulator.status` to get the current sprint metadata.
   - Identify the sprint directory from the status output (the directory containing `claims.json`).
   - If no active sprint is found, check the current working directory for a `claims.json` file.
   - If still not found, stop and tell the user: "No active sprint detected. Run `/init` to start one."
   - Store the resolved directory as `<dir>` for subsequent steps.

2. **Run type/evidence analysis**:
   - Execute: `grainulator analytics analyze <dir>`
   - This returns claim type distribution (constraint, factual, estimate, risk, recommendation, feedback) and evidence tier distribution (stated, web, documented, tested, production).
   - Capture the output for the summary.

3. **Run stale claim detection**:
   - Execute: `grainulator analytics decay <dir> --days 7`
   - This flags claims that haven't been updated, corroborated, or challenged in 7+ days.
   - Capture the list of stale claim IDs and their ages.

4. **Display the analytics summary**:

   ```
   Analytics: <sprint-slug>
   ─────────────────────────────

   Claim distribution:
     constraint: <n>  |  factual: <n>  |  estimate: <n>
     risk: <n>  |  recommendation: <n>  |  feedback: <n>

   Evidence quality:
     stated: <n>  |  web: <n>  |  documented: <n>  |  tested: <n>  |  production: <n>

   Weak areas:
     - <list any evidence tiers with 0 claims, or types with heavy concentration>
     - <flag if >60% of claims share the same type (type monoculture)>
     - <flag if >50% of evidence is "stated" or "web" (weak evidence base)>

   Stale claims (<n> total):
     - <id>: "<summary>" — <age> days stale
     - ...

   Velocity:
     <output from analyze, e.g. claims/day, time between phases>
   ```

5. **Suggest full retrospective**:
   - Tell the user they can generate a full HTML retrospective report:
     ```
     For a full retrospective report:
       grainulator analytics report <dir> -o output/analytics.html
     ```
   - If the user passed `--full`, run the report command directly and write the output to `output/analytics.html`.

6. **Recommend calibration if sprint is complete**:
   - If the sprint appears to be in a late phase (has recommendations, has a brief, or the user mentioned shipping), suggest:
     ```
     Sprint looks complete. Score your predictions:
       /calibrate --outcome "what actually happened"
       grainulator analytics calibrate <dir>
     ```
   - If the user passed `--calibrate`, run `grainulator analytics calibrate <dir>` and display the prediction accuracy results.

7. **Suggest next steps** based on the findings:

   ```
   Auto

   - <authorized next action>

   Manual

   - <action requiring the user, or None.>
   ```

   Tailor the suggestions:
   - Stale claims exist -> suggest `/challenge` or `/research` on the stalest
   - Weak evidence base -> suggest `/witness` or `/research`
   - Type monoculture -> suggest `/challenge` to diversify
   - Sprint looks healthy -> suggest `/brief` or `/present`

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
