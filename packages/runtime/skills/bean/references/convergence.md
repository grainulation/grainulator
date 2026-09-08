# Reference: convergence

The convergence loop replaces "do these N phases" with "keep going until there's nothing
decisive left to learn." Two questions drive every round: **what do I investigate next?**
and **am I done?** Both are answered by the compiler signal, not by a step counter.

## Picking the next move

Each round, investigate the **most decisive open front** — the one whose answer most
changes the outcome. Read it off the compiler signal, roughly in this priority:

1. **Unresolved conflict** — two claims disagree. Resolve it before building on either; a
   contradiction at the core poisons everything downstream.
2. **A load-bearing claim with weak evidence** — the conclusion rests on something only
   `stated` or `web`. Go get `documented`/`tested` evidence, or find it's false.
3. **A coverage gap** — a topic the answer needs but the ledger doesn't cover, or covers
   with only one claim type.
4. **A single-source / echo-chamber topic** — everything came from one place; corroborate
   independently.

If several are tied, prefer the one that could most cheaply prove you _wrong_. The fastest
path to a right answer is killing wrong beliefs early.

### Effort is a budget to allocate, not a dial to turn up

Spend the expensive moves — high reasoning effort, parallel fan-out, the cross-model
blindspot lane — on the **one or two most decisive, hardest open fronts**, not uniformly.
Past a point, more effort and more agents on an _easy_ front buy almost nothing: the
score-vs-cost curve flattens while cost keeps climbing, and naive multi-agent fan-out on a
front that didn't need it is often slower than a single focused pass. Read the decisive
front off the signal, pour effort there, and single-pass the rest.

## The self-correction progression

A useful shape for each investigation — **fail → investigate → verify → distill →
consult**:

- **fail** — try the most decisive thing; expect to be partly wrong.
- **investigate** — when a check fails or a conflict appears, dig into _why_, don't paper over it.
- **verify** — confirm the fix against a real signal (a test, a source, a compile), not introspection.
- **distill** — record the resolved understanding as a claim; supersede what it overturns.
- **consult** — when stuck or the signal is ambiguous, bring in an independent view (a subagent, a connector, the cross-model blindspot lane) rather than guessing.

## Don't stop at caveats — drive each front to closure

This is the trait that separates a convergence loop from a one-shot answer with a footnote.
When a round ends with "looks done, but X is unverified / Y might be a problem," **that is
not done** — each open front must be driven to one of exactly three terminal states:

- **Confirmed non-issue** — you grounded it and it's fine (with the evidence to show it).
- **Fixed** — you closed it and verified the fix by running/rendering (`stated` → `tested`).
- **True blocker / genuine residual** — it cannot be resolved from where you are: it needs
  a human decision, an access you don't have, or a system you can't run. Name it precisely
  and say _why_ it's unreachable.

A caveat that is none of these three is just a place you stopped early. "Here are some
things to watch" is a cop-out; "here is the one thing I genuinely cannot verify, and the
exact check that would close it" is the honest end state. Keep looking where a one-shot
answer would quit — that persistence is most of bean's value.

### The notice→act gap is the dominant failure — close it with a gate

The most common way a careful loop still ships a wrong answer is **not** failing to
notice. It's noticing — surfacing the relevant concern, even writing it down — and then
proceeding as if it were resolved. The concern gets logged and the output rolls past it.

So make discharge a hard gate, not a hope:

- **Record at find-time, not report-time.** The moment you notice a concern, a defect, or
  a contradicting signal, write it into the ledger as a claim (a `risk`, or a conflict).
  Don't hold it in your head to "mention later" — held concerns are the ones that get
  dropped. A found-but-unrecorded finding is the same failure as never finding it.
- **Every recorded concern must be discharged or it blocks convergence.** A claim that
  raises a risk or a conflict is an open front by definition. It reaches a terminal state
  the same three ways as any front — confirmed non-issue, fixed-and-verified, or named
  true residual — and until it does, the loop is **not** converged, no matter how good the
  rest looks. The compiler treats an open conflict as red; treat an undischarged concern
  the same way even when you logged it yourself.
- **Recording is not resolving.** Writing "this might be wrong" is the start of the work,
  not the end of it. Don't let the act of documenting a concern stand in for acting on it.

### …but persistence is not over-engineering

The same drive, unbounded, is a known failure mode: a relentlessly proactive model will
burn a fortune building elaborate workarounds for a problem a human could have answered in
ten seconds, and ship a symptom-level band-aid it never had to. Persistence means not
abandoning a **decisive** front, not manufacturing heroics on a trivial one. Three checks
keep it honest:

- **Proportion the effort to the stakes.** A two-line fix does not earn a convergence
  loop or a browser-automation rig. If the trigger gate barely fired, do the small thing
  and stop.
- **Asking the human is the consult move of _last resort_, not a default off-ramp.** It's
  the right call for a _genuine_ blocker — a credential, an access, an irreducible decision
  you cannot derive. But do not stop to ask what you can investigate: if the answer is
  reachable with the tools you have, drive and get it. **Satisficing** — punting an
  investigable front back to the human, or trimming the loop short of its terminal states —
  is the failure this guards against. (Proportion still applies: a trivial task doesn't earn
  the loop at all. Proportion ≠ satisfice: the test is "is this front investigable?", not
  "is this effortful?")
- **Fix the cause, not the symptom.** "The error went away" is not the same as "I
  understand why it happened." Before calling a front closed, check you addressed the root,
  not just silenced the signal.
- **Stay on the goal — re-anchor each round.** Restate the frame at the top of each round.
  A side-front or nuance must either close a blocker _on the goal_ or be deferred — never
  silently become the new goal. Drifting off the goal to chase little detours is its own
  failure (goal-drift), the inverse of satisficing and just as costly.

## Pivot, don't stop — there are only a few true stops

The default response to a wall is a **pivot**, not a stop. A front stalls, a check fails, a
round adds nothing — none of those is a reason to stop; they are reasons to _change the move_:
attack a different open front, try a different approach, supersede a belief, escalate the
effort, or re-frame. Stopping at the first stall is the satisficing failure this whole
discipline guards against.

There are only a few **true stops** — everything else is a pivot:

1. **Converged** — no unresolved conflicts, the evidence bar (or an oracle) is met, and a dry
   round added nothing. The answer is done.
2. **Hard ceiling** — the round/token budget is exhausted. A forced stop: deliver what you
   have with the open fronts named, never relabelled as "done".
3. **Genuine residual** — a front you truly cannot reach from here (a credential, an access, an
   irreducible human decision), named with its reason. Rare, and pressure-tested: only after
   pivots have failed, never as a first off-ramp.

A "stuck" stop (no progress) is legitimate **only after repeated pivots have failed**, not on
the first no-progress round. (The `bean-run` driver encodes this: a stalled round pivots —
injecting a change-approach directive — and only becomes a stuck stop once the pivot budget is
spent.)

## Knowing when to stop

bean is **converged** when all three hold:

- **No unresolved conflicts** in the ledger.
- **Evidence bar met** — every load-bearing claim is at `documented` or better, or its gap
  is an explicit _true residual_ (not an unexamined caveat).
- **Dry round** — a full Survey → Investigate → Compile round drove no open front to a new
  terminal state.

The dry-round test prevents both premature stopping (one answer and done) and endless
spinning (re-deriving the same claims). If rounds keep adding noise but move no front to
confirmed/fixed/true-blocker, that itself is a dry round — stop.

## Guardrails against false convergence

- **Ambiguous signals don't count as convergence.** If the only reason a topic looks
  settled is that you couldn't get a real signal, that's an open front to drive, not a pass.
  (Fable's loop degraded exactly when the external signal was ambiguous; don't let "no
  signal" read as "good signal.")
- **Budget the loop.** Set a round or token ceiling up front. If you hit it before
  converging, stop and deliver what you have _with the open fronts named as open_ — never
  silently truncate, and never relabel "ran out of budget" as "done."
- **Dedup against everything seen, not just what survived.** When checking "new this
  round," compare against all claims ever raised, including rejected ones — otherwise a
  rejected idea reappears every round and the loop never converges.
- **Internal convergence is not correctness.** The signal certifies the ledger is
  self-consistent and grounded — it has _no oracle_ for whether you understood the task
  right. An answer can converge cleanly against a wrong interpretation ("verified the wrong
  thing"). Where an external signal exists (a real test, a ground-truth API), gate on _it_,
  not on your self-built ledger. Where none exists, name the interpretation as an explicit
  residual — never let "the ledger is consistent" read as "the answer is correct."
