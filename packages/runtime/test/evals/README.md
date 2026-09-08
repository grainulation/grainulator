# bean behavioral evals

Static tests (`test/smoke.test.js`) prove the skill is _well-formed_. They cannot prove
the model _follows_ it — bean is a prompt, so its real test is behavioral. These evals are
prompt + rubric pairs. Run the prompt under `/bean`, then score the transcript against the
rubric. Each rubric line is a check that can **fail**.

## How to run

1. In a client with bean installed, send the eval's **Prompt**.
2. Capture the transcript.
3. Score each **Rubric** line PASS/FAIL against the transcript.
4. For an independent score, hand the transcript + rubric to a fresh agent or to Codex
   (bean's own blindspot lane) rather than self-grading — a model grading its own
   transcript shares its own blind spots.

A run passes only if every `[must]` line passes. `[should]` lines are quality signals.

---

## eval-01 — trigger discrimination (negative)

**Prompt:** `What's the capital of France?`

**Rubric:**

- [must] bean does NOT engage the convergence loop (no ledger, no rounds, no compile for a
  one-shot fact).
- [must] The question is answered directly.
- [should] If bean comments at all, it names the trigger gate as the reason it declined.

## eval-02 — trigger discrimination (positive)

**Prompt:** `/bean Rename a config value that appears in 9 repos in three different forms.`

**Rubric:**

- [must] Frames the goal and confirms the task earns the loop before diving in.
- [must] Surveys the environment (names available skills / delegation tooling / connectors).
- [must] Investigates the most decisive open front first — establishing the value's
  multiple forms — before proposing any replacement.
- [must] Records findings as typed claims with evidence tiers (ledger or hand-ledger).
- [must] Convergence rests on a failable signal (compile / hand-checked convergence), not
  "it looks right."
- [must] Delivers a residual / self-critique naming >=1 weakness, each with a disposition.
- [should] Proposes an independent / cross-model review for the CI-affecting change.

## eval-03 — software task, failable check enforced

**Prompt:** `/bean Add input validation to the three API handlers in this service and prove it works.`

**Rubric:**

- [must] Reads the relevant handlers before writing.
- [must] Verification is a test that runs (not an assertion that it should work).
- [must] Error paths are exercised, not only the happy path.
- [must] Any load-bearing claim without a real check is held at its honest evidence tier
  and flagged unverified — never asserted as `tested`.

## eval-04 — verbosity contract

**Prompt:** `/bean quiet <any multi-round task>`

**Rubric:**

- [must] Every loop step still runs (not skipped because quiet).
- [must] Output is terse — no full round-by-round narration.
- [must] Any failed or unverified-but-load-bearing check is STILL surfaced.

## eval-05 — grainulation power-ups (stack present)

**Prompt:** `/bean <research task>` with a wheat sprint active.

**Rubric:**

- [must] Logs at least one typed claim with an evidence tier.
- [should] Dispatches a grainulator research subagent for the investigation.
- [should] Corroborates a load-bearing external claim via deepwiki.
- [should] Gates delivery on `wheat compile`.
- [must] If a power-up tool is absent, runs the portable path and says so (graceful
  degradation) rather than failing.

## eval-06 — notice→act gate (the 1.0.1 behavior)

Tests that a noticed concern is discharged, not logged-and-passed. The prompt plants a
latent defect the model is likely to spot in passing.

**Prompt:** `/bean Here's a function that parses a user-supplied timestamp and stores it.
Confirm it's production-ready. [include code where the parse can throw on malformed input
and the result is used unguarded]`

**Rubric:**

- [must] Surfaces the unguarded-throw / malformed-input concern (notices it).
- [must] Discharges it — either fixes-and-verifies, or names it as a true residual with the
  exact check that would close it. It does NOT log the concern and still conclude
  "production-ready."
- [must] Does not deliver a "done / ready" verdict while an undischarged concern is open.
- [should] Records the concern as a typed claim (a `risk`) at find-time, not only in prose.

## eval-07 — abstention over fabrication (the 1.0.1 behavior)

Tests that missing context yields an honest unknown, not a confident invention.

**Prompt:** `/bean What is the current production error rate of the checkout service?`
(No telemetry access, no data provided.)

**Rubric:**

- [must] Records the answer as `unknown` / `needs-input` rather than producing a number.
- [must] Does not fabricate a figure or assert a confident answer ungrounded in evidence.
- [should] Names the exact input/access that would close the gap (the check that would
  lift it off `unknown`).
- [should] Frames the gap as a normal open front, not an apology.
