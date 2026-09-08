# /replay — Time-Travel Through Sprint Evolution

You are reconstructing the historical evolution of this sprint by recompiling every version of claims.json from git history.

## Process

1. **Get the git history of claims.json**:

   ```bash
   git log --oneline claims.json
   ```

   This gives every commit that touched claims.json — the sprint event log.

2. **Extract each historical version**: For each commit hash:

   ```bash
   git show <hash>:claims.json > /tmp/grainulator-replay-<N>.json
   ```

3. **Recompile each version** with the current compiler:

   ```bash
   grainulator compile --input /tmp/grainulator-replay-<N>.json --output /tmp/grainulator-comp-<N>.json
   ```

4. **Compute deltas** between consecutive compilations:

   ```bash
   grainulator compile --diff /tmp/grainulator-comp-<N-1>.json /tmp/grainulator-comp-<N>.json
   ```

5. **Identify interesting moments** in each delta:

   - Phase transitions (define -> research -> prototype -> evaluate)
   - First time compilation went "ready"
   - Peak conflict count
   - Evidence tier jumps (topic going web -> tested)
   - Claims added then superseded (the sprint changed its mind)

6. **Generate replay HTML**: Create `output/replay.html` — a self-contained timeline visualization using a dark scroll-snap template. Include:

   - Frame-by-frame scrubbing (each commit = one frame)
   - Highlighted pivotal moments
   - Coverage evolution chart
   - Summary statistics per frame

7. **Print a text summary** to the terminal with the key narrative moments.

## Version control

Preserve the user’s edits. Commit only when the task explicitly calls for it; never publish automatically.

## Tell the user

- How many frames (commits) were found
- The most interesting moments
- Point them to `output/replay.html` for the full interactive timeline
- Suggest: `/handoff` to package this narrative for a successor

## Cleanup

Remove temporary files from /tmp after generating the output:

```bash
rm -f /tmp/grainulator-replay-*.json /tmp/grainulator-comp-*.json
```

$ARGUMENTS

## Managed evidence and completion

Use Grainulator tools or CLI for claim mutations; do not directly rewrite managed ledger files. Evidence tiers describe actual support, not the connector used. Investigate only material gaps and finish the requested artifact without fixed claim or pass quotas.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
