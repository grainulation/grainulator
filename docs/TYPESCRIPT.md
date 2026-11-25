# TypeScript source and compiled artifacts

Git tracks maintained TypeScript under `typescript/`, the small `bootstrap/` launcher, Rust, shell, configuration and data. Compiled `.js`, `.mjs`, `.cjs` and `build-info.json` are ignored build artifacts. They are included in CI/release packages, not committed to the code branch.

## Build from source

Use Node 24 or 26:

```sh
npm ci --ignore-scripts
npm run check:source
npm run typecheck
npm run build
npm run check:types
npm run lint
npm test
```

The first build runs `typescript/scripts/typescript-build.mts` directly using Node's built-in support for erasable TypeScript. It uses only Node built-ins and needs no generated JavaScript bootstrap. The pinned development compiler emits the complete graph at the existing runtime paths, preserving installed imports and executable entry points. Local outputs stay ignored by Git.

`typescript/outputs.json` is the reviewed source/output inventory: `.ts` maps to `.js`, `.mts` to `.mjs`, and `.cts` to `.cjs`. Normal builds reject stale inventory before writing outputs; after intentionally adding or retiring a module, review `npm run update:types` and commit the inventory with its source. Builds reject handwritten/orphaned JavaScript and finish compiling/formatting before publishing output. `check:types` compares output bytes with fresh compilation; `check:source` also rejects tracked JavaScript or build identity files.

Strict checking covers the full graph with unchecked index access, exact optional properties, verbatim module syntax and Node 24 declarations. The built-ins-only plugin bootstrap has a separate strict configuration. External inputs still need runtime validation; types do not establish evidence truth.

## Release and plugin installation

The release pipeline extracts the selected Git commit into a private stage, installs that snapshot's exact locked build dependencies from an integrity-checked npm cache, compiles it, generates its identity and packages the result. Base and separate converter builds never use the caller's ignored or dirty JavaScript. Installed users receive compiled code without a compiler, dependency installation or lifecycle build. The final Docker image also contains the built package rather than the compiler or source tree.

`bootstrap/plugin-entry.mts` is a small Node-native launcher used only by source-checkout manifests. Build emits `bootstrap/plugin-entry.mjs`; packaging stages compiled MCP/hook definitions that point to it. Release packages contain no TypeScript source, including inside `node_modules`, where Node forbids type stripping. `npm run pack:artifact -- --out /absolute/new-output` creates this compiled install tree without changing tracked source configuration. Raw `npm pack` on a source tree is not the supported plugin packager. A source-only marketplace checkout delegates to an already installed matching Grainulator CLI; it never builds, downloads or installs code. Version, bridge protocol and current canonical-source compatibility must match before dispatch, including when the CLI and plugin share a previously built checkout. CLI integrity is checked against its manifest; trusted release/Homebrew installation supplies publisher provenance. See [agent setup](AGENT-SETUP.md).

Cold-build regressions start without any generated modules, preserve executable modes and tracked inputs, and verify deterministic regeneration. Package checks independently require the intended compiled inventory before trusting its identity. Isolated acceptance tests cover the actual Claude/native source-plugin commands and hook exit behavior against a separately installed archive. Full interactive host discovery remains a separate check.
