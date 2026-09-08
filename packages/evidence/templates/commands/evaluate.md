# /evaluate — Test claims against reality, resolve conflicts

You are running the evaluation phase of the current Grainulator sprint. This is the honesty phase — where claims meet data.

Read CLAUDE.md for sprint context and claims.json for all existing claims.

## Process

1. **Run the compiler first**:

   ```bash
   grainulator compile --summary
   ```

   Identify conflicts, weak evidence areas, and coverage gaps.

2. **Evaluate systematically**: For each topic with weak or conflicting evidence:

   - Run benchmarks, cost calculations, feature comparisons
   - Test prototypes against real conditions
   - Pull production metrics from connected tools if available
   - Cross-reference claims against each other

3. **Resolve conflicts**: When evaluation produces a clear answer:

   - Update the winning claim's evidence tier
   - Mark the losing claim as `superseded` with `resolved_by`
   - Add new evaluation claims (evidence: "tested") if needed

4. **Generate comparison dashboard**: Create `evidence/<topic-or-sprint-slug>.html` — a dashboard-style HTML page showing:
   - Side-by-side comparisons with real numbers
   - Conflict resolutions with evidence
   - Data tables, charts (CSS-only), metrics

## Claim updates

Evaluation claims use evidence tier `tested` or `production`:

```json
{
  "id": "e001",
  "type": "factual",
  "topic": "<what was evaluated>",
  "content": "<measured result — always include numbers>",
  "source": {
    "origin": "evaluation",
    "artifact": "evidence/<slug>.html",
    "connector": null
  },
  "evidence": "tested",
  "status": "active",
  "phase_added": "evaluate",
  "timestamp": "<ISO timestamp>",
  "conflicts_with": [],
  "resolved_by": null,
  "tags": []
}
```

Update `meta.phase` to "evaluate" in claims.json.

## Run the compiler again

```bash
grainulator compile --summary
```

Verify that conflicts are resolved. If the compiler still shows blockers, tell the user what remains.

## Version control

Preserve the user’s edits. Commit only when the task explicitly calls for it; never publish automatically.

## Tell the user

- Show the compilation status (ready or still blocked)
- Summarize what was evaluated and key findings
- Point them to the comparison dashboard HTML
- If ready: suggest `/brief` to compile the decision document
- If blocked: explain what conflicts remain and how to resolve them

$ARGUMENTS

## Managed evidence and completion

Use Grainulator tools or CLI for claim mutations; do not directly rewrite managed ledger files. Evidence tiers describe actual support, not the connector used. Investigate only material gaps and finish the requested artifact without fixed claim or pass quotas.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
