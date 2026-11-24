# TypeScript source and generated runtime

All maintained first-party JavaScript-family modules have canonical TypeScript sources under `typescript/`. This includes the CLI and hooks, private workspaces, research/providers, evidence/compiler, memory, exports, orchestration, release and migration tooling, evaluations and tests. Rust, shell, JSON data and documentation remain in their native formats.

## Editing and verification

Edit the canonical source instead of its generated runtime file. The source/output inventory is `typescript/outputs.json`:

- `.ts` produces the corresponding `.js` path.
- `.mts` produces the corresponding `.mjs` path.
- `.cts` produces the corresponding `.cjs` path.

The mirrored exports package boundary preserves CommonJS. CommonJS sources use typed imports and `export =`; NodeNext resolves the existing runtime import suffixes to their canonical TypeScript sources. Type-only declarations have no runtime artifact.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run build:types
npm run check:types
npm run lint
npm test
```

The full graph uses strict checking, unchecked index checking, exact optional properties and verbatim module syntax with Node 24 declarations. Runtime validation remains responsible for external JSON, provider responses, tool inputs and stored evidence; static types do not establish source truth or evidence quality.

`build:types` compiles in an isolated temporary directory, checks the complete output inventory and formatting, then writes the generated runtime modules. Commit source, inventory and generated files together. `check:types` recompiles without changing them and rejects stale, missing, orphaned or handwritten first-party runtime files. Adding or retiring a module requires updating its source/output inventory through the build workflow.

Lint runs on the maintained TypeScript and repository configuration. Generated JavaScript is checked through exact regeneration and runtime acceptance; type-erased output is not independently hand-formatted or lint-edited.

Generated runtime files carry a source banner, with CLI shebangs kept first. GitHub treats those files as generated through `.gitattributes`; the maintained source is TypeScript.

## Installation compatibility

Installed CLI, plugins and MCP users execute generated JavaScript at the existing paths on Node 24 or 26. They need no TypeScript compiler, runtime loader or lifecycle build. Generated scripts and tests retain their original relative runtime paths, and normal product archives retain their existing CLI/MCP layout.

After any final shipped-output change, regenerate `build-info.json` with `npm run build:identity` and verify installed-package, native/converter and security acceptance. The converter remains a separately verified archive, and the Rust/JavaScript runtime conformance gate remains required.
