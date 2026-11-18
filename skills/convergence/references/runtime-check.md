# Operating the native convergence checker

Use `grainulator runtime check --dir <workspace> --json` after explicitly installing the matching verified native asset. It reads `.grainulator/runtime/claims.json` and `run.json`, adjudicates recorded evidence and updates temporal state. `--no-state` is the non-mutating inspection mode. It never runs an oracle. Missing assets are a reported prerequisite, with no JS/PATH/manual fallback.

Author through `grainulator runtime claim add|update|supersede`; preserve history and use the inspected ledger hash for conditional updates. Do not write `claims.json` or reset `state.json` directly. Initial run configuration is reviewed through `runtime init --run '<JSON-object>'` or the exact project's `runtime` config section; configuration changes do not execute verifiers.

A claim has an explicit ID, type, topic, content, evidence tier, status and provenance. Load-bearing claims can bind a registered oracle through `verified_by.verifier`; dependencies and conflict IDs refer to existing claims. Evidence labels are assertions. Strict verification additionally requires a fresh recorded verdict bound to claim content, exact oracle argv and declared input bytes.

Treat conflicts, stale premises, open risks, weak load-bearing evidence and unresolved unknowns as directions to investigate. Correct or supersede a false claim with a reason. Record a residual only when concrete access, scope or constraints prevent resolution; do not erase it or promote a tier to silence the checker. Preserve round/budget counters and unknown side effects.

Native check exits 0 ready, 1 blocked, 2 budget exceeded, 3 load/runtime error, or 4 converged with residuals. Root `grainulator run`, native driver, oracle verifier and Stop hook have different protocols; use their help and the root runtime guide rather than normalizing all nonzero statuses.

See [runtime operations](runtime.md), [oracle discipline](oracle-gate.md) and [the root runtime guide](../../../docs/RUNTIME.md).
