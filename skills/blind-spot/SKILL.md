---
name: blind-spot
description: Structural gap analysis -- find what the sprint has not considered.
tools:
  - mcp__wheat__wheat_status
  - mcp__wheat__wheat_search
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_add-claim
  - WebSearch
---

# /blind-spot -- Find what we are missing

The user wants to identify structural gaps in the current sprint.

## Arguments

$ARGUMENTS

## Instructions

1. **Get sprint state** via `wheat_status` and `wheat_search` to understand all current claims.

2. **Analyze for gaps across 5 dimensions**:

   a. **Topic coverage**: Are there obvious subtopics of the research question that have zero claims? List them.

   b. **Type balance**: Does every topic have at least one risk claim? Are there recommendations without supporting factual claims?

   c. **Evidence depth**: Are any critical claims stuck at "stated" or "web" tier? Which claims most need corroboration?

   d. **Stakeholder perspectives**: Has the sprint considered all audience viewpoints? (e.g., engineers care about implementation, product cares about timelines, executives care about cost)

   e. **Adversarial gaps**: What would a skeptic attack first? Which claims are most vulnerable?

3. **Add gap claims** as `r###` risk-type claims noting each identified blind spot.

4. Run `wheat_compile`.

5. **Print findings**:

   ```
   Blind spot analysis:
   - <gap 1>
   - <gap 2>
   - ...

   New risk claims added: <list>

   Next steps:
     /research <gap-topic>  -- fill the most critical gap
     /challenge <id>        -- test the most vulnerable claim
     /witness <id> <url>    -- strengthen weak evidence
   ```
