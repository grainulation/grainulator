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
  --packet output/packet.json --draft output/draft.md --json
```

`consistent` means the packet matches the current ledger and passage observations.
With `--draft`, every recognized claim marker must name an active claim with a
recorded source locator, an intact passage, and a quotation found in that passage.
Unknown claims, unresolved references, a draft with no claim markers, tampered
packets and stale packets fail the check (exit 2). Input/usage errors exit 1.

The checker inspects explicit markers only. It cannot detect every uncited
sentence, determine whether prose correctly interprets a passage, or certify
that an external source exists. A packet can contain evidence gaps unrelated to
the draft's markers; they remain in `gaps` even when the structural check passes.
All relations retain `semantic_support: not_evaluated`, including existing
witness relationship labels. A recorded `full_support` label is not promoted to
independent proof.

The packet digest identifies its bytes; it is not a signature. Rebuilding and
comparing against the sprint catches changed source data and recomputed packet
hashes. Claim IDs are local to the sprint. Source IDs hash recorded locator
metadata, including explicit revision/version fields; they do not merge aliases
such as a DOI and an arXiv URL. Multiple claims and passages can reference one
source without losing their separate relationships.

## Scope of this local draft

Packet generation and independent structural checking are implemented. Automatic
source discovery/resolution, semantic judging, blind draft comparison, generated
figures and rendered-output review remain separate follow-up work. Irrigator can
coordinate a writer and reviewer through explicit tasks; this command does not
introduce an automatic importer or another scheduler.
