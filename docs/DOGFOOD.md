# Grainulator 2.0.0 dogfood

This guide exercises the v2.0.0 GitHub release. The root npm package is private and is not published to npm. Retained component identifiers support compatibility; component workspaces remain private. The repository preserves existing history and stars. Local setup does not alter global agent configuration.

## Start here

Use Node 24 or later; Node 25 is the local default. The following commands are for the full source checkout. For an installed archive, follow [INSTALLATION.md](INSTALLATION.md); use its installed CLI for `doctor`, `demo`, and `preview`. Source tests, development dependencies, and the sibling organization site are not included in that archive.

```sh
npm ci --ignore-scripts
node bin/grainulator.js doctor
node bin/grainulator.js demo
npm run dev
```

`demo` deliberately produces a wrong answer, feeds an independent verifier's failure back to a deterministic adapter, and verifies its corrected answer. It is an offline protocol fixture, not evidence of model-quality improvement. Run traces appear under `.dogfood/demo/.grainulator/runs/`.

The preview server prints http://127.0.0.1:4517 (Grainulator) and http://127.0.0.1:4518 (Grainulation). Grainulator has a refreshed homepage and a configurable research playground at `/playground`. The playground has a static background, a mascot/home header aligned with the homepage, and export/import of sessions that the CLI can actually resume. See [RESEARCH.md](RESEARCH.md) for models, credentials, configuration, and continuation. The rebuilt Grainulation organization site presents one flagship product, Grainulator, and links into the local product preview. Its layout, copy, and metadata replace the old standalone-tool catalog. The server binds to loopback; it serves assets plus a local research API. Stop it with Ctrl-C. The organization site defaults to the sibling `grainulation-dogfood/site`; override with `GRAINULATION_SITE_DIR`.

Use the homepage's three stage buttons to inspect an approval, a stale-evidence block, and a fresh compilation. These are recorded decisions from the actual local engine using synthetic release claims. Reproduce the artifact with `node scripts/record-handoff.mjs`. No model comparison or publication occurs.

## Exercise real evidence operations

```sh
mkdir -p .dogfood/my-sprint
node bin/grainulator.js init --dir .dogfood/my-sprint \
  --question 'Can this build support my daily workflow?' \
  --audience self --constraints 'Local only' --done 'A tested answer with remaining limitations'
node bin/grainulator.js add --dir .dogfood/my-sprint \
  --id r001 --type factual --topic installation \
  --content 'The local doctor check passed on this machine' --evidence tested
node bin/grainulator.js compile --dir .dogfood/my-sprint --summary
node bin/grainulator.js status --dir .dogfood/my-sprint
node bin/grainulator.js connect --dir .dogfood/my-sprint
```

Use `tested` only after performing the stated check. The final command prints an MCP configuration; apply it to the host you choose. For a real model or agent in a managed loop, see [ADAPTERS.md](ADAPTERS.md).

## Components

`evidence`, `check`, `memory`, `export`, `analytics`, and `orchestrate` forward arguments to the consolidated components. Existing package names remain workspace aliases.

## Verification from a source checkout

```sh
npm test
npm run test:core
node packages/runtime/test/conformance.mjs
npm run check:package
```

Run Rust conformance from `packages/runtime` using `node test/conformance.mjs` if invoking an older imported script. Rust/Cargo are needed for this check, not for the JavaScript CLI. With the preview server running and Playwright Chromium installed, `npm run test:site` checks responsive behavior, shared links, cancellation, and pipeline latency using simulated provider responses. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when using an existing browser installation. Results are in `.dogfood/workbench-results.json`.

Results from `npm test` are saved in `.dogfood/test-results.json` and `.dogfood/test-logs/`.

## What changed

- Eight source components now resolve inside one npm workspace.
- Claim mutations share a local transaction lock; read operations do not rewrite the ledger.
- Conflict-resolution reasons persist in the ledger and compiled output.
- Guards require recognized compilation status and a matching input certificate.
- Memory imports preserve sprint metadata and allocate IDs without collisions.
- The command runner distinguishes verified, unverified, stalled, cancelled, errored, and exhausted runs.
- The browser demo preserves questions on research failure, labels sample output, handles malformed shared links, and excludes model requests from its cache.
- One `grainulator` MCP server exposes claims, memory and exports through local source paths.
- Next steps appear as Auto and Manual lists; authorized work continues without repeated permission prompts.

## Limits and recovery

The ledger remains JSON during this compatibility stage. Transaction locks coordinate these updated CLI/MCP mutations and memory imports on a local filesystem. Direct editor writes and older tools do not participate. A crashed writer leaves `claims.json.lock/owner.json`; inspect the PID and confirm the writer stopped before removing that lock. Age alone never authorizes stealing it. Atomic rename prevents partial reads; power-loss durability and network-filesystem locking are not promised.

SQLite/event-log migration and additional host contracts remain future work. The completed synthetic model evaluations and their limits are documented in [EVALUATION.md](EVALUATION.md); broader customer-task evaluations remain open. No model-quality improvement is claimed from the deterministic demo or package tests. Imported legacy installers are retained for compatibility but are not run by dogfood setup.

The source inventory records original commit IDs, imported file hashes, and included local edits in `source-imports.json`. Original histories remain in their existing repositories. The GitHub source release is v2.0.0. Future releases require passing CI and the user’s release authorization; npm publication and repository archival remain separate decisions.

Report issues with the command, expected behavior, observed behavior, and a redacted run trace. Traces can contain task content and model output; inspect them before sharing.
