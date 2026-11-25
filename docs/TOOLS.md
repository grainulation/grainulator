# Grainulator tools

One MCP server, `grainulator`, exposes the product's evidence, memory, and export tools. To add a claim, call `add_claim`:

```json
{
  "name": "add_claim",
  "arguments": {
    "id": "r001",
    "type": "constraint",
    "topic": "migration",
    "content": "Preserve existing GitHub stars.",
    "evidence": "stated",
    "source": {"origin": "stakeholder", "artifact": null, "connector": null}
  }
}
```

This is the `tools/call` payload. Hosts may display it as `grainulator.add_claim` or `mcp__grainulator__add_claim`; the actual MCP tool name is simply `add_claim`.

## Connect locally

```sh
node bin/grainulator.js connect --dir /absolute/path/to/workspace
```

This prints a configuration for your host. It does not edit host settings. Its entry runs:

```sh
node /absolute/path/to/grainulator/bin/grainulator.js mcp --dir /absolute/path/to/workspace
```

The plugin config starts only this server. Its `deepwiki` tool fetches public repository documentation on demand. A separate remote DeepWiki MCP connection is optional and must be added explicitly to your host configuration.

## Tool names

| Tools | Purpose |
|---|---|
| `init`, `add_claim`, `import_claims`, `compile`, `resolve`, `search`, `status` | Initialize a sprint, record evidence, compile findings, resolve conflicts, and inspect progress |
| `deepwiki`, `sync_log` | Retrieve public repository documentation and inspect publication history |
| `evidence_health`, `premise_links`, `correct_claim`, `observe_source` | Recheck current evidence, bind necessary premises, preserve corrections and capture source versions |
| `findings`, `finding_action`, `duplicate_candidates` | Separate audit verdict/resolution and explicitly reconcile overlap candidates |
| `acceptance_check`, `acceptance_set` | Identify material missing criteria or record explicit updates without a compulsory interview |
| `memory_search`, `memory_list`, `memory_store`, `memory_pull` | Find and reuse evidence across sprints |
| `memory_packs`, `memory_graph` | Browse knowledge packs and relationships |
| `memory_smart_fetch`, `memory_confluence` | Fetch sources or use a configured Confluence connection |
| `exports_formats`, `exports_convert`, `exports_preview` | Discover formats, convert findings, or preview output |

Every tool accepts an optional `dir`, resolved relative to the startup workspace. A directory override cannot escape that workspace. File inputs and outputs are also contained; symlinks cannot redirect them outside it. A configured memory store is separate from sprint directories and is shared only where you explicitly configure the same location.

The CLI and MCP use the same memory location: `--memory-dir`, then `GRAINULATOR_MEMORY_DIR`, then `~/.grainulator/memory`. Historical environment variables and store directories are not probed; use the separate converter for a reviewed migration. The plugin uses its explicitly configured data directory. Starting the server or listing tools does not initialize a sprint or create a memory store. Memory operations create the store when needed.

Shared local memory writers serialize index initialization, collection updates, and removal through the same filesystem lock. A crashed writer leaves a lock for inspection instead of permitting automatic lock stealing. Memory search returns source provenance alongside findings, so reuse retains the evidence reference.

## Start a sprint

```sh
grainulator init --dir ./research --question "Should we migrate?"
```

Or call `init` with `{"dir":"research","question":"Should we migrate?"}`. Initialization creates the configured ledger and compilation files (defaults: `claims.json` and `compilation.json`); `files_created` identifies their actual relative paths. Optional `audience`, semicolon-separated `constraints`, and `done` capture scope. Existing sprints are preserved unless you explicitly pass `force: true` (`--force` in the CLI); a forced replacement keeps a uniquely named backup of the previous ledger. Host configuration, instructions, and Git hooks stay untouched.

Claims accept a typed `source` with `origin`, `artifact`, and `connector`; optional `witnessed_claim`, `challenged_claim`, `relationship`, and `source_role` (`primary_evidence` or `secondary_citation`) record corroboration, adversarial challenges, and provenance roles, and optional `doi`, `url`, `arxiv`, and `aliases` support offline canonical identifier normalization in grounded report packets (see [grounded reports](GROUNDED-REPORTS.md) for `grainulator report packet`, `check`, `verify-semantics`, `compare`, `attest`, and `verify-attestation`). Use `conflicts_with` for contradictory claim IDs. The CLI accepts `--source-origin`, `--source-artifact`, `--source-connector`, `--witnessed-claim`, `--challenged-claim`, `--relationship`, `--source-role`, and `--conflicts-with`. Malformed provenance, tags, and conflict lists are rejected before the ledger changes.

A claim can also cite the exact sentence it relies on. Pass `source.quote` with `source.passage`, the paragraph or section that contains it (at most 256 KB; the quote at most 2 KB), or with `source.passage_sha256` to reuse a passage already stored in the sprint. CLI: `--quote`, `--passage-file`, `--passage-sha256`. The passage is stored once at `evidence/passages/<sha256>.txt`; `claims.json` keeps only the digest and the quote, and a quote that does not occur in the passage (after whitespace normalization) is rejected. On each compile the compiler re-reads every referenced passage and reports `passage_integrity` per claim, `distinct_supporting_passages` per claim (distinct passages across valid `full_support` witnesses), and `conflict_support` per conflict. A changed, missing or unreadable passage is a `W_PASSAGE_INTEGRITY` warning and counts as no passage support; it never blocks. The compilation certificate's `passages_hash` makes a compilation stale for the output guard and `status` when a referenced passage changes. Passage records are audit data: they show what a witness cited and that it is unchanged, not that the passage proves the claim, and they do not change which claim wins a conflict. Conflicts where both sides have quoted passage support are listed under Manual in `next_actions`.

Exports can write report artifacts, but cannot overwrite sprint ledgers, compilation, host settings, or their own source files. Stored collections retain sprint metadata separately from their storage identity and integrity hash.

After recording evidence, call `compile`. It returns the current compilation status and `next_actions` grouped into `auto` and `manual`. Present those as **Auto** and **Manual** bullet lists. `status` is read-only and flags stale compilation, which must be refreshed before using its next steps.

## Resources

- `grainulator://claims`
- `grainulator://compilation`
- `grainulator://brief`
- `grainulator://sync-log`
- `grainulator://memory/index`
- `grainulator://memory/packs`
- `grainulator://exports/formats`

## Compatibility

Version 3 uses the exact canonical names listed above. Historical component-prefixed calls and resource aliases are not accepted; update custom registrations and allowlists using the [upgrade guide](UPGRADING.md). The server does not recreate retired component servers or automatic remote connections.

Changing source code does not update a plugin that is already running. To test these tools, point your agent at this checkout or a local archive, then restart its connection. You do not need to install or publish anything globally.

## Compact profile and container discovery

The default `legacy` toolset preserves all 29 current tool names. An explicit compact profile provides **15 tools** for evidence, local memory and exports within the same server:

```sh
node bin/grainulator.js mcp --dir /absolute/workspace --toolset compact
node bin/grainulator.js connect --dir /absolute/workspace --toolset compact
```

`connect` prints a registration; it does not change host settings. Bundled plugins continue to select the default legacy toolset. The Docker image explicitly selects compact discovery by default; an explicit Docker command replaces that default, so include `--toolset compact` when supplying a different workspace. Test a separate compact registration in a fresh host session before migrating allowlists or workflows. CLI/plugin default discovery and the legacy names remain unchanged; the container's explicit compact selection is described in the [upgrade guide](UPGRADING.md).

| Compact tool | Existing capability |
| --- | --- |
| `configure_sprint` | `init` in explicit create mode; `acceptance_set` in criteria mode |
| `record_claim` | `add_claim` for authored evidence |
| `import_claims` | Document import with its existing provenance and repeat-import rules |
| `correct_claim` | Stated-tier successor and preserved predecessor history |
| `resolve_conflict` | Existing pairwise conflict resolution |
| `search_claims` | Claim search plus audit revision and observation freshness |
| `compile_sprint` | Compilation writes and Auto/Manual next actions |
| `inspect_sprint` | Fixed status, evidence, acceptance and duplicate report |
| `link_premises` | Explicit necessary-premise version links |
| `observe_source` | Confined source capture |
| `update_finding` | Revision-guarded audit transitions |
| `search_memory` | Ranked search, or collection/pack catalogs when query is omitted |
| `import_memory` | Local pack or collection import |
| `store_memory` | Local named collection storage |
| `export_document` | Format catalog with only `dir`; with `format`, inline conversion, preview lines, or an explicitly named output file |

Compact calls reject unadvertised legacy names; there is no hidden fallback route. The existing seven resources remain available, including memory and export catalogs. Direct authoring and imported document evidence remain distinct operations. `inspect_sprint` bounds every returned array with `limit` (default 20, maximum 100), including `truncated_paths`. `truncated_path_count` counts all shortened paths; subtract the returned list length to find the number of omitted path entries. Use `search_claims` for full records. Audit filters return matching records and updated counts.

`configure_sprint` requires `mode:create` or `mode:criteria`. Creating requires a question; replacing existing data still requires explicit force and creates a backup. Omitting `done` creates no completion criterion and leaves an acceptance gap. Criteria mode requires a reason and question or done, rejects force/audience/constraints, and preserves history; `done` supersedes prior active completion criteria. Historical `search_claims` results retain the shared audit defaults and observation freshness, including when verdict/resolution filters select superseded records.

`search_memory` catalog mode accepts only `dir`; search filters require `query`. Tool-only clients can call `export_document` with `{ "dir": "." }` to receive `formats` and `count`. Each format has `id`, `name`, `extension`, `mimeType`, and `description`. Rendering requires `format`; `source`, `lines`, and `output` are forbidden without it. Export `lines` and `output` cannot be combined. Unknown-format errors direct both profiles to `grainulator://exports/formats`. The export tool conservatively advertises mutation and replacement capability even though catalog and inline calls write no file.

Compact deliberately excludes network retrieval, Confluence, graph building and sync-log tools. Those capabilities remain available through the legacy MCP toolset and the existing CLI (`grainulator memory --help` and `grainulator search --help`). The sync-log resource remains readable. This is a real scope difference, not an alternate listing of hidden tools. A full legacy profile's score cannot be represented as the compact profile's score, or vice versa. The registry/container profile exposes fifteen supported operations; that count does not establish a TDQS score or eliminate completeness requirements. See [tool-definition quality](TDQS.md) for the primary rubric, profile boundaries and verification process.

## MCP protocol and result contracts

Each connection negotiates `2024-11-05`, `2025-03-26`, or `2025-06-18` on its first valid `initialize` request. Required fields are a string `protocolVersion`, object `capabilities`, and object `clientInfo` with string `name` and `version`. Malformed requests return invalid params without committing a version. An explicitly requested unsupported version receives the highest supported version (`2025-06-18`), which the client may accept or reject. Repeated valid initialization returns the committed version and cannot change discovery or result formats. Before initialization, discovery and calls use text-only contracts. Connections do not share negotiation state.

With `2025-06-18`, tools advertise output schemas and return the same JSON in `structuredContent` and the existing text content block. The server checks the declared field types before sending structured results. Legacy protocol connections retain text-only results and omit output schemas. Business failures preserve `isError:true` and structured error details on modern connections; unknown tools remain JSON-RPC errors. Optional output fields describe the underlying operation's varying result forms, rather than claiming that every backend emits every field.

In both profiles, `correct_claim` returns predecessor and successor IDs as `previous` and `replacement`, plus `needs_reverification`. Export previews return `totalLines`, `showing`, and `hasMore` for the bounded inline rendering. Legacy Confluence pull returns `claimCount` for claims retrieved, including when no import destination was supplied or when deduplication skips existing claims; this is distinct from an imported count.

Legacy `memory_graph` returns node, edge, source, topic and tag counts for build/stats; `related` and `topic` return `related` or `claims` with the returned record `count`. The clusters action returns at most 20 `clusters`, while `count` reports all clusters found before that cap.

## Complete records, calibration and document import

Use `search` with `{dir, id}` for an exact complete record, or `{dir, full: true}` for complete filtered records. Search defaults to active records; `include_inactive: true` includes history. Compact results include `truncated`, timestamp and status. CLI equivalents: `search --id <id> --full --include-inactive --json --dir <sprint>`.

`add_claim` accepts an optional `calibration` object: `prediction_id` (an active estimate/risk/recommendation), `verdict` (`correct`, `wrong`, `partial`, `unknown`), `outcome` text, and optional numeric `delta`. The CLI accepts the same JSON through `--calibration`. Analytics uses explicit links scoped to the sprint; partial/unknown outcomes are separate from binary accuracy. Existing legacy references remain readable. Scores describe observations, not proven forecasting skill.

`import_claims` takes `{dir, source, claims}`. This imports **active document findings**, not a historical ledger restore. It skips superseded/resolved/archived records, maps source IDs/conflicts deterministically, retains original provenance/tier as source metadata, and records document assertions at stated evidence. Repeat imports are no-ops; changed source records require a reviewed correction. Local supersession is preserved. CLI: `grainulator import --dir <sprint> --file <claims.json> --source <stable-document-id>`.

Status includes `dir`, `topic_list`, `evidence_distribution` and complete active `conflicts` pairs in addition to existing counts. `active_claims` differs from `total_claims`. Memory search retains lifecycle and resolution fields so historical hits cannot be mistaken for active evidence.

CSV and SQL are flattened presentations, not lossless provenance interchange. Use raw-ledger NDJSON for full record preservation. Markdown exports escape raw HTML text; downstream renderers still own link-scheme, plugin and sanitization policy.
