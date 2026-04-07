---
name: resolve
description: Adjudicate conflicts between claims that the compiler flagged.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_search
  - mcp__wheat__wheat_status
  - mcp__wheat__wheat_resolve
---

# /resolve -- Adjudicate a conflict

The user wants to resolve a conflict between claims that the compiler couldn't auto-resolve.

## Arguments

$ARGUMENTS

Expected format: `/resolve` (show all conflicts) or `/resolve <claim_id> <claim_id>` (resolve specific pair)

## Instructions

1. **Get current conflicts** via `wheat_compile` or `wheat_status`. List all unresolved conflicts.

2. **If no claim IDs provided**, show all conflicts and ask which to resolve. If claim IDs provided, focus on that pair.

3. **Present both sides**: Show both conflicting claims with full context — content, evidence tier, source origin, when added, and any corroborations.

4. **Resolve**: Either:
   - Ask the user to decide (present the tradeoff clearly)
   - If the user asks you to investigate, do additional research and recommend

5. **Apply resolution** via `wheat_resolve`:
   - Winner stays `active`
   - Loser becomes `superseded` with `resolved_by` set to winner's ID
   - Remove conflict references from `conflicts_with`

6. Run `wheat_compile` to verify the conflict is resolved.

7. **Print result**:

   ```
   Resolved: <winner_id> over <loser_id>
   Reason: <why>
   Remaining conflicts: <N>

   Next steps:
     /resolve            -- resolve next conflict
     /brief              -- compile if all conflicts resolved
     /blind-spot         -- check for gaps after resolution
   ```
