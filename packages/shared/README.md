# Shared module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module provides internal filesystem transactions, atomic writes, path containment, MCP framing, sprint discovery, and reusable report assets. Product code imports these utilities by their local module paths; users do not need a separate shared-tools server.

```sh
node bin/grainulator.js doctor
node bin/grainulator.js --help
```

Filesystem locks coordinate cooperating local writers. They are not distributed locks or a sandbox. Path checks resolve existing ancestors and symlinks so missing output files can be created within the allowed workspace without allowing a path escape.

Barn package and binary names are retained compatibility details. Optional legacy document-build helpers may require external tooling, but they are not part of current installation. Use the root [tool reference](../../docs/TOOLS.md) and [adapter contract](../../docs/ADAPTERS.md).
