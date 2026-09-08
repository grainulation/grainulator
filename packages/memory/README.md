# Memory module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module stores reusable claim collections and knowledge packs. The unified MCP tools include `memory_store`, `memory_search`, `memory_list`, and `memory_pull`; search results retain source provenance.

```sh
node bin/grainulator.js memory --help
node bin/grainulator.js memory packs
node bin/grainulator.js memory store findings --from ./research/claims.json
node bin/grainulator.js memory search "migration" --evidence tested
```

CLI and MCP share storage configuration: explicit `--memory-dir`, then `GRAINULATOR_MEMORY_DIR`, then legacy `SILO_STORE`. The default is `~/.grainulator/memory`. An existing `~/.silo` index is reused only when the canonical index does not exist; nothing is automatically moved or merged. The plugin has its own explicitly configured data directory.

Local writers use the same index transaction lock. A crashed writer's lock requires inspection; it is not automatically stolen. Pack contents are reusable starting points, not automatically verified facts for a new task.

Silo names remain compatibility aliases. See the [tool reference](../../docs/TOOLS.md) for provenance, retrieval, and directory containment, and the [dogfood guide](../../docs/DOGFOOD.md) for the current workflow.
