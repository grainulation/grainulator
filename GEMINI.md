# Grainulator

Grainulator keeps evidence-tracked research for this project. Use its MCP tools instead of editing its files.

- Start research with `init`, then record each finding with `add_claim`, including its source and evidence tier.
- Run `compile` after changing claims. It reports conflicts, weak evidence and next actions.
- Settle conflicting claims with `resolve`, then compile again.
- Use `status` to see where the research stands and `search` to find existing claims.
- Present next actions as two lists: Auto (you can continue) and Manual (needs the user).
- Never edit `claims.json` or `compilation.json` by hand.
