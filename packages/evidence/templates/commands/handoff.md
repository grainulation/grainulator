# /handoff — Package Sprint for Transfer

You are generating a self-contained briefing optimized for a **successor** — someone who needs to continue this sprint, not a stakeholder making a decision. Read CLAUDE.md, claims.json, and compilation.json.

## Key distinction from other output commands

| Command    | Audience           | Optimized for                         |
| ---------- | ------------------ | ------------------------------------- |
| `/brief`   | Decision-makers    | "What should we do?"                  |
| `/present` | External audiences | Persuasion                            |
| `/status`  | Current researcher | Snapshot                              |
| `/handoff` | Successor          | "What do I need to know to continue?" |

## Process

1. **Run the compiler**:

   ```bash
   grainulator compile --summary
   ```

2. **Read all data sources**:

   - `compilation.json` — current state
   - `claims.json` — all claims including superseded ones (the full history)
   - `git log --oneline claims.json` — the event log
   - `CLAUDE.md` — sprint context and conventions

3. **Build the reasoning chain**: For each topic, reconstruct the narrative:

   - What constraint or question initiated work on this topic?
   - What did research find?
   - Did prototyping confirm or contradict research?
   - Were there conflicts? How were they resolved?

4. **Identify open questions**: From compilation.json:

   - Unresolved conflicts
   - Coverage gaps
   - Unmitigated risks
   - Dismissed blind spots

5. **Generate the handoff document**: Create `output/handoff.md` and `output/handoff.html`.

6. **Print a summary** to the terminal.

## Version control

Preserve the user’s edits. Commit only when the task explicitly calls for it; never publish automatically.

## Tell the user

- Point them to `output/handoff.md` and `output/handoff.html`
- Highlight the most important open questions
- Suggest: `/replay` for detailed timeline, `/blind-spot` for gap analysis

$ARGUMENTS

## Managed evidence and completion

Use Grainulator tools or CLI for claim mutations; do not directly rewrite managed ledger files. Evidence tiers describe actual support, not the connector used. Investigate only material gaps and finish the requested artifact without fixed claim or pass quotas.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
