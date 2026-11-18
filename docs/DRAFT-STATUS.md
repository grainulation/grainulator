# Local grounded-report draft

Status: working draft on `draft/grounded-reports-20261117`. No remote publication is part of this draft.

## Implemented scope

This slice freezes an existing evidence sprint into a deterministic packet and independently checks that packet and optional draft claim references. It uses the existing ledger and stored passages rather than introducing a second research database.

See [grounded reports](GROUNDED-REPORTS.md) for commands, reference syntax, status meanings and limits. The CLI entry points are:

```sh
node bin/grainulator.js report packet --dir /path/to/sprint --out output/packet.json
node bin/grainulator.js report check --dir /path/to/sprint --packet output/packet.json [--draft output/draft.md] [--semantics output/semantic-eval.json] [--strict] --json
node bin/grainulator.js report verify-semantics --dir /path/to/sprint --packet output/packet.json --out output/semantic-eval.json --json
node bin/grainulator.js report compare --dir /path/to/sprint --packet output/packet.json --draft-a output/a.md --draft-b output/b.md --json
node bin/grainulator.js report attest --dir /path/to/sprint --packet output/packet.json --out output/packet.dsse.json [--draft output/draft.md] [--key /path/to/private.pem] --json
node bin/grainulator.js report verify-attestation --dir /path/to/sprint --attestation output/packet.dsse.json [--pubkey /path/to/public.pem] --json
```

Recorded source identity, local byte integrity, quote presence, semantic support, and DSSE provenance attestation are separate concepts. `packet.json` always reports `semantic_support: "not_evaluated"` to preserve the deterministic evidence boundary, while `report verify-semantics` produces a sidecar `grainulator.semantic-eval/v1` artifact (`supported`, `partial`, `contradicted`, `unresolvable`) checked by `report check --semantics`. Structural checking also surfaces grounding `warnings` (`omitted_active_risk_or_conflict`, `uncited_checkworthy_sentence`, and `secondary_citation_for_strong_tier`) that become blocking `issues` (exit 2) when `--strict` is set. CLI `grainulator add` exposes `--challenged-claim` and `--source-role` alongside `--witnessed-claim` and `--relationship`.

## Local validation

- `node --test test/dogfood/report-packet.test.mjs`: 19 focused packet/alias/checker/grounding-guard/semantics/compare/attestation tests passed.
- `npm test`: root plugin, all eight component suites and dogfood integration passed.
- `node scripts/check-package.mjs`: local package dry run and refreshed build identity passed.
- Independent CLI fixtures verified valid claim markers, invented claim markers (exit 2), `--challenged-claim` / `--source-role` provenance, `--strict` grounding-guard enforcement, offline DOI/arXiv/alias source normalization, `--semantics` sidecar checking, blind order-swapped `compare`, and Ed25519 DSSE `attest` / `verify-attestation`.
- Validation uses local fixtures and existing passages; no live network resolver or external model calls are required.

## Completed backlog

| Area | Status | Implementation |
| --- | --- | --- |
| Source identity | Implemented | Offline canonical DOI/arXiv normalization and `source.aliases` transitive merging with `canonical_ids` and `merged_metadata` in `lib/report-packet.js`, preserving explicit `revision`/`version` pinning. |
| Review & grounding | Implemented | Grounding guards (`omitted_active_risk_or_conflict`, `uncited_checkworthy_sentence`, `secondary_citation_for_strong_tier`) plus `report verify-semantics` sidecar (`grainulator.semantic-eval/v1`, offline + injectable `opts.evaluator`) and `report check --semantics`. |
| Provenance attestation | Implemented | Offline DSSE / in-toto Statement v1 envelopes (`report attest` / `report verify-attestation`) with SHA-256 subject binding and optional Ed25519 signing/verification via `node:crypto`. |
| Evaluation | Implemented | Blind order-swapped comparison (`report compare`) across `A_then_B` and `B_then_A` under `candidate_1`/`candidate_2` labels with order-invariant metrics and `opts.judge` order-disagreement detection. |
| Context & integration | Implemented | Explicit bounded packet/sidecar artifacts and Irrigator-compatible CLI/JSON boundaries without automatic schedulers or network dependencies. |

This work concerns Grainulator reports and exports. It does not modify Grainulation's separate papers repository or restore the removed permission dashboard.

## References

- [Paper Orchestra](https://github.com/google-research/paper-orchestra/tree/d9bae997e793a015ed38bb1605be9eb58c00284f): staged research writing, a shared source library and review records.
- [Rufler](https://github.com/lib4u/rufler): independently scoped review and bounded handoff context.

No upstream code was imported for this draft.
