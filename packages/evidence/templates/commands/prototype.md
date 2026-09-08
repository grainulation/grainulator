# /prototype — Build something testable

You are building a proof-of-concept for the current Grainulator sprint. Read CLAUDE.md for sprint context and claims.json for existing research claims.

## Process

1. **Determine what to prototype**: Based on the user's argument and existing research claims. If no argument given, look at the research and suggest the most promising option to test.

2. **Build it**: Create a working prototype in `prototypes/<name>/`. This should be:

   - Minimal — just enough to test the hypothesis
   - Runnable — include a README or run script
   - Measurable — produce output that can be evaluated

3. **Also generate a demo artifact**: Create `prototypes/<name>/demo.html` — a self-contained HTML page that shows what the prototype does, with screenshots, code snippets, or interactive elements. Non-technical stakeholders should be able to understand the prototype from this page alone.

## Claim updates

Every prototype finding becomes a claim with evidence tier `tested`:

```json
{
  "id": "p001",
  "type": "factual",
  "topic": "<what was tested>",
  "content": "<what we found — be specific with numbers>",
  "source": {
    "origin": "prototype",
    "artifact": "prototypes/<name>/",
    "connector": null
  },
  "evidence": "tested",
  "status": "active",
  "phase_added": "prototype",
  "timestamp": "<ISO timestamp>",
  "conflicts_with": [],
  "resolved_by": null,
  "tags": []
}
```

**Critical**: Check if any existing research claims (evidence: "web") are contradicted by prototype results. If so:

- Set `conflicts_with` on both claims
- The compiler will auto-resolve in favor of `tested` over `web`

Update `meta.phase` to "prototype" in claims.json if this is the first prototype.

## Run the compiler

```bash
grainulator compile --summary
```

Report evidence upgrades (research claims superseded by prototype findings).

## Version control

Preserve the user’s edits. Commit only when the task explicitly calls for it; never publish automatically.

## Tell the user

- Point them to the demo.html and the actual prototype code
- Summarize what was tested and what was found
- Highlight any research claims that were confirmed or contradicted
- Suggest: more `/prototype` for other options, `/evaluate` to compare, or `/status` to see progress

$ARGUMENTS

## Managed evidence and completion

Use Grainulator tools or CLI for claim mutations; do not directly rewrite managed ledger files. Evidence tiers describe actual support, not the connector used. Investigate only material gaps and finish the requested artifact without fixed claim or pass quotas.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
