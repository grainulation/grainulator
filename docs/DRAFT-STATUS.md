# Local grounded-report draft

Status: working draft on `draft/grounded-reports-20261117`. No remote publication is part of this draft.

## Implemented scope

This slice freezes an existing evidence sprint into a deterministic packet and independently checks that packet and optional draft claim references. It uses the existing ledger and stored passages rather than introducing a second research database.

See [grounded reports](GROUNDED-REPORTS.md) for commands, reference syntax, status meanings and limits. The CLI entry points are:

```sh
node bin/grainulator.js report packet --dir /path/to/sprint --out output/packet.json
node bin/grainulator.js report check --dir /path/to/sprint --packet output/packet.json
node bin/grainulator.js report check --dir /path/to/sprint --packet output/packet.json --draft output/draft.md [--strict] --json
```

Recorded source identity, local byte integrity, quote presence and semantic support are separate concepts. This draft reports semantic support as unevaluated, while surfacing grounding `warnings` (`omitted_active_risk_or_conflict`, `uncited_checkworthy_sentence`, and `secondary_citation_for_strong_tier`) that become blocking `issues` (exit 2) when `--strict` is set. CLI `grainulator add` also exposes `--challenged-claim` and `--source-role` alongside `--witnessed-claim` and `--relationship`. A successful structural check is not a factual-verification certificate, proof of source existence, or a check of every uncited sentence.

## Local validation

- `node --test test/dogfood/report-packet.test.mjs`: 15 focused packet/checker/grounding-guard tests passed.
- `npm test`: root plugin, all eight component suites and dogfood integration passed.
- `node scripts/check-package.mjs`: local package dry run and refreshed build identity passed.
- Independent CLI fixtures verified valid claim markers, invented claim markers (exit 2), `--challenged-claim` / `--source-role` provenance, and `--strict` grounding-guard enforcement.
- Validation uses local fixtures and existing passages; no live source resolver or model evaluation is claimed.

## Remaining backlog

| Area | Follow-up |
| --- | --- |
| Source identity | Automatic DOI/arXiv/provider resolution, alias matching and retrieval freshness. Current IDs bind recorded metadata. |
| Review | Independent semantic assessment of claim support, numerical fidelity, omitted limitations and unreferenced prose. |
| Reports | Rich report rendering, reproducible figures and optional rendered-output review. |
| Evaluation | Blind comparisons in both presentation orders, explicit order disagreement and separate correctness/cost/time metrics. |
| Context | Measured context preparation while retaining exact constraints, interfaces and source references. |
| Integration | An explicit Irrigator example invoking the writer and independent reviewer. No automatic project importer is implied. |

This work concerns Grainulator reports and exports. It does not modify Grainulation's separate papers repository or restore the removed permission dashboard.

## References

- [Paper Orchestra](https://github.com/google-research/paper-orchestra/tree/d9bae997e793a015ed38bb1605be9eb58c00284f): staged research writing, a shared source library and review records.
- [Rufler](https://github.com/lib4u/rufler): independently scoped review and bounded handoff context.

No upstream code was imported for this draft.
