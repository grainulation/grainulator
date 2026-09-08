# bean — a worked example

A short walkthrough of what bean changes. The point isn't the task; it's that the answer
_converges_ — bean re-decides as it learns, and it doesn't stop at "looks done with a few
caveats."

## The task

> Replace the deprecated `parseDate()` helper with `parseDateUtc()` everywhere it's used
> in this service, and make sure nothing breaks.

## Without bean (one-shot)

The model greps `parseDate(`, find-and-replaces the hits, runs the test suite (green),
and reports success. It missed two call sites — one imported under an alias, one invoked
through a thin wrapper — that the literal grep never matched. Tests stayed green because
those paths weren't covered. It breaks in production. The wrong belief — "the helper only
appears as a literal `parseDate(` call" — was never challenged.

## With bean (convergence loop)

**Frame.** Goal: every call resolves to `parseDateUtc`, nothing breaks. Seed the ledger:

```
c1 constraint  no behavior change for callers     (stated)
c2 factual     helper appears as literal calls     (stated)
```

### Round 1 — survey, investigate the most decisive front

`c2` is `stated` and load-bearing, so _prove the set of call forms_ before changing
anything. Fan out: one search agent per package, briefed to find the symbol in **any**
form — literal call, aliased import, re-export, dynamic/wrapped invocation. Grounding
beats assumption: they read the actual files, not a single grep.

- **Record:** `c3 factual` — usages found per package, at `documented` (read from source).
- **Compile:** **conflict** — `c3` shows an aliased import and a wrapper call, contradicting
  `c2`'s "literal only"; one package's count came from a single agent (single-source).
- **Revise belief:** supersede `c2` → `c3` ("4 call forms, incl. alias + wrapper"). _This
  is the belief the one-shot run never killed._

### Round 2 — drive to the evidence bar

Investigate the compiler's next front: corroborate the single-source package, apply the
change to every form, draft per-call edits.

- **Record:** `c4 recommendation` — exact change per call form (`documented`).
- **Compile:** no conflicts, but one dynamic call is still `stated` — static search can't
  prove it's covered. **Not converged.**

### Round 3 — don't stop at the caveat (verify by running)

The one-shot run would have shipped here with a footnote. bean doesn't: it drives the
open front to closure. Add a test that actually exercises the dynamic call, then **run the
suite** — execution is the check, not a re-read. The wrapper path **fails** → fix it →
re-run green. The `stated` caveat becomes a `tested` fact instead of a flagged risk.

- **Record:** `c5 factual` — all call forms resolve to `parseDateUtc`, suite green
  (`tested`).
- **Cross-model blindspot:** for a behavior-changing sweep, have Codex review the raw diff
  independently (it judges the diff, not your summary). It flags a comment still referencing
  the old name — cosmetic, fixed.
- **Compile:** no unresolved conflicts; every load-bearing claim `tested`; a full round
  added only the cosmetic note. **Converged.**

### Deliver (the honest residual)

> Converged in 3 rounds. Revised 1 belief (call forms: literal-only → 4 forms incl. alias +
> wrapper — the ones a naive grep misses). Drove every gap to a `tested` fix. The only thing
> I could **not** drive to closure is genuinely out of reach: one downstream service consumes
> this helper's output format and I can't run it from here — flagged for its owner to confirm.

That last line is the distinction bean enforces: a residual is something **genuinely
unreachable**, not something you stopped short of. "Here are some caveats" is not done;
"here is the one thing I cannot verify, and why" is.

## The difference

Same model, same capability. bean didn't make it smarter — the compiler surfaced the
"literal-only" belief as a conflict in round 1 and forced its revision, and the
never-stop-at-caveats rule turned the round-2 caveat into a round-3 verified fix instead of
a production break.
