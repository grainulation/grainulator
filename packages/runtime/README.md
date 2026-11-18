# Grainulator native runtime

The native convergence runtime checks a typed ledger, executes explicitly selected
oracles and bounded agent rounds, and derives lessons from recorded traces. It is
part of Grainulator. Use the root `grainulator runtime` commands; this directory
has no separately installed plugin, package or public executable.

Native state lives in `<workspace>/.grainulator/runtime/`. The root
`grainulator run` command uses a separate JS adapter engine and writes
`.grainulator/runs/`; the two protocols do not share a ledger.

```sh
grainulator runtime --help
grainulator runtime init --dir /absolute/project
grainulator runtime claim add --dir /absolute/project \
  --id c1 --type factual --topic packaging --content 'A concrete finding' \
  --evidence documented
grainulator runtime check --dir /absolute/project --json --no-state
```

Install a matching native archive explicitly with its release manifest and an
independently obtained manifest SHA-256. Installation does not download code,
build Rust, change PATH or register a host hook. Required host enforcement is a
separate explicit enrollment into a retained user-cache release. The native Stop
hook has no Node or Homebrew dependency and remains pinned across package cleanup.

Enrollment supports one active runtime workspace per host settings scope and one
host settings scope per runtime workspace. Attempts to add another active cohort
leave the first gate and its settings intact. Same-workspace upgrades on the same
host scope replace only the owned hook through compare-and-swap; old verified
assets remain available for rollback. Moving to another host scope needs a
separately reviewed operator handoff. Other projects covered by the global gate
need an explicit `not-managed` policy when they do not use native enforcement.

Read [runtime installation and enrollment](../../docs/RUNTIME.md),
[upgrade guidance](../../docs/UPGRADING.md) and the [local example](EXAMPLE.md).
The one-time migration converter is distributed separately from the normal CLI;
converted oracle bindings require explicit review and subsequent verification.

## Development

Build the five explicitly named canonical binaries with:

```sh
cargo build --locked --release --manifest-path packages/runtime/rs/Cargo.toml
node packages/runtime/test/conformance.mjs
```

The differential suite compares static and temporal behavior with the JS reference
and exercises native oracle, driver, trace and lessons contracts. Release candidates
also execute installed native archives on every advertised target. A cross-build
alone does not establish support.

Schemas are bundled under `schemas/` with immutable
`urn:grainulator:runtime:<kind>:1` identities. No network schema resolution is needed.
