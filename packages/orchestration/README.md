# Sprint orchestration module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module tracks sprint dependencies, assignment, and readiness. It coordinates research work; native hosts own agent permissions and remote sessions.

```sh
node bin/grainulator.js orchestrate --help
node bin/grainulator.js orchestrate init
node bin/grainulator.js orchestrate plan
node bin/grainulator.js orchestrate status
```

Run `init` in the project whose sprint dependencies you want to track. It creates `orchard.json`, a retained compatibility filename. Add sprint paths and dependency relationships to that file; `plan` displays the dependency graph and `status` inspects referenced sprints. The optional report command creates an HTML artifact, not a permission-management application.

Existing Orchard data and the legacy binary remain supported. There is no separate package installation or background service required for this module. See the [tool reference](../../docs/TOOLS.md) for evidence operations and the [dogfood guide](../../docs/DOGFOOD.md) for the current product workflow.
