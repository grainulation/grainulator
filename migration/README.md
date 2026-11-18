# Convert an existing installation to Grainulator 3

This is a separately distributed migration artifact, not part of the normal
Grainulator package. Use Node 24 or 26 LTS. Verify this archive against the
independently trusted release manifest before unpacking it.

The local converter reads explicitly selected sources, stages checked copies,
preserves originals and records a transaction journal. It does not execute an
oracle, provider, adapter, shell command or network request. It never installs
a hook, edits host registration, deletes old data or converts a remote page.

## Inspect before applying

Keep the old installation available. Stop old and new writers for each selected
project/store before applying or recovering. The explicit quiesced flag is an
operator assertion; this tool does not discover or terminate processes.

    node converter.mjs inspect --project /absolute/project --out /absolute/new-plan.json

Inspection without an output option is read-only and prints the plan. With an
output option it creates only that new plan file and refuses to overwrite it.
The plan contains paths, hashes and conversion operations, not claim contents
or credentials. Inspect it locally; paths may identify private projects.

Optional global or plugin stores require explicit independent mappings:

    node converter.mjs inspect --project /absolute/project \
      --memory-source /absolute/old-store \
      --memory-destination /absolute/new-store \
      --cache-source /absolute/old-cache \
      --cache-destination /absolute/new-cache \
      --out /absolute/new-plan.json

Never merge two existing stores or infer a source from modification time.
Choose each host/plugin scope explicitly. The old cache may be nested beneath the old memory root. Memory conversion
excludes that cache subtree and leaves its original bytes untouched. To retain
cached payloads and their existing TTL, select the cache as its own explicit
source/destination pair; the converter never refetches URLs. Existing canonical
data and custom paths need no relocation merely to adopt new environment
variable names.

The converter maps the selected legacy evidence/runtime directories and
configuration into the namespaced Grainulator layout. Generic evidence ledgers
and report packets retain their content-role names. User claims, quotes and
signed history remain historical bytes, including any legacy product words.
Unknown or unsupported formats fail without pretending conversion succeeded.

## Apply, verify and recover

    node converter.mjs apply --plan /absolute/new-plan.json --quiesced

The result identifies the transaction directory. Use that exact path:

    node converter.mjs verify --transaction /absolute/project/.grainulator-migrations/TRANSACTION
    node converter.mjs resume --transaction /absolute/project/.grainulator-migrations/TRANSACTION --quiesced
    node converter.mjs rollback --transaction /absolute/project/.grainulator-migrations/TRANSACTION --quiesced

Transactions preserve their journal/staging on interruption. If a process
dies before the first journal exists, recover using the original reviewed plan
and the exact transaction ID reported by its lock:

    node converter.mjs apply --plan /absolute/new-plan.json --quiesced --recover-transaction TRANSACTION

For an existing journal, the resume or rollback operation can take the explicit
recover-locks flag after the converter proves that its matching same-host owner
is dead. Neither route steals a live, foreign or uncertain lock.

Do not delete a lock or receipt to force a retry. Follow the converter's explicit recovery
diagnostic for a proven dead owner; live or uncertain owners remain blocked.
Do not move the transaction directory, rewrite its hashes or copy its receipt
to a different project. Rollback refuses changed destinations or backups and
never overwrites research written after conversion. A protected/read-only directory may retain
its rollback copy beside the canonical destination with a transaction-specific
.grainulator-retired- suffix; the result reports these retained_paths. Keep
those copies with the journal rather than treating them as disposable cache.

Cross-filesystem activation and ambiguous overlapping mappings are refused
before cutover when they cannot satisfy the transaction guarantees. Select
same-filesystem destinations or handle the affected unit as a separate reviewed
copy; do not weaken checks to force a move.

## Native runtime and host cutover

The converter preserves old native receipts and derived reports as inert
history. It does not turn an old pass into a new verifier result. Canonical
native state is marked for review; budgets and temporal counters are not reset.
Review retained oracle argv and input paths, then use the installed v3 CLI's
explicit runtime review-migration command with the expected marker digest.
Run any required verifiers only as a separate authorized action.

Keep an existing mandatory old hook authoritative until canonical state and the
new self-contained native asset are verified. Explicit enrollment pins a complete
native release in the user runtime cache and changes only owned host settings
through its receipt/hash checks. Formula installation, Brew cleanup and plugin
updates do not enroll or detach required hooks. Verify the actually loaded fresh
host before retiring an old gate; direct CLI/MCP checks alone do not establish it.

## Remote pages are a separate operation

Historical publication state creates a pending reconciliation blocker. Missing
page IDs or empty legacy page maps are uncertainty, not permission to create
replacement pages. Retain tenant/site, space, page ID, role, version and source
identity while reviewing each known page.

The separate remote module exports read-only preview and explicit apply,
reconcile and finalization helpers. Supply an authorized adapter and an explicit
existing-page inventory; it has no transport, credentials, title discovery or
page-creation API. It updates only reviewed metadata on the same page IDs with
version/body checks and preserves body bytes and unrelated labels. A sent write
with an uncertain outcome must be reconciled before another attempt.

Local apply never calls the remote module. A pending or contradictory remote
identity prevents ordinary canonical publishing from creating duplicates.
Uninstalling either application does not remove source data, transaction history
or required host registrations.
