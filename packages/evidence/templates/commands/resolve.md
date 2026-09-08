# /resolve -- Adjudicate a conflict

The user wants to resolve a conflict between claims that the compiler couldn't auto-resolve.

## Arguments

$ARGUMENTS

Expected format: `/resolve` (show all conflicts) or `/resolve <claim_id> <claim_id>` (resolve specific pair)

## Instructions

1. **Get current conflicts** via `grainulator.compile` or `grainulator.status`. List all unresolved conflicts.

2. **If no claim IDs are provided**, use the active task and compiler priority to select material conflicts. If specific IDs are supplied, focus on that pair. Ask only if scope cannot be inferred.

3. **Present both sides**: Show both conflicting claims with full context — content, evidence tier, source origin, when added, and any corroborations.

4. **Resolve with evidence**: Investigate within the existing authorization, choose the supported outcome, and record the reason. Ask the user only when the conflict turns on their preference, an unavailable fact, or a decision reserved for them.

5. **Apply resolution** via `grainulator.resolve`:
   - Winner stays `active`
   - Loser becomes `superseded` with `resolved_by` set to winner's ID
   - Remove conflict references from `conflicts_with`

6. Run `grainulator.compile` to verify the conflict is resolved.

7. **Print result**:

   ```
   Resolved: <winner_id> over <loser_id>
   Reason: <why>
   Remaining conflicts: <N>

   Auto

   - <authorized next action>

   Manual

   - <action requiring the user, or None.>
   ```

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
