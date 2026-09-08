# Positioning

## What bean is

A **portable convergence gate** for agent work. bean rides inside an agent loop and decides one
thing well: _is this task actually done?_ It tracks the agent's findings as a typed claim ledger,
compiles that ledger to score convergence (unresolved conflicts, coverage gaps, weak evidence,
undischarged risks), and — installed as a runtime — blocks the agent from finishing through a
native Stop hook until the work is **verified, fixed, or honestly marked as a residual**.

The unit of truth is the **claim ledger**, not a test suite or a rubric. The gate's job is to keep
a loop from declaring success while its evidence is contradictory, thin, or unverified.

## The layer boundary

bean is one layer in an agent stack and deliberately stays small:

| Layer                                                 | Owner                                   |
| ----------------------------------------------------- | --------------------------------------- |
| Agents, tools, sandboxes, channels, durable execution | agent frameworks (Eve, Flue, LangGraph) |
| **Task-level convergence contract — "is it done?"**   | **bean**                                |
| The model's reasoning and judgment                    | the model                               |

bean **complements** agent frameworks; it does not compete with them. You run bean _inside_ a
framework's loop as the verification/convergence step.

## What bean is not

- **Not an agent framework.** It has no opinion on how you build, deploy, or connect agents.
- **Not an eval platform.** It scores the _epistemic state of one run_, not a behavioral test suite.
- **Not a broad accuracy booster.** It doesn't make a model smarter. It reduces _silent false
  completion_ — the failure where an agent is confidently wrong and stops anyway.

## The differentiator

Most "loop until done" mechanisms stop when **the model says it's done** or when **an LLM judges
the output**. bean stops when **scored evidence has converged** — an _independent, deterministic
arbiter_ the agent can't talk past. Deterministic checks aren't unique on their own; the
combination is: a typed claim ledger + belief revision + a hard-exit-by-default gate + an external
oracle path, all host-agnostic with no required network or platform.

## Two modes

- **Plugin-only (advisory).** The `/bean` skill provides the loop as guidance. No enforcement.
- **Installed runtime (enforced).** The static binaries + native Stop hook make `bean-check` a hard
  gate. This is the only mode with a real stop condition.

State this explicitly at the top of a run, so the guarantee is never overstated.

## Integration points

- **Claude Code / Codex** — native Stop hook (shipping).
- **LangGraph / Eve / Flue** — `bean-check` / `bean-verify` as a verification node or middleware
  that blocks the final response until the ledger converges (planned).
- **CI** — gate convergence artifacts before merge (planned).

## Claims we stand behind

bean is honest about what it can and can't show:

1. It maintains a typed, auditable claim ledger with belief revision across a run.
2. Its compiler is a deterministic, reproducible convergence gate that exits nonzero until met.
3. On false-convergence-prone tasks, an external oracle gate can convert confidently-wrong
   completions into verified, fixed, or honestly-blocked outcomes — _conditional evidence on small
   samples, not a general accuracy claim._

What we do **not** claim: that bean improves model accuracy in general, or that it replaces an
agent framework.
