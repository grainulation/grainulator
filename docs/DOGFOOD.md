# Local Grainulator verification

Use Node 24 or later with the source checkout. For installed archives follow [installation](INSTALLATION.md); source tests and development dependencies are not included in those archives.

```sh
npm ci --ignore-scripts
node bin/grainulator.js doctor
node bin/grainulator.js demo
node bin/grainulator.js research --question "Can this session start without a browser?" \
  --dir ./research-session --prepare-only
```

The demo uses a deterministic adapter and independent verifier. It deliberately fails its first answer, then verifies the repair. It is an offline protocol fixture and does not measure model quality. Headless preparation writes a portable session with no provider access; see [research](RESEARCH.md) for explicit execution and continuation.

## Evidence and MCP

```sh
node bin/grainulator.js init --dir ./my-sprint \
  --question 'Can this build support my workflow?' --audience self \
  --constraints 'Local only' --done 'A tested answer with remaining limitations'
node bin/grainulator.js add --dir ./my-sprint \
  --id r001 --type factual --topic installation \
  --content 'An illustrative local claim' --evidence stated
node bin/grainulator.js compile --dir ./my-sprint --summary
node bin/grainulator.js status --dir ./my-sprint
node bin/grainulator.js connect --dir ./my-sprint
```

Use tested evidence only after performing the stated check. Connect prints registration data; it does not change host settings. The root CLI/MCP surface provides evidence, memory, exports, analytics and orchestration. Historical product aliases and component servers are retired.

## Source verification

```sh
npm test
npm run test:core
npm run test:runtime
npm run check:surface
npm run check:package
npm run test:install
```

Rust/Cargo is required for native conformance, not for ordinary JavaScript CLI operations. Tests use local fixtures. Results live in `.dogfood/test-results.json` and `.dogfood/test-logs/`. Paid-provider and actual native-host tasks remain separate acceptance scopes.

## Limits and recovery

Local locks coordinate cooperating writers, not arbitrary external edits or all network filesystems. Preserve lock owners, histories and uncertain effects when recovering interrupted work; see [recovery](RECOVERY.md), [native runtime](RUNTIME.md) and [upgrading](UPGRADING.md).

The synthetic evaluations and their limits are documented in [evaluation](EVALUATION.md). No universal quality or cost gain is claimed. Review traces before sharing because they may contain task content and model output. Original imported-source identities remain in `source-imports.json`.
