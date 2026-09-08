---
name: bean
description: >
  Run a task as a recursive convergence loop, not a fixed checklist: investigate the
  most decisive open question, record what you learn as typed evidence in a ledger, let a
  compiler score what is still weak or contradictory, revise beliefs that new evidence
  overturns, and loop until the evidence converges — then deliver. Continuously spins up
  subagents and uses whatever skills/connectors exist. Verbose by default. Trigger on
  /bean, on "do this thoroughly / be systematic / deep work mode", OR when a task spans
  multiple files, sources, or sessions. Do NOT trigger on ordinary tasks a direct attempt
  handles fine. Auto-trigger applies only where the runtime allows it; on Codex, bean
  runs only on an explicit /bean.
---

# bean

bean runs a task the way the Fable model worked: it keeps looking where a one-shot answer
would stop, kills its own incorrect beliefs as it learns, validates its work against a
real signal before declaring done, and improves from its own accumulated notes. It is a
**recursive convergence loop**, not a fixed sequence of phases.

bean runs on a **runtime**: a _claim ledger_ (typed evidence with tiers, that can be
superseded) plus a _compiler_ that scores convergence (conflicts, coverage gaps, weak
evidence, undischarged risks) and **exits nonzero until it is reached**. bean ships its own
self-contained compiler — `bean-check`, a single static binary — as the default, so the loop
has a real gate that runs anywhere. In strict mode it gates load-bearing claims on a real
external oracle (`verified_by` + `bean-verify`), and a native Stop hook (`bean-hook`) couples
it to execution so the agent can't finish until it converges. **grainulator/wheat** is an
optional richer backend when present. See [references/runtime.md](references/runtime.md).

**A note on what this is.** bean shapes the _procedure_ a model follows, not its
capability ceiling. The recursion and self-correction it prescribes are only as good as
the model running them. Treat this as a loop discipline, not a capability transplant.

## When NOT to use this

If a task has one obvious correct approach and fits in a single pass, do it directly. The
convergence loop earns its cost only when the right answer is not knowable up front —
when you have to investigate, get it partly wrong, and correct toward it.

**Match the deliverable to the request.** If you were asked only to _assess_ — review,
audit, recommend — deliver the assessment with its residual; don't quietly turn it into
edits. Reversible actions the task plainly implies are fine to take; destructive or
scope-expanding ones get confirmed first (see the mutation policy in
[references/runtime.md](references/runtime.md)).

## The loop

Frame once, then iterate the inner loop until it converges. This is `loop-until-dry` on
the claim graph: you stop when there is nothing decisive left to learn, not after a fixed
number of steps.

### Frame (once)

State the question or goal. Seed the ledger with the known constraints as claims. Confirm
the task earns the loop (otherwise just answer it).

### Iterate until converged

**1. Survey the environment.** Re-assess what's available _this round_: loaded skills,
subagent tooling, MCP connectors, data sources. Fable's strength was learning the
environment first and then acting on a grounded picture — do this every round, not once.
See [references/discover.md](references/discover.md).

**2. Investigate the most decisive open front.** Let the compiler's signal pick the
target: the unresolved conflict, the weakest-evidence topic, the missing claim type — the
one thing whose answer most changes the outcome. Spin up subagents and use existing
skills/connectors to gather evidence; don't do serially what you can fan out. See
[references/delegate.md](references/delegate.md).

**3. Record as typed claims with evidence tiers.** Write what you learned into the ledger
— factual / constraint / risk / recommendation / estimate, each at its evidence tier
(stated < web < documented < tested < production). The ledger is your memory across
rounds; ground claims in sources actually read, never assumption. See
[references/verify.md](references/verify.md).

**4. Compile.** Run the runtime's compiler (`bean-check` by default). It returns the
convergence signal: unresolved conflicts, coverage gaps, single-source / type-monoculture
topics, weak-evidence / below-bar claims, and undischarged risks (with wheat, also a
confidence read), and **exits nonzero until convergence**. This is a check that can fail —
"it looks right" is not it. See [references/bean-check.md](references/bean-check.md).

**5. Revise beliefs.** When new evidence overturns an earlier claim, _supersede_ it
("kill the incorrect belief") and resolve the conflict, rather than letting the
contradiction stand. The loop goes forward and backward. See
[references/belief-revision.md](references/belief-revision.md).

**6. Converged?** Don't stop at "looks done, but…". Drive every open front to one of three
terminal states — confirmed non-issue, fixed-and-verified, or a true residual you genuinely
can't reach from here. This includes every concern you _noticed_: a risk or contradiction
you logged is an open front, and recording it is not resolving it — proceeding past a
logged-but-undischarged concern is the dominant failure mode. A caveat that's none of those
three is a place you stopped early; keep looking where a one-shot answer would quit. Converged = no unresolved conflicts + evidence
bar met for every load-bearing claim + a full round drove no front to a new state.
Otherwise go back to step 1 on the next-most-decisive front. On high-stakes work, run an
independent adversarial / cross-model check before declaring done. See
[references/convergence.md](references/convergence.md) and
[references/codex-blindspot.md](references/codex-blindspot.md).

### Deliver

Present the converged answer plus the residual: the weakest surviving claims, anything
still unverified, and what would change the conclusion. See
[references/self-critique.md](references/self-critique.md).

## Verbose by default

bean works in the open. Each round, surface the ledger state, the compiler's signal, what
that signal made you investigate next, and which beliefs you revised. The point is that an
observer can see the answer converge and where any error entered. `/bean quiet` collapses
the per-round narration but never hides an unresolved conflict or an unverified
load-bearing claim. See [references/verbosity.md](references/verbosity.md).

## What this skill doesn't do

It doesn't make the model smarter. A model that can't tell good evidence from bad, or
won't actually revise a wrong belief, will converge on a confident wrong answer faster.
bean structures the iteration; the judgment inside each step is the model's. When a task
is genuinely beyond the model, say so rather than looping to a plausible-sounding wrong
result.
