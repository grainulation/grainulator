# Reference: runtime

bean's loop runs against a **runtime** — the thing that stores what bean has learned and
tells it whether it has converged. The loop is written against an interface, so it works
on any runtime that provides two capabilities:

## The runtime interface

A bean runtime provides:

1. **A claim ledger** — durable, typed memory of what bean has learned.

   - `add(claim)` — record a typed claim: `factual | constraint | risk | recommendation | estimate`, at an evidence tier `stated < web < documented < tested < production`, with a topic and source.
   - `supersede(old, new)` / `resolve(conflict)` — overturn a prior claim and record why (belief revision).
   - Abstention is recorded as a **tag** (`needs-input` / `unknown`) on an ordinary claim —
     an explicit, valid "not answerable yet" instead of a fabricated answer (see
     [verify.md](verify.md)). It is a _tag, not a status_: the claim keeps a normal type
     and tier, and the compiler treats an abstention on a load-bearing front as an open
     front, not a pass. (Don't invent a new status value — a runtime's status set won't
     accept it.)
   - The ledger persists across rounds and sessions. It is bean's "own notes" — the
     mechanism behind iterative self-improvement, and the reason bean prefers a long-lived
     loop over respawning fresh context per step (see [delegate.md](delegate.md)).

2. **A compiler** — scores the ledger and returns a **convergence signal**:

   - unresolved **conflicts** between claims,
   - **coverage gaps** (topics with no claims, or only one claim type),
   - **single-source / echo-chamber** topics,
   - **weak-evidence** topics, and load-bearing claims below the evidence bar,
   - **undischarged risks** and temporal checks (dry-round, budget).

   (`bean-check` produces the above; wheat additionally returns a numeric **confidence**.)

   The compiler is the failable check at the whole-task level. bean does not decide it is
   done; the compiler's signal does.

bean reads the compiler signal to choose its next move (step 2 of the loop) and to decide
convergence (step 6). Everything else — investigation, delegation, judgment — is the
model's.

## Default: bean-check (bundled, zero-dependency)

bean ships its own compiler, `bin/bean-check.js` — a zero-dependency Node CLI built from
the Bran-IR core. It is the **default** control plane and runs anywhere Node does (Codex,
bare installs, CI), with no grainulator required. The agent maintains the ledger as
`.bean/claims.json` (Bran-IR claims) plus an optional `.bean/run.json` contract (evidence
bar, budget, mutation policy); `bean-check` scores convergence and **exits nonzero when it
is not reached**:

```
node bin/bean-check.js --dir <path>     # 0 = ready, 1 = blocked, 2 = budget-exceeded
```

It hard-blocks on: unresolved conflicts, undischarged risks (notice→act; a `residual`
discharges only with a stated reason), load-bearing claims below the evidence bar,
load-bearing abstentions, and **stale dependents** (a claim whose `depends_on` points at a
superseded/inactive claim); it also tracks the temporal
checks a single-snapshot compiler can't — dry-round, budget, and rejected-claim
reappearance — via a small `.bean/state.json`. On a conflict where one side strictly
out-evidences the other it emits a belief-revision **hint** (supersede the weaker) but
still blocks until the agent records the supersede — it never edits the ledger itself.

It detects conflicts via explicit **`conflicts_with`** links (it does not infer semantic
contradiction) — so when you notice two claims disagree, _record the link_; bean-check then
blocks until one side is superseded or carries a valid `resolved_by`. A `resolved_by` only
discharges a risk or clears a conflict when it points at a real, active, _different_ claim
(a dangling or self-reference does not). See [bean-check.md](bean-check.md) for the file
format and the blocker-code → next-move table.

## Richer backend: grainulator / wheat (optional)

When grainulator/wheat is present (a `claims.json`, the `wheat` MCP server, or the `wheat`
CLI), it is a richer backend — the same claim model, plus numeric confidence and more
analysis. See [grainulation.md](grainulation.md) for the tools. Two cautions:

- **Use the gate flag.** `wheat compile` exits 0 even when blocked; only
  `wheat compile --check` (or `--gate` / `--quiet`) returns a nonzero red exit.
- **MCP returns text, not an exit code.** Over the `wheat` MCP server, `compile` returns a
  result whose `status` you must read — there are no `--check` exit semantics there. Parse
  `status`; don't trust that the call merely succeeded.

bean-check and wheat agree on the shared static checks (conflict detection, the converged/
blocked baseline); bean-check adds the stricter gates and the temporal checks.

## Last resort: hand-checked `bean-stalk.md`

Where you genuinely cannot run the compiler (a pure-prose context, no Node), keep a
`bean-stalk.md` table and run the checks by hand each round:

```
| id  | type        | topic        | evidence   | status   | conflicts | claim                          |
| --- | ----------- | ------------ | ---------- | -------- | --------- | ------------------------------ |
| c1  | constraint  | scope        | stated     | active   |           | must support zero downtime     |
| c2  | factual     | schema       | documented | active   |           | orders.user_id is nullable     |
| c3  | factual     | schema       | tested     | supersedes c2 | resolves c2 | user_id is NOT NULL in prod |
```

- **Conflicts:** any two active claims on the same (topic, subject) that disagree and
  aren't linked by `supersedes`/`resolves`.
- **Coverage gaps:** load-bearing topics with no claim, or only one claim type.
- **Single-source:** a topic whose claims all came from one source.
- **Weak evidence:** a load-bearing claim with nothing above `web`.
- **New-this-round:** did this round add or change any claim?

This hand path has the weakest guarantee — no automation, no certificate. Say so in
verbose output when you're on it.

## Degradation, stated honestly

Always name which control plane you're on — "bean-check (zero-dep compiler)", "wheat
(richer backend)", or "hand-checked bean-stalk" — so the user knows how strong the
stop-condition actually is.
