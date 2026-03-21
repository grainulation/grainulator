---
name: status
description: Show a snapshot of the current sprint -- claims, conflicts, coverage, and next actions.
tools:
  - mcp__wheat__wheat_status
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_search
  - Read
---

# /status -- Sprint dashboard

The user wants to see the current state of the active sprint.

## Arguments

$ARGUMENTS

## Instructions

1. **Run `wheat_status`** to get the sprint snapshot.

2. **Run `wheat_compile`** to check for conflicts and warnings.

3. **Display the dashboard**:

   ```
   Sprint: <slug>
   Phase: <phase> | Claims: <total> active, <conflicted> conflicted
   Topics: <list with claim counts>

   Evidence tiers:
     stated: <n>  |  web: <n>  |  documented: <n>  |  tested: <n>  |  production: <n>

   Claim types:
     constraint: <n>  |  factual: <n>  |  estimate: <n>  |  risk: <n>  |  recommendation: <n>

   Conflicts: <list or "none">
   Warnings: <list or "none">
   ```

4. **Suggest next steps** based on the decision tree:
   - Unresolved conflicts -> `/resolve`
   - Claims with no corroboration -> `/witness <id> <url>`
   - Weak evidence tiers -> `/research <topic>` or `/witness`
   - Type monoculture -> `/challenge <id>`
   - Late-phase with gaps -> `/blind-spot`
   - Ready for output -> `/brief`
