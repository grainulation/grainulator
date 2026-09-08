# /merge — Combine Claim Sets Across Sprints

You are merging claims from another sprint into the current one. This is for when two teams researched the same problem independently and need to combine their findings.

## Process

1. **Parse the argument**: The user provides a path to another sprint's claims.json.

   - Example: `/merge ../auth-sprint/claims.json`
   - If no path given, ask for it.

2. **Validate both claim sets**:

   - Read the current `claims.json`
   - Read the incoming claims file
   - Validate both against the compiler schema:
     ```bash
     grainulator compile --input <incoming-path> --output /tmp/grainulator-merge-incoming.json
     ```

3. **Determine the sprint slug**: Derive from the incoming sprint's `meta.question`.

4. **Resolve ID collisions**: Prefix all incoming claim IDs with the sprint slug:

   - `r001` -> `auth-r001`
   - Also update all `conflicts_with` and `resolved_by` references.

5. **Align topics**: Present probable topic mappings for user confirmation.

6. **Detect cross-sprint conflicts** and **identify evidence upgrades**.

7. **Import each supported claim through Grainulator mutation tools**, preserving IDs or allocating collision-free IDs and recording source provenance, then compile:
   ```bash
   grainulator compile --summary
   ```

## Version control

Preserve the user’s edits. Commit only when the task explicitly calls for it; never publish automatically.

## Tell the user

- How many claims were merged
- Topic alignment results
- Cross-sprint conflicts detected
- Suggest: `/resolve` for conflicts, `/blind-spot` for cross-sprint gaps

## Cleanup

```bash
rm -f /tmp/grainulator-merge-*.json
```

$ARGUMENTS

## Managed evidence and completion

Use Grainulator tools or CLI for claim mutations; do not directly rewrite managed ledger files. Evidence tiers describe actual support, not the connector used. Investigate only material gaps and finish the requested artifact without fixed claim or pass quotas.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
