# Reference: self-critique (deliver the residual)

Convergence is not perfection — it's the state where no _surviving_ belief is contradicted
by better evidence you bothered to get, and every open front was driven to a terminal state.
There is always a residual. The delivery step names it, so the user sees the edges of the
answer instead of a false clean bill.

## State the residual

When the loop converges, deliver the answer plus:

- **The weakest surviving claims** — which load-bearing conclusions rest on the thinnest
  evidence (the `web`/`stated` ones that mattered but you couldn't lift).
- **True residuals only** — fronts you genuinely could not close from here (need a human
  decision, an access you lack, or a system you can't run), each with the exact check that
  _would_ close it. A residual is not "something to watch"; it's "something I could not
  reach, and here's why."
- **What would change the conclusion** — the single piece of evidence that, if it went the
  other way, would flip the answer. If you can't name one, you probably haven't probed hard
  enough.

## Last-pass questions

- Which load-bearing claim is at the lowest evidence tier, and why couldn't I lift it?
- **Did I notice anything I then proceeded past?** Re-scan the round for a concern, defect,
  or contradicting signal I surfaced — in the ledger or just in reasoning — that never got
  discharged. A noticed-but-undischarged issue is the dominant failure mode: it must be a
  confirmed non-issue, a verified fix, or a named true residual before delivery, never a
  thing I logged and rolled past (see [convergence.md](convergence.md)).
- **Did I fabricate where I should have abstained?** Any confident claim resting on context
  I didn't actually have should be an honest `unknown` / `needs-input` instead (see
  [verify.md](verify.md)).
- **Did I stop at a caveat I could have driven to closed?** Re-read every "but X is
  unverified" — is it a confirmed non-issue, a fix, or a genuine true blocker? If it's none
  of those, keep going (see [convergence.md](convergence.md)).
- **Or did I over-engineer it?** Did the effort match the stakes — or did I build a rig for
  a two-line fix? Could a quick question to the human have closed a front faster than the
  workaround I built? Did I fix the root cause, or just silence the symptom?
- **Did I agree with the user because the evidence supports them, or because agreeing was
  easier?** Re-check anything where you deferred to a stated belief without grounding it
  (see [belief-revision.md](belief-revision.md)).
- Did I _run/render_ the artifact, or only read it? Where the check was introspection, it
  isn't verified (see [verify.md](verify.md)).
- Where did the runtime's signal go ambiguous, and did I let that read as convergence?
- What would a reviewer who dislikes this conclusion attack first?

## This is also a last belief-revision pass

Reading the converged answer as a skeptic sometimes surfaces a contradiction the compiler
didn't catch (a subtle one between topics, an assumption no claim recorded). If it does,
that's not a delivery footnote — it re-opens the loop. Supersede the bad belief and re-run
the affected round before delivering. See [belief-revision.md](belief-revision.md).

Honest residuals are part of verbose-by-default delivery — surfaced even in `/bean quiet`.
See [verbosity.md](verbosity.md).
