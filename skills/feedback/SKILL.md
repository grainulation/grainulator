---
name: feedback
description: Record stakeholder input — new constraints, corrections, or direction changes.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_search
  - mcp__wheat__wheat_status
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

4. Run `wheat_compile` to surface any new conflicts.

5. **Print result**:

   ```
   Feedback recorded:
   - <f001>: <summary>
   - <f002>: <summary>

   Conflicts introduced: <N>

   Next steps:
     /resolve            -- resolve any new conflicts
     /research <topic>   -- investigate new questions from feedback
     /challenge <id>     -- test if feedback contradicts existing evidence
   ```
