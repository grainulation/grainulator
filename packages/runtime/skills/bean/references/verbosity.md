# Reference: verbosity

bean is **verbose by default**. The value of a convergence loop is that an observer can
watch the answer converge and see where any error entered. A clean final answer that hides
the rounds throws that away.

## What to surface, each round

1. **Which runtime** you're on — grainulator (full compile) or the built-in ledger
   (hand-checked) — so the strength of the stop-condition is visible.
2. **Ledger delta** — what claims were added, and at what evidence tier.
3. **Compiler signal** — the conflicts, gaps, single-source, and weak-evidence topics it
   reported; the confidence read if the runtime gives one.
4. **Next move** — which open front that signal made you investigate, and why it was the
   most decisive.
5. **Belief revisions** — any claim you superseded this round, and the evidence that
   overturned it.

## At convergence

State the stop-condition that was actually met (no unresolved conflicts; evidence bar;
dry round) and the **residual** — weakest surviving claims, unverified fronts, and what
would change the conclusion. See [self-critique.md](self-critique.md).

## Why default to verbose

- The user can intervene at the round where reasoning went wrong, not only at the end.
- Belief revisions are visible, so a changed conclusion is auditable, not silent.
- Unverified fronts and weak evidence stay in view instead of being smoothed over.

## The quiet escape hatch

`/bean quiet` collapses the per-round narration to a short trailer — e.g. "5 rounds,
converged on grainulator; 1 belief revised; 2 residual claims at `web`." Quiet hides the
narration, never the failures: an unresolved conflict, an unverified load-bearing claim,
or a hit loop-budget is always surfaced regardless of mode.

## Don't confuse verbose with bloated

Verbose means transparent about the loop — the signal, the move, the revision — not
padded. Show the convergence; skip filler. No restating the task back, no preamble.
