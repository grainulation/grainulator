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
| `init`, `add_claim`, `compile`, `resolve`, `search`, `status` | Initialize a sprint, record evidence, compile findings, resolve conflicts, and inspect progress |
| `deepwiki`, `sync_log` | Retrieve public repository documentation and inspect publication history |
| `memory_search`, `memory_list`, `memory_store`, `memory_pull` | Find and reuse evidence across sprints |
| `memory_packs`, `memory_graph` | Browse knowledge packs and relationships |
| `memory_smart_fetch`, `memory_confluence` | Fetch sources or use a configured Confluence connection |
| `exports_formats`, `exports_convert`, `exports_preview` | Discover formats, convert findings, or preview output |

Every tool accepts an optional `dir`, resolved relative to the startup workspace. A directory override cannot escape that workspace. File inputs and outputs are also contained; symlinks cannot redirect them outside it. A configured memory store is separate from sprint directories and is shared only where you explicitly configure the same location.

The CLI and MCP use the same memory location: `--memory-dir`, then `GRAINULATOR_MEMORY_DIR`, then legacy `SILO_STORE`. The default is `~/.grainulator/memory`; if its index does not exist and an existing `~/.silo/index.json` does, the existing legacy store is reused. Nothing is automatically moved or merged. The plugin uses its explicitly configured data directory. Starting the server or listing tools does not initialize a sprint or create a memory store. Memory operations create the store when needed.

Shared local memory writers serialize index initialization, collection updates, and removal through the same filesystem lock. A crashed writer leaves a lock for inspection instead of permitting automatic lock stealing. Memory search returns source provenance alongside findings, so reuse retains the evidence reference.

## Start a sprint

```sh
grainulator init --dir ./research --question "Should we migrate?"
```

Or call `init` with `{"dir":"research","question":"Should we migrate?"}`. Initialization creates only `claims.json` and `compilation.json`. Optional `audience`, semicolon-separated `constraints`, and `done` capture scope. Existing sprints are preserved unless you explicitly pass `force: true` (`--force` in the CLI); a forced replacement keeps a uniquely named backup of the previous ledger. Host configuration, instructions, and Git hooks stay untouched.

Claims accept a typed `source` with `origin`, `artifact`, and `connector`; optional `witnessed_claim` and `relationship` record corroboration. Use `conflicts_with` for contradictory claim IDs. The CLI accepts `--source-origin`, `--source-artifact`, `--source-connector`, and `--conflicts-with`. Malformed provenance, tags, and conflict lists are rejected before the ledger changes.

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

Existing `wheat/*`, `silo/*`, and `mill/*` tool calls and resource URIs remain accepted as hidden aliases. They do not appear in the unified server's tool or resource lists. Original component CLI entry points remain available to read old projects. This preserves existing data and integrations without making new callers learn the former product names.

Local source changes do not replace an already running installed plugin. Point a test host at this checkout or the locally packed archive to dogfood this interface; restart that host connection to load it. No global installation or publication is required.
