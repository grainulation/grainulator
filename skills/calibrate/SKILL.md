---
name: calibrate
description: Score past predictions against actual outcomes. Closes the feedback loop.
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
---

# /calibrate -- Score predictions vs outcomes

The user wants to check what actually happened after a sprint's recommendations were implemented.

## Arguments

$ARGUMENTS

Expected format: `/calibrate --outcome "what happened"` or `/calibrate <claim_id> "actual result"`

## Instructions

1. **Parse the outcome**: The user provides outcome data as free text or claim-specific results.

2. **Match outcomes to predictions**: Use `grainulator.search` to find the original estimate, recommendation, or risk claims that predicted something. For explicit IDs use `id` and `full: true` with the sprint `dir`, not a text query. Read complete prediction and source context. Compare prediction to actual outcome.

3. **Create calibration claims** as `cal###` claims with the evidence tier supported by the source: use `stated` for stakeholder reports, `tested` for checks actually run, and `production` only for observed production measurements. Do not promote an assertion merely because it describes an outcome:
   - Pass `calibration: {prediction_id: "<original-id>", verdict: "correct|wrong|partial|unknown", outcome: "<observed result>", delta: <optional signed number>}` to `add_claim`. CLI fallback: `grainulator add ... --calibration '<JSON object>' --dir <dir>`.
   - If prediction was accurate: factual claim noting the match
   - If prediction was wrong: factual claim noting the delta (predicted X, actual Y)
   - If prediction was partially right: estimate claim with the refined numbers

4. **Persist and compute the scorecard**:
   - Use an active estimate, risk, or recommendation as the prediction. Each outcome links to exactly one prediction; do not use tag overlap as a substitute. Record another claim only for a distinct observation. Unknown outcomes remain unknown.
   - Run `grainulator analytics calibrate <dir> --json`. Correct/wrong outcomes form the binary accuracy denominator; partial and unknown outcomes are separate counts, excluded from binary confidence/Brier scoring.
   - Evidence/type breakdowns below are descriptive analysis of the complete linked records; label them separately from machine-returned fields.
   - Group by evidence tier: what % of `stated` vs `web` vs `documented` vs `tested` claims were accurate?
   - Group by claim type: are estimates less accurate than factual claims?
   - Report this as a descriptive score for the observed sample; do not infer predictive validity without sufficient independent outcomes

5. Run `grainulator.compile`.

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

   Auto

   - <authorized next action>

   Manual

   - <action requiring the user, or None.>
   ```

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
