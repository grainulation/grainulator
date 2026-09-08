# Changelog

## 2.1.0 — trace artifacts + read-only lessons analyzer

The runtime now emits per-run evidence and reads it back into ranked failure-pattern candidates
for a human to triage. Deterministic and read-only — it surfaces patterns, it does not act on
them. No cross-task learning, no autonomous improvement, no accuracy claim.

- **`bean-lessons` — trace analyzer (read-only, deterministic).** Reads the `.bean/runs/*.json`
  trace corpus and writes a ranked lessons-candidates report to `.bean/lessons.json` (+ optional
  `--markdown`). Five candidate kinds: `recurring_residual`, `high_pivot`, `budget_exceeded`,
  `blocker_code_frequency`, `verifier_failure`. No LLM, no network. Read-only with respect to
  claims, prompts, skills, and memory — it **proposes, never applies** (this is NOT cross-task
  learning). Exit codes: `0` candidates found, `2` none/empty corpus (report still written), `3`
  invalid corpus or write failure (fail closed). Schema: `schemas/lessons.schema.json`; docs:
  `skills/bean/references/lessons.md`; fixtures: `test/fixtures/traces/`; built + shipped by
  `install.sh` and the release tarballs.

- **Trace artifact v0 (emit-only).** Every `bean-run` now writes a stable post-run record to
  `.bean/runs/<run_id>.json`: `schema_version`, `run_id`, `goal`, `started_at`/`ended_at`,
  `status`, `certificate`, `rounds`, `pivot_count`, `blockers_opened`/`blockers_closed`,
  `blocker_codes`, `verifier_verdicts`, `residuals`, `artifacts_changed`, `metadata`. One file per run (not a
  rolling file), so future tooling can analyze a corpus of runs without scraping transcripts.
  The top-level shape is **fixed** (`additionalProperties: false`); additive fields go under the
  `metadata` hatch. Emission **fails closed**: if the trace can't be written, `bean-run` exits
  with the infra error code (`3`) rather than reporting a clean run. Schema:
  `schemas/trace.schema.json`; docs: `skills/bean/references/trace.md`; conformance asserts the
  shape is stable (required keys, no unknown top-level keys). **Scope:** this does NOT make bean
  learn across tasks — no memory mutation, prompt rewriting, or cross-run optimization.

## 2.0.2 — driver "pivot, don't stop" + review hardening

Adds the "pivot, don't stop" driver discipline, then hardens it: a cross-model (Codex) review
of the change found two HIGH and two MED issues in `bean-run`'s progress accounting, all fixed
before release with regression coverage (conformance 28/28, `npm test` 24/24):

- **Pivot, don't stop.** The driver's default response to a stalled round is now a **pivot**
  (inject a change-approach directive — different front / supersede a belief / escalate / re-frame
  — and keep going), not a stop. A no-progress round only becomes a true `stuck` stop after a
  small pivot budget is spent. The few **true stops** are now explicit: converged (`ready`), a
  hard budget ceiling, and a genuine named residual — everything else is a pivot. (`bean-run`
  ALLOWED_PIVOTS; `convergence.md` "pivot, don't stop"; conformance asserts pivots precede a stuck stop.)
- **Progress is the open-front frontier, not the certificate** (review fix). The driver now
  measures round-over-round progress by the blocker set moving (a front discharged or surfaced),
  not by the certificate hash. The cert ignored blocker-internal changes (so discharging one of
  several blockers looked like no progress) and tripped on unrelated admitted-claim noise (so
  churn looked like progress) — both could mis-fire the pivot/stuck decision.
- **Round-ceiling exhaustion reads as `budget-exceeded`, not `stuck`** (review fix). Running out
  of `--max-rounds` while still making progress is the hard ceiling (exit 2), delivered with open
  fronts named; `stuck` (exit 5) is reserved for repeated pivots that moved nothing. Conformance
  adds a churning-agent case (frontier always moves, never converges → `budget-exceeded`) and a
  strengthened stuck case that asserts pivot directives actually fired before the stop.

## 2.0.1 — fix-first hardening (independent review)

A cross-model (Codex) review of the shipped 2.0 runtime found several **fail-open** bugs (the
worst kind in a gate) and conformance gaps. All fixed, with regression coverage:

- **Fail closed, not open.** The Stop hook (`bean-hook`) now BLOCKS on an active `.bean` ledger
  if `bean-check` can't run / returns no JSON / returns an unknown status (was: allow stop).
  An existing-but-invalid `run.json` or `state.json` now errors (exit 3) instead of silently
  reverting to compat / resetting temporal state.
- **A residual can't launder a failing oracle.** A claim that declares a verifier which then
  fails/staled/errored now BLOCKS regardless of a `residual` tag; residual fallback applies
  only when no verifier is declared at all.
- **`bean-verify`: a nonzero exit can't be upgraded to `pass`** by a `{"verdict":"pass"}` on
  stdout (JSON may only downgrade/explain).
- **Real freshness for directory inputs.** `inputs_hash` is now byte-based and recurses into
  declared directories (a `inputs: ["src/"]` previously collapsed to "absent", so changes were
  never detected). Identical in `bean-check` and `bean-verify`.
- **`bean-run` treats `converged-with-residuals` (exit 4) as terminal** instead of looping to
  stuck.
- **Conformance parity restored & widened.** Rust now emits the coverage warnings
  (`W_SINGLE_SOURCE`/`W_MONOCULTURE`) it had dropped; the multi-claim `claims_hash` delimiter
  now matches the reference (`\x01` line join — single-claim tests had hidden the drift). The
  differential now compares warnings, with new multi-claim temporal and residual+failing-oracle
  cases (27 conformance + driver + gate checks).
- **Polish:** certificate binds a canonical hash of each oracle spec (cmd+inputs); schemas carry
  the 2.0 fields (`verification`/`oracles`/`verified_by`); `SECURITY.md` describes the real
  execution surface (incl. `bean-run`'s `--agent` command); the release workflow smoke-tests each
  built binary before upload; the marketplace Stop hook degrades gracefully via a shim when no
  binary is present.

## 2.0.0 — Rust runtime

bean 2.0 reimplements the runtime as a **single Rust static binary** (no install dependency —
Node was itself the dependency that undercut "runs anywhere"), reconverging with the Bran core,
and **couples it to execution natively** in both Claude Code and Codex via their Stop hooks. The
JS line is preserved on the `js-reference` branch as the behavior spec; it is not shipped.

### The runtime (`rs/`, four binaries)

- **`bean-check`** — the compiler: static checks, temporal checks (state/dry-round/budget), and
  the 2.0 **oracle gate** (verification mode `compat`/`advisory`/`strict`, `verified_by`,
  recorded verdicts, `converged-with-residuals` exit 4). Certificate is byte-identical to the JS
  reference when no 2.0 field is present, and binds the full regime when the gate is active.
- **`bean-verify`** — the only execution path for oracles: runs a declared command (argv, no
  shell, claim JSON on stdin) and writes a scrubbed verdict; `bean-check` adjudicates it.
- **`bean-run`** — the driver: per round it injects the compiler signal into the agent's prompt,
  records emitted claims, and enforces linear progress (stuck detection). Model-agnostic
  `--agent` command.
- **`bean-hook`** — the native Stop hook for Claude Code and Codex (shared contract): blocks the
  agent from finishing a bean-tracked task until the loop converges; inert when no `.bean/`
  ledger exists; honors the loop guard. `--register` wires it into settings.json / hooks.json.

### Bootstrap mechanic + tests

The JS `bean-check` is the independent reference; the Rust port is held to it by a **differential
conformance oracle** (`test/conformance.mjs`): 14 differential checks (static + temporal,
certificates byte-identical) + 2 driver-smoke + 8 oracle-gate behavioral = **24/24**, run in CI
alongside the Node tests.

### Install

`./install.sh` builds the binaries and registers the native Stop hook for both clients — "install,
then it just works." Requires Rust; the shipped binary has no runtime dependency.

## 1.2.0 — 2026-06-19

The "not quite there" release. The core failure was _satisficing_: the loop under-delivered
its promised transparency and stopped to ask instead of driving, and a clean internal ledger
read as a correct answer even when the task had been misunderstood. The fix is **test the
interpretation, not the execution**, plus tighter enforcement.

Measured on the AppWorld benchmark: on a task where the baseline misread the spec — it synced
all 27 phone _contacts_ instead of the 8 phone _friends_ — the discipline took the result
**2/5 → 5/5**. A four-task cross-test shows the effect is **real but narrow**: decisive on
tasks where the baseline misinterprets, and a no-op (no regression) on the three of four where
it already read the spec correctly. Treat it as insurance against interpretation errors, not a
general per-task accuracy lift.

### Loop discipline (the validated fix)

- **Test the interpretation, not the execution** (`verify.md`): the dangerous failure is
  code that runs cleanly against the _wrong success criterion_. Probe the load-bearing
  ambiguous term against the real system; manufacture an external check at all costs rather
  than self-asserting "I verified"; if the reading can't be pinned down, it is a residual.
- **Relentlessness recalibration** (`convergence.md`): asking the human is the consult move
  of _last resort_ (a genuine blocker), not a default off-ramp — don't punt what's
  investigable. Proportion ≠ satisfice. Plus goal-persistence: re-anchor on the goal each
  round; a detour must close a blocker on the goal or be deferred, never silently become it.
- **Internal convergence ≠ correctness** (`convergence.md`): the gate certifies the ledger
  is self-consistent; it has no oracle for whether the task was understood right. Gate on an
  external signal where one exists; otherwise name the interpretation as a residual.

### bean-check enforcement

- **`E_STALE_DEPENDENT`** — a claim with `depends_on: [...]` blocks if any dependency is
  superseded/inactive (mechanical belief-revision propagation; truth-maintenance).
- **`residual` requires a reason** — tagging a front `residual` discharges it only when the
  claim states _why_ it's unreachable; a reasonless residual is a silent punt and still blocks.
- New `depends_on` field in the claim schema; three new behavioral fixtures (24 checks total).

### Deferred

- Saturation / state-v2 and the agent-authored round trace — Codex flagged these as the
  riskiest to mechanize and they are not what produced the win; slated for a later release.

## 1.1.2 — 2026-06-15

A robustness pass on `bean-check` from an independent cross-model (Codex) review that
re-ran against 1.1.1.

### Fixed

- **A partial `run.json` could silently disable the evidence gate** — a `run.json` with
  only `evidence_bar.load_bearing` clobbered the default `recommendation` tier, making it
  `undefined` so below-bar claims passed as ready. `run.json` is now deep-merged and its
  tiers validated (an invalid/missing tier falls back to the default).
- **Malformed claims no longer crash the compiler** — a `null` entry or a non-array
  `conflicts_with` raised a raw `TypeError`; such claims are now recorded as `E_SCHEMA`
  and excluded.
- **The certificate is JSON-encoded** over status + each admitted claim's `(id, evidence,
content)`, so ids/values can't collide via delimiters.
- **Dry-round tracks content, not just ids** — an in-place revision (same id, new content)
  correctly counts as progress and increments the round.
- **`budget-exceeded` now takes precedence over `blocked`** (CLI contract: exit 2 = stop),
  with the blockers still reported. `--dir` with no value exits 3 instead of a stack trace.

### Verified

- The three 1.1.1 fixes (symmetric conflict pairing, valid-resolver discharge, content
  certificate) were independently re-confirmed correct by the same review.

## 1.1.1 — 2026-06-15

Hardens `bean-check` and its docs after a blindspot + independent cross-model review.

### Fixed

- **Conflict detection was unsound** — a one-directional `conflicts_with` link from the
  higher-lexical-id side was silently dropped (the gate exited "ready" on a real conflict).
  Pairing is now symmetric: a link from either side registers the conflict.
- **A risk or conflict could discharge itself** — a `resolved_by` pointing at a dangling or
  self id cleared the gate. It now discharges only when it references a real, active,
  _different_ claim.
- **The certificate now covers status + claim content**, not just the id set, so two
  different ledgers no longer collide on one certificate.
- `--dir` with no value exits cleanly (3) instead of a raw stack trace; duplicate ids raise
  `E_DUP_ID`; empty / over-budget ledgers are noted.

### Added / Changed

- New **`references/bean-check.md`** — the operating guide for the default compiler: the
  `.bean/` file layout, the claim shape, a worked example, and the blocker-code → next-move
  table. Linked from SKILL.md and runtime.md.
- Regression fixtures + tests for the asymmetric-conflict and self-discharge cases.
- Docs: scrubbed "confidence" (a wheat-only signal) from the default-compiler descriptions;
  reframed grainulator as the optional richer backend; documented that bean-check detects
  only `conflicts_with`-linked conflicts.

## 1.1.0 — 2026-06-15

Adds **bean-check** — bean's own convergence compiler — so convergence is a thing that can
_fail_, not just a discipline you are trusted to follow.

### Added

- **`bin/bean-check.js`** — a zero-dependency, type-checked (`// @ts-check` + JSDoc) Node
  CLI built from the Bran-IR core. Reads `.bean/claims.json` (+ optional `.bean/run.json`)
  and exits nonzero until the loop converges: `0` ready, `1` blocked, `2` budget-exceeded.
- **Hard gates** (where a single-snapshot compiler only warns): undischarged risks
  (notice→act), load-bearing claims below the evidence bar, and load-bearing abstentions all
  BLOCK; plus temporal checks — dry-round, budget, and rejected-claim reappearance.
- **Conflict resolution = evidence-driven belief revision, fail-closed.** A conflict always
  blocks; when one side strictly out-evidences the other, bean-check emits a belief-revision
  _hint_ (supersede the weaker) but never edits the ledger — the agent records the auditable
  supersede. No Schulze: bean has no voters, and Fable revises beliefs rather than holding
  elections (the Bran paper itself proves Schulze is correctness-neutral).
- **Deterministic certificate** (`sha256` over sorted admitted-claim ids), ported from Bran.
- `schemas/` (claim / run / result), curated `test/fixtures/`, and `test/bean-check.test.js`
  (11 behavioral checks). `tsc --noEmit` typechecks the JS via JSDoc; CI runs it.

### Changed

- bean-check is now the **default control plane**; grainulator/wheat is an optional richer
  backend. Docs updated to match.
- Abstention is a **tag** (`needs-input` / `unknown`) on a normal claim, not a status —
  fixes a 1.0.1 doc bug where the named status would be rejected by the runtime.
- Added an **assess-vs-mutate** boundary to the skill, and an MCP `compile` parse-`status`
  caveat (the `--check` nonzero exit is CLI-only).

## 1.0.1 — 2026-06-15

Sharpens the loop with lessons drawn from documented model behavior on agentic and
self-correction tasks. No structural changes — all refinements to existing references.

- **Notice→act gate** — the dominant failure isn't missing a problem, it's noticing one and
  proceeding anyway. A concern is now recorded at find-time and **blocks convergence** until
  it's a confirmed non-issue, a verified fix, or a named true residual. Recording is not
  resolving. (`convergence.md`, `self-critique.md`, `SKILL.md`)
- **Abstention is first-class** — an honest `unknown` / `needs-input` is a valid claim state,
  scored as cheaper than a confident wrong answer; fabricating under missing context is the
  failure to avoid. (`verify.md`, `runtime.md`)
- **Corroborate across independent methods** — verification signals correlate less than they
  seem; a load-bearing claim earns a high tier from methods that fail independently, not one
  check run twice. (`verify.md`)
- **Effort is a budget to allocate** — pour high effort and fan-out on the one or two most
  decisive fronts; single-pass the rest. (`convergence.md`)
- **Persistent context beats respawn** — prefer a long-lived loop over the shared ledger to a
  blocking orchestrator that re-hydrates context per step. (`delegate.md`, `runtime.md`)
- **Realism reduces gaming** — brief delegated work as the real task, not as a check to pass;
  grade the final artifact, not the reasoning narration. (`delegate.md`, `codex-blindspot.md`)
- **Tool/subagent output is untrusted input** — treat retrieved content and worker reports as
  claims to verify, never as instructions; quarantine injected directives. Ground before the
  first run of any side-effecting command. (`verify.md`)

## 1.0.0 — 2026-06-15

Initial release. **bean** runs a task as a recursive convergence loop, modeled on how the
Fable model actually worked — adaptive, belief-revising self-correction — rather than a
fixed checklist.

### Core

- Convergence loop on a runtime (claim ledger + compiler): Frame → Survey → Investigate →
  Record → Compile → Revise beliefs → Converged? Repeat until it converges.
- **Runtime interface** — grainulator/wheat is the primary runtime; a minimal built-in
  ledger (`bean-stalk.md`) with hand-checked convergence is the fallback for Codex / bare
  installs.
- **Belief revision** is first-class, including revising the _user's_ stated beliefs when
  grounded evidence contradicts them (counter-sycophancy).
- **Grounding-first** — read the source / run the tool / query the system before asserting.
- **Verify by running or rendering** the artifact, never by re-reading it.
- **Never stop at caveats** — drive every open front to a confirmed non-issue, a verified
  fix, or a true residual that genuinely can't be reached.
- **Cross-model Codex blindspot** lane for independent verification on high-stakes work.
- Verbose by default; continuous subagent/connector orchestration each round.

### Packaging

- Dual plugin: Claude Code (`.claude-plugin/`) and Codex (`.codex-plugin/`), plus an
  `install.sh` fallback. `/bean` in both runtimes.
- Modular references under `skills/bean/references/`; smoke test validates manifests,
  frontmatter, and internal link resolution.
