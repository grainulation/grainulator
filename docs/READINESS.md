# Grainulator 2.0.0 verification record

The source release is [v2.0.0 on GitHub](https://github.com/grainulation/grainulator/releases/tag/v2.0.0); no npm package is published. The checkpoint notes below preserve the tests and remaining limits recorded during preparation. Release authorization does not turn unperformed provider or customer-task checks into passes.

The verification notes below retain the September 7–8, 2026 local checkpoints. They establish their stated artifact and test scope, not a remote CI result for the release branch.

## Implemented

- One Grainulator MCP server with 19 canonical tools and 7 resources. New callers use `add_claim`, `compile`, memory and export tools; prior names remain hidden compatibility aliases.
- Canonical CLI/help, task-driven workflows, and Auto/Manual next steps. Canonical initialization changes sprint data only; unknown commands cannot silently initialize a project.
- Source provenance and linked corroboration survive mutation, search and compilation. Invalid tags, conflict lists and sources are rejected before writing.
- Exports cannot overwrite ledgers, compilation, host settings or their own source; CSV retains canonical claim fields. Memory metadata cannot corrupt collection identity or integrity. Path checks cover nonexistent descendants and symlink escapes.
- Static product and organization artifacts use native clean playground routes. The public artifact supports configuration/import/export with explicit local execution instructions; it never probes a nonexistent API or asks for a key. Local previews retain model execution.
- Dashboard app, connectors and notification hook removed. Native hosts own permissions and remote access. Original repositories remain untouched.
- Node 24 is the public minimum; local tests use Node 25 by default. `.nvmrc`, `.node-version`, package engines and prepared CI agree. Global runtimes were not changed.

## Verification

Both official Node 24.20.0 and Node 25.9.0 pass all workspace suites, isolated archive installation and static builds on this Mac. The matrix record is `.dogfood/node-matrix-audit.json`, with per-version component/core logs. These are local checkpoint results. Check the release branch’s CI result for the current commit separately; this record does not establish a remote pass.

Installed MCP tests exercise the full evidence → memory → export path, hidden aliases and resources. Independent review reproduced and fixed export corruption, lost provenance, malformed metadata, broken memory identity, missing-path containment and CSV field loss. A legacy CLI test was also fixed to isolate its initialization; confirmed test-generated instructions/data/hook were backed up locally and removed, restoring repository state.

Actual Codex/Astra and Claude/Fable sessions passed MCP tool use, native continuation, interruption during a pending tool, and recovery into the same fixture session without lost or duplicated claims. The actual research CLI passed SIGINT during streaming and export/continuation with completed passes preserved. See [recovery](RECOVERY.md) and `.dogfood/host-recovery-audit.json`.

Static artifact/browser checks cover responsive layouts, native routes, old links, safe exports, privacy and the public/local execution boundary. Runtime conformance covers 34 driver/gate/lesson checks. Final lint, browser, runtime, migration and installed-host verification is recorded in `.dogfood/final-acceptance.json` and associated logs.

The broader frozen model evaluation completed 24 paired trials per model across 12 new cases. It found no general semantic accuracy or efficiency gain; one incorrect repair was rejected by the verifier. Product scope copy and [evaluation results](EVALUATION.md) reflect the measured limits.

## Installed-build follow-up

The later packaged-product review found gaps that the earlier checkpoint did not cover: unsupported Node versions received a green doctor result, onboarding fixes had not reached installed copies, and native plugin/subagent discovery differed from direct MCP. Source fixes alone do not close those findings.

Local archives now have a unique prerelease version and a file manifest checked by `doctor`. Verify the same build at the npm installation, marketplace copy, and host cache, then test a fresh host session. The installed Node 22 rejection and Claude's nested plugin tool call have passed. Codex 0.153.4 native plugin calls and exact-session retrieval have also passed with an explicit workspace binding; this does not establish automatic project discovery or desktop-process configuration. Direct MCP success is a separate result. See [plugin acceptance](PLUGIN-TESTING.md) for the required host setup and evidence, and the consumer's current-status report for the exact artifact tested.

## Manual acceptance recorded at the checkpoint

A subsequent [blind-spot review](BLIND-SPOTS.md) found and fixed memory concurrency, CLI/MCP store consistency, provenance, presentation accessibility, and newcomer documentation gaps. That review also records remaining claim-lifecycle and organization-source cleanup gaps; the earlier matrix is a checkpoint, not evidence for every later edit.

- Configure `OPENAI_API_KEY` or `OPENROUTER_API_KEY` locally and run the corresponding `scripts/provider-live-check.mjs` command. Current reports correctly say blocked and record zero calls.
- Test a real installed session, including evidence, verification and export/resume. Only afterward decide whether to authorize publication or archival.

Known scope limits remain explicit: native-host behavior is tested on the available versions, local locks coordinate cooperating writers, checkpoints cannot preserve incomplete output, and the managed runner is not a sandbox. Compiler readiness validates ledger structure; it does not certify source truth or universal product readiness.

Research limits are per pass, not a whole-session spending cap. Retries and repeated passes can multiply requests. A citation's presence is not independent verification that its source exists or supports the conclusion.
