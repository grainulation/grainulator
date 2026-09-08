# Legacy CLI compatibility module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module retains earlier command dispatch and imported assets so existing integrations can be inspected during migration. It is not the current product installer or a directory of independently installed products.

Use the root interface for new work:

```sh
node bin/grainulator.js doctor
node bin/grainulator.js init --dir ./research --question "What should we validate?"
node bin/grainulator.js connect --dir ./research
```

`grainulator legacy` is an optional compatibility entry point. Its former setup and installation commands belong to the old distribution model; do not use them to set up this consolidated build. The permission dashboard and its connectors have been removed. Historical command names and imported assets do not imply current support for that application.

Follow the [installation contract](../../docs/INSTALLATION.md), [canonical tool reference](../../docs/TOOLS.md), and [host integration guide](../../docs/HOSTS.md). Preserve unrelated host settings when migrating or removing a specific integration. No global installation, repository archival, or publication is part of the local dogfood workflow.
