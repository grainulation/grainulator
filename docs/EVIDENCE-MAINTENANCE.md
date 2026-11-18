# Keep evidence and conclusions current

`grainulator maintain` adds necessary-premise links, current local source
observations, execution receipts, an audit lifecycle and focused acceptance
checks. It works on an explicit sprint directory and never raises evidence tiers
automatically. Older ledgers remain valid without these optional fields.

## Necessary premises and corrections

```sh
grainulator maintain premises --dir ./project --id deployment \
  --premises '["database-choice"]' --reason 'Deployment requires this database'
grainulator maintain correct --dir ./project --id database-choice \
  --new-id database-choice-v2 --content 'Use SQLite' --reason 'Revised decision'
grainulator maintain inspect --dir ./project
```

A link records the exact premise ID and digest. A correction preserves the old
record, creates a new stated-tier successor and supersedes the predecessor in one
locked transaction. The compiler reports affected active conclusions and their
transitive paths as `E_REVERIFICATION_REQUIRED`. It does not mark every downstream
claim superseded, rebind conclusions to the replacement or erase their evidence.
After checking a conclusion, explicitly replace its necessary-premise links with
the current versions and record why. This can invalidate its own dependents.
Premises superseded by evidence-tier conflict resolution during compilation
also invalidate their dependent conclusions in that same compilation.

Witness/challenge/conflict links remain distinct from necessary premises. Unknown
IDs, self-links, duplicate links and cycles are rejected. Correctness still
depends on declaring the necessary premises; hidden assumptions are not inferred.

## Current source and executed observations

```sh
grainulator maintain source --dir ./project --id input-check \
  --file src/input.js --start-line 10 --end-line 30
grainulator maintain run --dir ./project --id input-check \
  --argv '["node","--test","test/input.test.mjs"]' \
  --files '["src/input.js","test/input.test.mjs"]' --timeout-ms 60000
```

Source observations retain full-file and range digests for a bounded text file
inside the sprint. Symlinks, traversal and invalid ranges are rejected. The range
is limited to 200 lines and the file to 2 MiB. A `run` executes literal argv with
no shell, binds the result to the complete contents of the supplied input files,
and records exit code, output digests, timing, interruption and changed-input
state. Supply every file relevant to the assertion: the tool cannot infer that
scope. It retains hashes rather than command output in the ledger. Runtime,
dependencies and external services are not captured by an input-file digest.

Execution inherits local host permissions; it is not a sandbox. It has a bounded
timeout/output limit and process-group cleanup on macOS/Linux. Native Windows
uses direct-child termination. Compile, status, report and MCP inspection never
run a command. Execution is an explicit CLI action; there is no arbitrary-command
execution MCP tool.
Invalid observation replacements, exhausted observation or history capacity and
invalid premise graphs are rejected before launching a command.

An observation that changes, disappears or fails makes the compiler block its
claim and dependent conclusions. To recheck the same source/command binding,
repeat `source` or `run` with `--replaces OBSERVATION_ID`. The earlier observation
stays in history; only its explicit successor supplies current support. A
different binding needs a new observation or corrected claim, not a silent
overwrite. Current observations are included in report packets and compilation
freshness, so editing a source can stale a frozen packet even when claims.json
has not changed.

Coverage includes every active claim in the denominator. A source observation
can establish current byte integrity; a passing execution can establish a bound
command result. Tested/production claims require execution observations for this
coverage measure. Neither establishes that prose is true. Unobserved legacy
claims are unresolved in these metrics but are not retroactively rejected just
for lacking observations. Declared changed/failed observations and premise gaps
are blockers; evidence tiers and historical records stay unchanged.

## Findings and duplicate suggestions

```sh
grainulator maintain findings --dir ./project
grainulator maintain finding --dir ./project --id bug-a --action verify \
  --verdict confirmed --observation OBSERVATION_ID --revision 0 --reason 'Reviewed source'
grainulator maintain finding --dir ./project --id bug-a --action resolve \
  --resolution fixed --observation NEW_OBSERVATION_ID --revision 1 --reason 'Verified repair'
grainulator maintain duplicates --dir ./project
grainulator maintain finding --dir ./project --id bug-b --action duplicate \
  --duplicate-of bug-a --revision 0 --reason 'Confirmed same defect'
```

Verdicts (`unverified`, `confirmed`, `partial`, `refuted`) are separate from
resolution (`open`, `fixed`, `already_fixed`, `wont_fix`). These are explicit audit
decisions, not changes to claim evidence/status. Verification and fixed
resolutions require an intact current source or passing execution observation;
the reviewer's judgment remains necessary. `reopen` changes the resolution back
to open. Each update requires the current audit revision, records its reason and
rejects stale concurrent updates. Duplicate candidates only identify overlapping
current ranges of the same file version. They do not merge distinct bugs or
certify semantic equivalence; reconciliation is explicit and rejects cycles.

## Clarify only material gaps

```sh
grainulator maintain acceptance --dir ./project
grainulator maintain acceptance --dir ./project \
  --done 'The packaged CLI passes the fixture' --reason 'Completion criteria agreed'
```

The read operation returns questions only when the explicit goal or completion
criteria are missing. It uses existing sprint data and makes no model calls.
Updating criteria preserves earlier constraints as superseded history. There is
no fixed interview or numerical ambiguity score, and an empty question list does
not establish that every requirement is correct.

## CLI, MCP and artifacts

The consolidated MCP server exposes `evidence_health`, `premise_links`,
`correct_claim`, `observe_source`, `findings`, `finding_action`,
`duplicate_candidates`, `acceptance_check` and `acceptance_set`. Tool definitions
state side effects, appropriate use and limits. The CLI `maintain` commands and
MCP share the same mutation APIs and local ledger lock. Claims and report packets
retain the new metadata; compilation exposes current health and audit fields for
export consumers. Older compilation certificates refresh under compiler 0.4.0.

`maintain` exits 0 on a successful operation, 1 on invalid input and 2 for reported
re-verification/failed execution. These codes do not change the managed runner's
existing exit 3 verifier-soundness contract.
