# Model evaluation pilot — September 7, 2026

The live pilot shows a narrow output-format benefit for Fable. It does **not** establish a general reasoning improvement over current models.

Four versioned synthetic tasks cover supplier eligibility, authoritative-policy selection, event accounting, and insufficient evidence. Deterministic independent checks score requested JSON and exact values. Each model/task has one paired trial. The baseline answers and self-reviews; Grainulator runs the verifier/feedback loop with the same two-call ceiling and stops on success. Arm order alternates by task. Neither arm has external tools.

| Host/model | Baseline contract passes | Grainulator contract passes | Baseline / Grainulator calls | Total elapsed seconds |
| --- | ---: | ---: | ---: | ---: |
| Codex / gpt-6-astra | 4/4 | 4/4 | 8 / 4 | 52.430 / 26.297 |
| Claude / claude-fable-5 | 2/4 | 4/4 | 8 / 7 | 53.901 / 44.152 |

Fable's failed baseline outputs contained correct JSON values surrounded by prose. A separately labeled **post-hoc semantic diagnostic**, tolerating prose, scores both models 4/4 in both arms. Preserved first baseline candidates score Astra 4/4 and Fable 2/4 on format, both 4/4 on semantics. Those are diagnostics from existing outputs, not new trials; primary scoring remains unchanged.

Equal call ceilings do not mean equal tokens or latency. Astra consumed 106,099 / 53,002 input tokens and 260 / 150 output tokens in baseline / Grainulator. Fable consumed 31,164 / 26,899 input tokens and 1,701 / 1,023 output tokens. Claude reported API-equivalent costs of $0.349597 / $0.290277; these are not subscription charges. Codex subscription dollar cost was unavailable. Host prompts and token accounting differ, so cross-host efficiency comparisons are unsupported. Early stopping explains the Astra reduction against a two-call baseline; it does not establish better latency than one-shot Astra.

Reproduce the live pilot from the full source checkout with its development dependencies and authenticated hosts (consumes model usage). Evaluation scripts and cases are not included in the installed archive:

```sh
node scripts/evaluate-models.mjs
node scripts/evaluation-diagnostics.mjs
```

Tasks/scorer: `evals/tasks.mjs`; adapter: `evals/cli-adapter.mjs`; verifier: `evals/verifier.mjs`. Evidence: `.dogfood/model-evaluation.json`, `.dogfood/evaluation-diagnostics.json`, and private per-call logs at the report's directory. No credentials are included in exports.

Before a broader quality claim, use repeated held-out tasks with semantic failures, a one-shot baseline, separate format/semantic scores, and measured consumed-token budgets. This pilot is too small and synthetic for statistical or product-wide claims.


## Held-out semantic evaluation v2

A second frozen suite used 12 new synthetic cases across six rule families, with two repetitions per case and model (24 paired trials per model). It compared an independent one-shot response with the actual Grainulator runner and independent verifier, capped at two model calls. Case and arm order were fixed before execution; expected answers never entered model prompts. Format and semantic correctness were scored separately from the start.

| Host/model | One-shot semantics | Grainulator semantics | One-shot strict JSON | Grainulator strict JSON | Calls, one-shot / Grainulator |
| --- | ---: | ---: | ---: | ---: | ---: |
| Codex / gpt-6-astra | 24/24 | 24/24 | 24/24 | 24/24 | 24 / 24 |
| Claude / Fable | 24/24 | 23/24 | 0/24 | 19/24 | 24 / 48 |

These results do **not** support a general answer-quality or efficiency improvement. Astra tied on accuracy with slightly greater elapsed time under Grainulator. Fable's formatting improved, but one Grainulator candidate reversed a required ordering after a repair attempt. The verifier rejected that candidate and the run exhausted its budget; it was never reported as verified. The table scores the last candidate even when the run failed verification, so failed runs remain visible.

Codex consumed 317,961 / 317,582 input tokens and 1,005 / 1,007 output tokens; total elapsed time was 160.526 / 170.702 seconds. Claude consumed 91,404 / 183,240 input tokens and 7,069 / 11,156 output tokens; total elapsed was 185.769 / 342.050 seconds. Claude reported API-equivalent costs of $1.470761 / $2.065263; Codex dollar costs were unavailable. These are within-host comparisons, not pricing comparisons across providers.

Both arms had a 40,000 consumed-token admission ceiling. The adapter checks measured usage before starting another call; this is not a hard cap on an in-flight host call. Claude cache read/creation tokens are included, while Codex cached input is not counted twice. Every trial completed without a transport error. Two repetitions and synthetic cases remain too narrow for general product claims; cases are now evaluation history, not an unseen future hold-out set.

Reproduce with `node scripts/evaluate-semantic.mjs`. Protocol, case hash, outputs, scorer results, usage and per-round traces are in `.dogfood/semantic-evaluation.json`; frozen cases/scorer are in `evals/semantic-tasks.mjs`. Scorer and usage regressions are in `test/dogfood/semantic-evaluation.test.mjs`. No published claim should imply that verification always makes an already-capable model more accurate or cheaper.
