# Reference: operating bean-check (the default compiler)

`bean-check` is bean's bundled, zero-dependency convergence compiler. It is how the loop
gets a **gate that can fail** without grainulator — it reads a claim ledger you maintain
and exits nonzero until the loop has honestly converged. This reference is the operating
manual: the files, the claim shape, and what to do for each thing it blocks on.

## The files (`.bean/`)

| File                | Who writes it       | What it is                                                             |
| ------------------- | ------------------- | ---------------------------------------------------------------------- |
| `.bean/claims.json` | **you (the agent)** | the ledger — an array of typed claims (or `{ "claims": [...] }`)       |
| `.bean/run.json`    | you (optional)      | the run contract — evidence bar, budget, mutation policy               |
| `.bean/state.json`  | bean-check          | loop-state for the temporal checks; never edit it, and don't commit it |

## A claim

```json
{
	"id": "c3",
	"type": "factual",
	"topic": "schema",
	"content": "orders.user_id is NOT NULL in production",
	"evidence": "tested",
	"source": { "origin": "psql \\d orders" },
	"status": "active",
	"conflicts_with": ["c2"],
	"resolved_by": null,
	"tags": ["load-bearing"]
}
```

- `type`: `constraint | factual | estimate | risk | recommendation | feedback`
- `evidence`: `stated < web < documented < tested < production`
- `tags`: conventions bean-check reads — `load-bearing`, `needs-input` / `unknown`
  (abstention), `confirmed-non-issue` / `residual` (needs a stated reason) / `accepted`
  (risk dispositions). Also `depends_on: [ids]` — bean-check blocks the claim stale
  (`E_STALE_DEPENDENT`) if any id is superseded/inactive or self.
- To **revise a belief**: set the loser's `status` to `superseded` and point a new claim's
  `resolved_by` at the real resolving claim. To **flag a contradiction**: add the other
  id to `conflicts_with` (a link from _either_ side is enough).

## Running it

```bash
node bin/bean-check.js --dir .            # human summary
node bin/bean-check.js --dir . --json     # machine-readable result
# exit: 0 = ready (converged), 1 = blocked, 2 = budget-exceeded, 3 = load error
```

Run it at the **Compile** step every round. Convergence is `status: "ready"` (exit 0) —
not "looks right". Pass `--no-state` for a stateless, idempotent check (skips dry-round /
budget / reappearance); that is also how it is differentially compared against wheat.

## Blocker code → next move

| Blocker                 | Means                                                    | Do                                                                                                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E_CONFLICT`            | two active claims disagree                               | resolve it: supersede the weaker (a `resolvable` hint names which), or if a genuine tie, get more evidence / ask. **Verify "better-grounded", not just higher-tier.**                                                                                                        |
| `E_OPEN_RISK`           | an active `risk` is undischarged                         | discharge it: fix-and-verify and link `resolved_by`, or tag it `residual` **with a stated reason** (why it's unreachable) / `confirmed-non-issue` / `accepted`. A reasonless `residual` is a silent punt and does not discharge. Recording the risk is **not** resolving it. |
| `E_WEAK_LOADBEARING`    | a load-bearing claim is below the evidence bar           | go get stronger evidence (raise its tier), or find it's false                                                                                                                                                                                                                |
| `E_OPEN_UNKNOWN`        | a load-bearing claim is tagged `needs-input` / `unknown` | get the missing input, or re-scope so it isn't load-bearing, or name it a true residual                                                                                                                                                                                      |
| `E_STALE_DEPENDENT`     | a claim `depends_on` a superseded/inactive (or itself)   | a revised support must reopen its dependents: re-derive/re-verify the dependent, then re-point `depends_on` or supersede it                                                                                                                                                  |
| `E_SCHEMA` / `E_DUP_ID` | a malformed or duplicate-id claim                        | fix the row                                                                                                                                                                                                                                                                  |

Warnings (`W_SINGLE_SOURCE`, `W_MONOCULTURE`, `W_REAPPEAR`) don't block but flag fronts
worth driving. Notes (`DRY_ROUND_*`, `OVER_BUDGET`, `EMPTY_LEDGER`) report loop state.

## The certificate

Each result carries a `certificate` — a short hash over the converged status and each
admitted claim's `(id, evidence, content)`, JSON-encoded so values can't collide via
delimiters. The same converged ledger reproduces the same certificate; any difference in
status or in an admitted claim's id/evidence/content changes it. It is the artifact that
says _whether_ you converged.

## Scope, stated honestly

bean-check detects conflicts you have **linked** with `conflicts_with`; it does not infer
semantic contradiction (that is the agent's job — notice it, record the link). It resolves
nothing on its own: it blocks and hints; you do the auditable belief revision. When you are
on bean-check rather than wheat, say so — wheat adds numeric confidence and richer analysis.
