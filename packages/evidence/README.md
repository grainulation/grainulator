# Evidence module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module stores typed claims, records source provenance, identifies declared conflicts, and compiles evidence coverage into `compilation.json`.

```sh
node bin/grainulator.js init --dir ./research --question "What should we validate?"
node bin/grainulator.js add --dir ./research --id r001 --type constraint --topic scope --content "Keep this investigation local." --source-origin stakeholder --evidence stated
node bin/grainulator.js compile --dir ./research
node bin/grainulator.js status --dir ./research
node bin/grainulator.js connect --dir ./research
```

Initialization creates sprint data only. It does not replace host configuration or install Git hooks. `connect` prints an MCP configuration without editing the host. The unified server exposes `init`, `add_claim`, `compile`, `resolve`, `search`, and `status`; use the [tool reference](../../docs/TOOLS.md) for arguments and resources.

A successful compilation checks ledger structure and evidence rules. It does not establish source truth, guarantee better model answers, or prevent every host from stopping. Present current `next_actions` as **Auto** and **Manual** lists; refresh stale compilation first.

Legacy Wheat binaries, tool aliases, and data filenames remain compatibility details. The old initializer can scaffold host instructions, and its explicit Git-hook option is legacy tooling; neither is required for current setup. Remove only a registration you intentionally added when disconnecting a host, preserving unrelated configuration.

See [host integration](../../docs/HOSTS.md) and the [local dogfood guide](../../docs/DOGFOOD.md).
