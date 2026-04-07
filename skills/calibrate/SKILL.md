---
name: calibrate
description: Score past predictions against actual outcomes. Closes the feedback loop.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_search
  - mcp__wheat__wheat_status
---

# /calibrate -- Score predictions vs outcomes

The user wants to check what actually happened after a sprint's recommendations were implemented.

## Arguments

$ARGUMENTS

Expected format: `/calibrate --outcome "what happened"` or `/calibrate <claim_id> "actual result"`

## Instructions

1. **Parse the outcome**: The user provides outcome data as free text or claim-specific results.

2. **Match outcomes to predictions**: Use `wheat_search` to find the original estimate, recommendation, or risk claims that predicted something. Compare prediction to actual outcome.

3. **Create calibration claims** as `cal###` claims with evidence tier `production` (these are real outcomes):
   - If prediction was accurate: factual claim noting the match
   - If prediction was wrong: factual claim noting the delta (predicted X, actual Y)
   - If prediction was partially right: estimate claim with the refined numbers

4. **Compute accuracy scorecard**:
   - Group by evidence tier: what % of `stated` vs `web` vs `documented` vs `tested` claims were accurate?
   - Group by claim type: are estimates less accurate than factual claims?
   - This validates whether the evidence tier system is predictive

5. Run `wheat_compile`.

6. **Print scorecard**:

   ```
   Calibration results:
   Predictions scored: <N>
   Accurate: <N> (<percent>)
   Partially accurate: <N>
   Wrong: <N>

   Accuracy by evidence tier:
     stated: <percent>
     web: <percent>
     documented: <percent>
     tested: <percent>

   Next steps:
     /brief              -- recompile with calibrated data
     /research <topic>   -- investigate where predictions went wrong
   ```
