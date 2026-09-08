# Execution runtime module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module contains compatible execution-ledger checks and optional runtime components. The current product entry point is Grainulator's managed command loop, which can invoke a model adapter, run a verifier, attempt a bounded correction, and retain a trace.

```sh
node bin/grainulator.js run --help
node bin/grainulator.js demo
node bin/grainulator.js check --help
```

The demo is an offline protocol fixture. It demonstrates repair and verification mechanics, not a measured improvement in model quality. Configure a real adapter and verifier using the [adapter contract](../../docs/ADAPTERS.md); see the [dogfood guide](../../docs/DOGFOOD.md) for local execution.

`grainulator check` reads a compatible runtime ledger under `.bean/` and returns a nonzero result when its checks do not pass. Evidence sprints use `grainulator compile` instead. These formats have distinct purposes; starting an evidence sprint does not install a native execution gate.

The retained Bean commands and `install.sh` are optional legacy compatibility tooling. The installer requires the original runtime build sources, which are not included in the root archive. It is not part of current onboarding. Do not infer native Stop-hook support or universal enforcement from its presence: permissions and stopping behavior depend on the host and integration. The managed runner itself is not a sandbox.

See [tested host behavior](../../docs/HOSTS.md) and [interruption and recovery](../../docs/RECOVERY.md).
