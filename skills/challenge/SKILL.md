---
name: challenge
description: Adversarial testing of a specific claim. Try to disprove it.
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
  - WebSearch
  - WebFetch
  - Read
---

# /challenge -- Stress-test a claim

The user wants to adversarially test a specific claim to see if it holds up.

## Arguments

$ARGUMENTS

If no claim ID is provided, infer the target from the active task and current compiler feedback. Use `grainulator.search` to locate it; ask only when materially different targets remain ambiguous.

## Persona: Devil's Advocate

You are a hostile challenger who actively undermines the claim being tested. Demand empirical evidence for every assertion, identify logical fallacies (begging the question, false analogy, hasty generalization), surface contradictions, and exploit gaps in the reasoning chain. Never accept "it seems reasonable" — proof is mandatory.

## How to challenge

Search against the claim, not for it: negative-phrased queries ("X fails", "X criticisms"),
the opposite keyword, and edge cases. Authority is not evidence — test stakeholder and expert
claims the same way. Quote specific pages, not intuition. If you find no counterevidence, that
is a finding to record ("no public counterevidence after N passes; internal validation
needed"), not a pass.

## Evidence Tier Integrity

Never inflate evidence tiers during a challenge:

| False Claim | Reality |
|:---|:---|
| "Found a source online → documented tier" | `documented` = official/academic/authoritative. A blog post is `web`. Vendor marketing assertions are `stated`; official technical documentation can be `documented` for the behavior it actually specifies. |
| "Survived the challenge → tested tier" | `tested` = reproducible test or production data. Challenge resistance is not testing. |
| "No contradictions → production tier" | `production` = validated in live systems. Absence of counterevidence ≠ production validation. |

## Instructions

1. **Retrieve the target claim** using `grainulator.search` with `id: <claim_id>, full: true` and explicit `dir` (CLI: `grainulator search --dir <dir> --id <id> --full --json`). Read the complete content, source, timestamp and status. Use `include_inactive: true` only when the task concerns a superseded record; do not confuse it with current evidence.

2. **Adversarial research** -- actively try to disprove the claim:
   - Search for counterexamples, contradicting sources, edge cases
   - Check if the claim's source is still current and accurate
   - Look for alternative explanations or competing approaches
   - Test logical consistency with other claims in the sprint

3. **Record findings** as `x###` claims:
   - If the challenge finds real problems: add a `risk` claim describing the weakness
   - If the challenge strengthens the claim: add a `factual` claim noting the corroboration
   - If the challenge reveals nuance: add an `estimate` or `recommendation` refining the original

4. **Update conflict relationships**: If a challenge claim conflicts with the original, set `conflicts_with: [<original_id>]` on the new claim when adding it. One directed edge is sufficient for the compiler. Do not re-add or edit the original record.

5. Run `grainulator.compile` to surface any new conflicts.

6. **Print verdict**:

   ```
   Challenge result for <claim_id>:
   Verdict: HELD / WEAKENED / REFUTED
   New claims: <list>

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
