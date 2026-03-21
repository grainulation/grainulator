---
name: challenge
description: Adversarial testing of a specific claim. Try to disprove it.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_search
  - mcp__wheat__wheat_status
  - WebSearch
  - WebFetch
  - Read
---

# /challenge -- Stress-test a claim

The user wants to adversarially test a specific claim to see if it holds up.

## Arguments

$ARGUMENTS

If no claim ID is provided, ask which claim to challenge. Use `wheat_search` to help the user find claims.

## Instructions

1. **Retrieve the target claim** using `wheat_search` with the provided claim ID.

2. **Adversarial research** -- actively try to disprove the claim:
   - Search for counterexamples, contradicting sources, edge cases
   - Check if the claim's source is still current and accurate
   - Look for alternative explanations or competing approaches
   - Test logical consistency with other claims in the sprint

3. **Record findings** as `x###` claims:
   - If the challenge finds real problems: add a `risk` claim describing the weakness
   - If the challenge strengthens the claim: add a `factual` claim noting the corroboration
   - If the challenge reveals nuance: add an `estimate` or `recommendation` refining the original

4. **Update conflict relationships**: If a challenge claim conflicts with the original, set `conflicts_with` on both claims.

5. Run `wheat_compile` to surface any new conflicts.

6. **Print verdict**:
   ```
   Challenge result for <claim_id>:
   Verdict: HELD / WEAKENED / REFUTED
   New claims: <list>

   Next steps:
     /resolve            -- resolve any new conflicts
     /witness <id> <url> -- seek external corroboration
     /research <topic>   -- dig deeper on weak areas
   ```
