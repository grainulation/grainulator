---
name: witness
description: Corroborate a claim against an external source URL.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_search
  - WebFetch
  - Read
---

# /witness -- External corroboration

The user wants to verify a claim against a specific external source.

## Arguments

$ARGUMENTS

Expected format: `/witness <claim_id> <url>`

## Instructions

1. **Retrieve the target claim** using `wheat_search`.

2. **Fetch the external source** using WebFetch on the provided URL.

3. **Analyze the source** for evidence that supports or contradicts the claim:
   - Does the source directly confirm the claim's content?
   - Does the source provide additional context or caveats?
   - Is the source authoritative and current?

4. **Record the witness finding** as a `w###` claim:
   - If corroborated: factual claim with evidence tier `documented` and source.artifact = URL
   - If contradicted: risk claim noting the discrepancy
   - If partially supported: estimate claim with the nuanced finding

5. **Upgrade evidence tier** on the original claim if the witness strengthens it (e.g., `web` -> `documented`).

6. Run `wheat_compile`.

7. **Print result**:
   ```
   Witness result for <claim_id>:
   Source: <url>
   Verdict: CORROBORATED / CONTRADICTED / PARTIAL
   Evidence tier: <old> -> <new>

   Next steps:
     /challenge <id>     -- adversarial test if still uncertain
     /brief              -- compile findings into output
   ```
