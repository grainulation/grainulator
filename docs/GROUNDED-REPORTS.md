# Grounded report draft

Freeze a sprint's active evidence before drafting a report. The packet keeps all
claim-to-source relationships, recorded source versions, quoted passages,
conflicts and missing evidence. It is an offline artifact; it does not retrieve
or independently resolve a source, assess scientific validity, or run a model.
At least one active claim is required. Inactive record IDs, statuses and resolution
links remain in a historical index; their full content stays in the untouched
ledger and is excluded from the draft's active evidence. The packet pins the
entire ledger, including history, so later lifecycle changes make it stale.

```sh
node bin/grainulator.js report packet --dir /path/to/sprint --out output/packet.json
node bin/grainulator.js report check --dir /path/to/sprint --packet output/packet.json
```

Paths for packet output, packet input and optional draft input must stay inside
the explicitly selected sprint. Existing outputs are never overwritten. Use a
new name after changing the evidence. Source ledgers, passages and host settings
cannot be replaced by packet generation. Artifacts are private local files;
review their research content before sharing them.

## Draft and independent review

1. Give the writer the frozen packet and the requested audience and outcome.
   Preserve limitations, conflicting findings and missing experiments as visible
   gaps. Attach `[[claim:r001]]` to statements drawing on that claim.
2. Give a separate reviewer the packet, original request and draft. Do not pass
   the writer's self-assessment as evidence. Ask whether each substantive claim
   is supported by the recorded passages, whether numerical values match the
   underlying results, and whether important limitations are omitted.
3. Run the local structural check before accepting that review:

```sh
node bin/grainulator.js report check --dir /path/to/sprint \
  --packet output/packet.json --draft output/draft.md [--strict] --json
```

`consistent` means the packet matches the current ledger and passage observations.
With `--draft`, every recognized claim marker must name an active claim with a
recorded source locator, an intact passage, and a quotation found in that passage.
Unknown claims, unresolved references, a draft with no claim markers, tampered
packets and stale packets fail the check (exit 2). Input/usage errors exit 1.

In addition to structural `issues`, `report check` returns heuristic grounding
`warnings` (`warnings: [...]`, promoted into `issues` and exiting 2 when
`--strict` or `{ strict: true }` is passed):

- `omitted_active_risk_or_conflict`: flags active `risk` or `constraint` claims,
  unresolved `contradicts`/`challenge` relations (`challenged_claim` or
  `witnessed_claim` with `relationship: "contradicts"`), and partially cited
  `conflicts_with` pairs omitted from `draft.md`'s `[[claim:...]]` citations.
- `uncited_checkworthy_sentence`: scans `draft.md` prose sentences (skipping
  headings, code fences, inline code, table separators, and URLs) for
  quantitative/temporal/empirical assertions lacking a `[[claim:...]]` marker.
- `secondary_citation_for_strong_tier`: flags active `documented` or `tested`
  claims whose `source_role` is `"secondary_citation"` without an active
  corroborating `"primary_evidence"` witness.

The checker inspects explicit markers and heuristic prose/provenance signals
only. It cannot detect every uncited sentence, determine whether prose correctly
interprets a passage, or certify that an external source exists. A packet can
contain evidence gaps unrelated to the draft's markers; they remain in `gaps`
even when the structural check passes. All relations retain
`semantic_support: not_evaluated`, including existing witness relationship
labels. A recorded `full_support` label is not promoted to independent proof.

The packet digest identifies its bytes; it is not a signature on its own—use
`report attest` / `report verify-attestation` for an offline DSSE / in-toto
Statement v1 envelope (optionally Ed25519-signed). Rebuilding and comparing
against the sprint catches changed source data and recomputed packet hashes.
Claim IDs are local to the sprint. Source IDs deterministically normalize offline
DOI (`10.\d{4,9}/...`) and arXiv (`arxiv:\d{4}\.\d{4,5}`) identifiers across
`source.doi`, `source.url`, `source.arxiv`, `source.artifact`, and optional
`source.aliases`, merging matching unpinned sources under one deterministic
`source_id` with `canonical_ids` (and `merged_metadata` when multiple records
merge) while preserving explicit `revision`/`version` fields. Multiple claims and
passages can reference one source without losing their separate relationships.

Witness targets (`--witnessed-claim`), challenge targets (`--challenged-claim`),
relationships (`--relationship`), and citation roles (`--source-role`) are
relation fields on `relations[]`, not part of the source's locator identity.
`ledger_sha256` hashes the exact bounded file bytes, including an optional UTF-8
BOM; parsing does not rewrite the ledger. For an unreadable or corrupt passage,
the integrity gap remains explicit. When its bytes were read, the packet retains
their `observed_sha256`, so replacing corrupt bytes with different corrupt bytes
makes a frozen packet stale. If no bytes can be read, only the read failure can
be recorded; their content cannot be fingerprinted.

## Sidecar semantic evaluation, blind comparison, and DSSE attestation

```sh
node bin/grainulator.js report verify-semantics --dir /path/to/sprint \
  --packet output/packet.json --out output/semantic-eval.json --json
node bin/grainulator.js report check --dir /path/to/sprint \
  --packet output/packet.json --draft output/draft.md \
  --semantics output/semantic-eval.json [--strict] --json
node bin/grainulator.js report compare --dir /path/to/sprint \
  --packet output/packet.json --draft-a output/a.md --draft-b output/b.md --json
node bin/grainulator.js report attest --dir /path/to/sprint \
  --packet output/packet.json --out output/packet.dsse.json \
  [--draft output/draft.md] [--key /path/to/private.pem] --json
node bin/grainulator.js report verify-attestation --dir /path/to/sprint \
  --attestation output/packet.dsse.json [--pubkey /path/to/public.pem] --json
```

- **Sidecar semantic evaluation (`verify-semantics`)**: keeps `packet.json`'s
  `semantic_support: "not_evaluated"` untouched and writes a separate
  `grainulator.semantic-eval/v1` artifact pinned to `packet_sha256` and
  `ledger_sha256`. Relations are classified offline (or via an injectable
  `opts.evaluator` adapter) as `supported`, `partial`, `contradicted`, or
  `unresolvable`. Passing `--semantics` to `report check` verifies the sidecar
  hash matches the packet/ledger and fails (`semantic_support_failed`, exit 2)
  when any cited claim is `contradicted` or `unresolvable`.
- **Blind order-swapped comparison (`compare`)**: evaluates two drafts in both
  `A_then_B` and `B_then_A` presentation orders under blinded `candidate_1` /
  `candidate_2` labels, reporting `effective_grounded_claims`,
  `primary_evidence_claims`, `structural_issues_count`,
  `grounding_warnings_count`, `order_consistent`, and `order_disagreement` (when
  an optional `opts.judge` callback flips its winner upon swapping order).
- **DSSE / in-toto provenance (`attest` / `verify-attestation`)**: emits a
  standard DSSE envelope (`application/vnd.in-toto+json`, in-toto Statement v1,
  predicate `https://grainulation.com/attestation/report-packet/v1`) binding
  SHA-256 subject digests for `packet.json` and optional `draft.md`, with
  optional Ed25519 signature (`--key` / `--pubkey`).

## Scope of this local draft

Packet generation, canonical offline DOI/arXiv/alias source merging, independent
structural and grounding-guard checking, sidecar semantic evaluation, blind
order-swapped draft comparison, and offline DSSE/in-toto attestation are
implemented. Live network source retrieval remains intentionally excluded so
packets stay deterministic offline. Irrigator can coordinate a writer and
reviewer through explicit tasks; this command does not introduce an automatic
importer or another scheduler.
