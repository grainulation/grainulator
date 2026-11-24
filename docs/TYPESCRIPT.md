# TypeScript migration

The checked core starts with the research claims parser and MCP output contracts.
Their canonical sources live under `typescript/lib/`, with shared domain contracts
in `typescript/lib/contracts.ts`. Incoming JSON has type `unknown`; runtime guards
still validate it before a typed claim or structured MCP result is returned.

Run these commands from the repository root:

```sh
npm run typecheck
npm run build:types
npm run check:types
```

`typecheck` checks all canonical TypeScript with strict null checking, unchecked
index checking and exact optional properties. `build:types` compiles in a temporary
directory, formats the generated modules and updates their existing JavaScript
paths. Commit both source and generated JavaScript. `check:types` recompiles in
isolation and rejects missing or stale runtime modules without editing them.

Installed CLI, plugin and MCP users continue to execute the committed JavaScript
directly on Node 24 or 26. They need neither TypeScript nor a runtime loader, and
installation does not invoke build scripts. This also avoids native TypeScript
execution restrictions inside installed dependency directories.

The remaining JavaScript has not yet been migrated or certified by this gate.
Move modules in useful groups, starting at structured data boundaries. Reuse and
refine the shared contracts as those producers and consumers become checked.
Compilation and verifier projections are initial shared contracts; their existing
JavaScript implementations remain runtime validated and are not yet type checked.
Preserve external JSON validation, installed-package tests, and the Rust/JavaScript
conformance checks throughout the migration.
