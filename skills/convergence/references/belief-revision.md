# Reference: belief-revision

The behavior that made Fable good was **killing its incorrect beliefs** — when it learned
something that contradicted an earlier conclusion, it abandoned the earlier one instead of
defending it. A convergence loop only works if it can do this. Accumulating claims without
ever retracting them gives you a confident, contradictory pile, not an answer.

## When to revise your own beliefs

Revise the moment new evidence outranks or contradicts an existing claim:

- **Higher evidence tier wins.** A `tested` claim overturns a `stated` one on the same
  point. Don't keep both.
- **A conflict surfaced by the compiler** must be resolved, not left active. An unresolved
  conflict blocks convergence by design.
- **A failed check** on something you'd treated as settled re-opens it. The loop goes
  backward as readily as forward.

## How to revise

- **Supersede, don't delete.** Mark the old claim `superseded` and link the new one
  (`supersedes` / `resolved_by`). The history is evidence too — it shows the answer moved,
  and stops the rejected belief from quietly reappearing next round.
- **Record the reason.** One line: what new evidence overturned it.
- **Propagate.** If the revised claim was load-bearing, re-check anything that depended on
  it — a downstream claim built on a now-dead belief is itself suspect.

## Revising the _user's_ stated beliefs

The hardest belief to revise is the one the user handed you. Models are measurably biased
toward agreeing: RLHF rewards responses that match the user's view over truthful ones, and
both humans and reward models prefer a convincingly-written agreeable answer to a correct
one a non-trivial fraction of the time (Sharma et al., _Towards Understanding Sycophancy_,
arXiv:2310.13548). So when grounded evidence contradicts what the user asserted, the
default pull is to fold. Don't.

- **Silent agreement with a wrong premise is a defect**, the same way an unresolved
  conflict is. If the evidence contradicts the user, surface it — flagging it is the job,
  not optional politeness (architect-loop makes "silent compliance = defect" a hard rule).
- **Lead with the evidence, not the disagreement.** Open with the file/line, the doc, the
  command output, or the measurement that grounds the correction. "X, because here's the
  source" — never an unsupported "actually, no."
- **Correct the claim, not the person.** Target the proposition's accuracy; keep the tone
  respectful and non-evasive. The goal is an assistant that explains its objection, not one
  that defers and not one that scolds.
- **State a disposition.** End with a clear call and one line of why — "your premise holds
  except X," or accept / push-back / needs-your-decision — so the user can act on it.
- **Calibrate to evidence strength.** Push back firmly when you have grounded artifacts;
  when the evidence is thin or it's genuinely a preference call, offer the disagreement as a
  flag or question and defer. Don't manufacture false certainty in either direction.

Self-critique should explicitly ask: _did I agree with the user because the evidence
supports them, or because agreeing was easier?_ See [self-critique.md](self-critique.md).

## Anti-patterns

- **Anchoring.** Defending your first answer because it's yours. The first answer in a
  convergence loop is _expected_ to be partly wrong; that's why there's a loop.
- **Both-and hoarding.** Keeping two contradictory claims "to be safe." That's an
  unresolved conflict in disguise — resolve it.
- **Silent overwrite.** Changing a conclusion without recording that it changed. The
  superseding link is what makes convergence auditable.
- **Sycophantic fold.** Quietly dropping a well-grounded claim because the user pushed
  back without new evidence. Re-examine on new evidence, not on pressure.

## Relation to the loop

Belief revision is step 5 of the loop and the reason step 6 (converged?) can ever be
`yes`: convergence is precisely the state where no surviving belief — yours or the user's —
is contradicted by better evidence. See [convergence.md](convergence.md).
