---
name: convergence
description: Carry a substantial task through evidence-driven investigation, corrections and explicit verification. Use only when the user requests this workflow or the host permits its invocation; on Codex invoke explicitly with /convergence.
---

# Grainulator convergence

Investigate the most decisive open question, record what was learned, check it, and revise conclusions when evidence overturns them. The procedure organizes work; it does not improve a model's underlying capabilities or certify semantic truth.

Use the root Grainulator CLI installation and an explicit workspace. Choose the ledger contract before starting: an evidence sprint uses `grainulator init`, `add`, `compile` and `status`; native execution uses `grainulator runtime` with an explicitly installed, verified native asset and enrolled workspace. These ledgers are distinct and must never be merged or edited through the other API. A missing native asset is an explicit prerequisite, not a reason to fall back to another checker, PATH executable or handwritten gate.

1. Frame the user's question, constraints and observable completion criteria. Stay within the authorized task; an assessment request does not authorize implementation.
2. Inspect the current compiler/checker signal and investigate the finding most likely to change the outcome. Use available sources and tools; delegate only when authorized by the user or active instructions.
3. Record evidence using typed claim operations. Preserve provenance and quotes; an evidence-tier label is a recorded assertion, not proof that a test ran.
4. For evidence, use `grainulator compile --dir <sprint>` and inspect `grainulator status --json`. For native execution, use `grainulator runtime claim` for typed authoring, `verify` for explicit registered oracles and `check` to adjudicate recorded evidence. `check --no-state` does not update temporal state. Neither compiler invokes verifiers automatically.
5. Correct or supersede overturned premises with a reason. Recheck dependent claims and observed code after edits; a fresh artifact can still have unsound conclusions.
6. Continue until each material concern is fixed and verified, confirmed as a nonissue, or recorded as a concrete residual requiring unavailable access or a user decision. Respect budgets and preserve unknown command effects; never replay a command merely because a trace is missing.

The native `run` driver has its own budgets, oracle records and status codes. Root `grainulator run` is the separate JS command-adapter loop. Keep their exit semantics and trace schemas separate. A Stop hook's exit zero can carry a JSON denial; read the hook protocol rather than treating zero as unconditional permission.

Report what changed, exact meaningful verification outcomes, and remaining limits. Distinguish installed CLI/MCP checks from actual host plugin discovery. Present compiler next actions as **Auto** and **Manual** lists; Auto is already authorized work to continue, Manual needs the user's decision, action or access. Do not invent work to fill either list.

See [runtime operations](references/runtime.md), [verification discipline](references/verify.md), [belief revision](references/belief-revision.md), [convergence criteria](references/convergence.md) and [self-review](references/self-critique.md). Grainulator owns neither host permissions nor remote destination authorization.
