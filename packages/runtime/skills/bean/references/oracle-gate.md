# Reference: the oracle gate (bean 2.0)

bean 1.x converges when the ledger is **internally consistent**. That is necessary but not
sufficient: a ledger can converge cleanly on a _wrong interpretation of the task_ — a green
compile is not a correct answer. bean 2.0 adds an **external-verifier gate**: a load-bearing
claim can be required to carry a real verifier's signal, not just a self-asserted tier.

**What the gate gives you, precisely:** _auditable_ verification — what was checked, by what,
and what was punted is recorded and folded into the certificate, so over-trust and
answer-key leakage become **detectable**. It does **not** prove correctness, and it is
**not** "leakage-safe": a verifier that encodes the same misreading as you passes a wrong
claim with an external badge. Use it where a real check is _derivable from the spec and the
environment_; where none is, name an honest residual.

## Modes (`run.json` → `verification.mode`)

| Mode       | Behavior                                                                      |
| ---------- | ----------------------------------------------------------------------------- |
| `compat`   | **Default.** Identical to 1.x — the gate is off, certificates are unchanged.  |
| `advisory` | Unverified load-bearing claims raise `W_UNVERIFIED` warnings; nothing blocks. |
| `strict`   | A load-bearing claim converges only if **verified** or a **named residual**.  |

Proportionality is preserved: in `compat` (the default) 2.0 stays out of the way entirely.
Reach for `strict` on a task that earns it.

## A verifier is a command, not a package

Declare oracles up front in `run.json` (a capability model — a claim may only gate on a
registered oracle):

```json
{
	"verification": { "mode": "strict" },
	"oracles": {
		"unit": {
			"cmd": ["npm", "test"],
			"inputs": ["src/", "test/"],
			"trust": "dev_oracle"
		}
	}
}
```

A claim points at one:

```json
{
	"id": "c7",
	"type": "factual",
	"topic": "auth",
	"content": "login rejects an expired token",
	"evidence": "tested",
	"tags": ["load-bearing"],
	"verified_by": { "verifier": "unit" }
}
```

`bean-check` is a **pure adjudicator** — it reads recorded verdicts and never runs anything.
Execution lives in **`bean-verify`**, the only path that runs an oracle:

```bash
bean-verify --dir . --claim c7 --verifier unit   # runs the command, records a scrubbed verdict
bean-check  --dir .                               # reads the verdict; gates on it
```

`bean-verify` runs the command (`argv`, `shell:false`, claim JSON on stdin: exit 0 = pass,
nonzero = fail, spawn error/timeout = error), then writes a **scrubbed, committed** verdict
to `.bean/verdicts/<claim>.<verifier>.json` (hashes + verdict only — no raw output, no paths)
and a **local, gitignored** diagnostic to `.bean/verdicts-raw/`. Add `.bean/verdicts-raw/`
to your `.gitignore`.

## Convergence and exit codes

- **ready (exit 0)** — every load-bearing claim is externally verified.
- **converged-with-residuals (exit 4)** — no blockers, but some load-bearing claims rest on
  named residuals rather than verification. Converged, but **not clean** — review warranted.
- **blocked (exit 1)** / **budget-exceeded (exit 2)** / **usage error (exit 3)** — unchanged.

## Blocker codes (strict mode)

| Code                       | Means                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| `E_UNVERIFIED_LOADBEARING` | load-bearing claim with no verifier and no named residual         |
| `E_ORACLE_FAILED`          | the recorded verdict is `fail`                                    |
| `E_ORACLE_STALE`           | the claim changed (or the oracle was re-pinned) after the verdict |
| `E_ORACLE_UNDECLARED`      | `verified_by` names an oracle not in the `run.json` registry      |
| `E_VERIFY_ERROR`           | no recorded verdict, or the oracle errored                        |

Warnings: `W_ORACLE_SINGLE` (every verified claim leans on one oracle — corroborate),
`W_SEALED_UNENFORCED` (a sealed-output policy is declared but `bean-check` cannot observe
file reads — it is an attestation, not an enforcement).

## Determinism

A verdict is recorded once and **replayed**, never re-run by `bean-check` — so a converged
ledger reproduces its certificate offline. A verdict is **stale** (blocks) when the claim's
content hash no longer matches the verdict's `claim_binding`, or a pinned `oracle_digest`
changed. The certificate binds the full regime (mode, load-bearing set, residual set, oracle
registry, verdicts), so two different verification regimes can never share a certificate; a
plain 1.x ledger's certificate is unchanged.

## Writing an oracle that doesn't over-trust

An oracle is only as good as its design, and the easy design is the one that over-trusts.
A self-authored oracle that checks "did I do what I _think_ the task asked," against the
state it just acted in, is a tautology — it re-encodes the solver's own reading and passes
its own mistakes. Three rules, each from a real failure where a naive oracle blessed a
wrong answer:

1. **Read the persisted/committed state, not the in-session belief.** Verify against the
   same state the consumer of the work will see (re-read from disk / a fresh query / the
   committed transition log) — never "I saw it succeed a moment ago." A run that succeeded
   in-session but did not persist must FAIL. (`bean-verify` already runs the oracle as a
   separate process, so favour reading durable state inside it over passing live values.)
2. **Check the post-conditions _implied by the task verbs_, not just the constraints you
   extracted.** "Move X to Y" implies _X is now in Y AND X is no longer in its old place_;
   "buy everything on the list" implies _an order exists AND the list no longer holds those
   items_. Check the **deltas/transitions** the verb requires, not only a snapshot of the
   properties you happened to think mattered.
3. **Try to falsify, don't confirm.** Enumerate the competing readings of each load-bearing
   term; if the output is not robust across them and the environment cannot disambiguate,
   that is a residual (name it) — not a pass on your preferred reading.

Rules 1–2 are mechanically demonstrable: an oracle that re-reads committed state and checks
the verb's implied transition catches errors a snapshot-of-my-own-reading oracle passes.
Rule 3 is the irreducible part — where no signal in spec or environment can settle a
reading (a pure convention), the honest output is a residual, and over-trust there is real.

## Honest limits

- **Over-trust is the central limit**, not a footnote: a verifier testing the wrong thing
  certifies a wrong claim. Design the oracle independently; document what it does and doesn't
  cover.
- **Legitimacy is normative.** `bean-check` enforces "registered, fresh, passed"; it cannot
  _prove_ an oracle is answer-key-free (`trust` is declared, not verified). Sealed-read and
  answer-key classification are harness/normative concerns — labeled, never guaranteed.
