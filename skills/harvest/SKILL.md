---
name: harvest
description: Sprint analytics — type distributions, stale claims, velocity, prediction scoring
tools:
  - mcp__wheat__wheat_status
  - Bash
  - Read
---

# /harvest -- Sprint analytics and retrospective

The user wants quantitative analysis of the current sprint: claim type distributions, evidence quality, stale claims, and velocity metrics.

## Arguments

$ARGUMENTS

Optional: `--full` to generate an HTML retrospective report. `--calibrate` to run prediction scoring.

## Instructions

1. **Detect the sprint directory**:
   - Run `wheat_status` to get the current sprint metadata.
   - Identify the sprint directory from the status output (the directory containing `claims.json`).
   - If no active sprint is found, check the current working directory for a `claims.json` file.
   - If still not found, stop and tell the user: "No active sprint detected. Run `/init` to start one."
   - Store the resolved directory as `<dir>` for subsequent steps.

2. **Run type/evidence analysis**:
   - Execute: `npx @grainulation/harvest analyze <dir>`
   - This returns claim type distribution (constraint, factual, estimate, risk, recommendation, feedback) and evidence tier distribution (stated, web, documented, tested, production).
   - Capture the output for the summary.

3. **Run stale claim detection**:
   - Execute: `npx @grainulation/harvest decay <dir> --days 7`
   - This flags claims that haven't been updated, corroborated, or challenged in 7+ days.
   - Capture the list of stale claim IDs and their ages.

4. **Display the analytics summary**:

   ```
   Harvest: <sprint-slug>
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
       npx @grainulation/harvest report <dir> -o output/harvest.html
     ```
   - If the user passed `--full`, run the report command directly and write the output to `output/harvest.html`.

6. **Recommend calibration if sprint is complete**:
   - If the sprint appears to be in a late phase (has recommendations, has a brief, or the user mentioned shipping), suggest:
     ```
     Sprint looks complete. Score your predictions:
       /calibrate --outcome "what actually happened"
       npx @grainulation/harvest calibrate <dir>
     ```
   - If the user passed `--calibrate`, run `npx @grainulation/harvest calibrate <dir>` and display the prediction accuracy results.

7. **Suggest next steps** based on the findings:

   ```
   Next steps:
     /challenge <stale-id>  -- revisit the stalest claim
     /witness <weak-id> <url> -- strengthen weak evidence
     /blind-spot            -- check for structural gaps
     /brief                 -- compile findings into a decision doc
   ```

   Tailor the suggestions:
   - Stale claims exist -> suggest `/challenge` or `/research` on the stalest
   - Weak evidence base -> suggest `/witness` or `/research`
   - Type monoculture -> suggest `/challenge` to diversify
   - Sprint looks healthy -> suggest `/brief` or `/present`
