# Reference: bean-lessons (trace analyzer v0)

`bean-lessons` is the first consumer of the [trace artifact](trace.md). It reads the accumulated
`.bean/runs/*.json` corpus and writes a ranked **lessons-candidates** report. It proposes; it
never applies.

> **Scope (read this).** Read-only with respect to claims, prompts, skills, and memory.
> Deterministic — no LLM, no network. This is NOT cross-task learning: it surfaces patterns for a
> human (or a later, separate step) to triage. The moment anything here edits a skill/prompt/
> memory, it has left this tool.

## Use

```
bean-lessons --dir <project> [--markdown]
```

- Reads `<project>/.bean/runs/*.json` (must be `schema_version: "trace/v0"`).
- Writes `<project>/.bean/lessons.json` (always on success), and `lessons.md` with `--markdown`.
- Exit codes: `0` report written with ≥1 candidate; `2` no runs / no candidates above threshold
  (still writes a report with `candidates: []`); `3` invalid trace corpus or write failure
  (fail closed — never emit a partial report as success).

## Candidate kinds + thresholds

| kind                     | from trace                             | threshold         | signal                   |
| ------------------------ | -------------------------------------- | ----------------- | ------------------------ |
| `recurring_residual`     | `residuals[].reason` (normalized)      | ≥ 2 runs          | representative reason    |
| `high_pivot`             | `pivot_count`                          | `pivot_count ≥ 2` | `"pivot_count >= 2"`     |
| `budget_exceeded`        | `status == "budget-exceeded"`          | ≥ 1 run           | `"budget-exceeded"`      |
| `blocker_code_frequency` | `blocker_codes[]`                      | none (ranked)     | the blocker code (`E_*`) |
| `verifier_failure`       | `verifier_verdicts[]` (verdict ≠ pass) | ≥ 1 run           | `"<verifier> failed"`    |

`count` is always the number of **distinct runs** the candidate covers. Residual reasons are
grouped by a normalized key (trim, collapse whitespace, lowercase); the `signal` is the original
reason text from the smallest `run_id` in the group.

## Determinism

Candidates are sorted by `count` desc → `kind` asc → `signal` asc; `rank` is the 1-based index.
`evidence` within a candidate is sorted by `run_id`. The only non-deterministic field is
`generated_at` (a timestamp) — exclude it when comparing two reports for stability.

Schema: [`schemas/lessons.schema.json`](../../../schemas/lessons.schema.json)
(`schema_version: "bean.lessons.v0"`, `additionalProperties: false`).

## Output shape

```json
{
	"schema_version": "bean.lessons.v0",
	"generated_at": 1782017126557,
	"source_run_count": 18,
	"candidates": [
		{
			"kind": "blocker_code_frequency",
			"rank": 1,
			"count": 9,
			"signal": "E_UNVERIFIED_LOADBEARING",
			"evidence": [{ "run_id": "run-...", "status": "stuck" }]
		}
	]
}
```

## What it is not

It does not edit prompts, skills, memory, or claims. Turning these candidates into harness
changes is the cross-task learning step — a separate, later decision, deliberately out of scope.
