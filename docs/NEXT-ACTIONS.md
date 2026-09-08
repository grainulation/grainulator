# Next-step output contract

Grainulator presents next steps as two lists, **Auto** and **Manual**. When the user asks only for next steps, the response contains only those lists. Each item is a short action, with a concrete command where useful. Reasons, claim counts and status recaps stay out of this presentation.

Auto contains work the agent can continue within existing authorization. Manual contains actions, decisions or access that actually require the user. The host classifies suggestions against the current request and constraints; a compiler suggestion never grants permission. Empty groups display `None.`. There is no quota of human approvals, and requesting a list without execution does not itself create an approval requirement.

The shared policy in `packages/evidence/lib/next-actions.cjs` produces `next_actions: { auto: [], manual: [] }` for compiled artifacts, CLI, MCP and background reminders. Each action retains `command`, `label`, `reason` and `claim_ids` for inspection. The compiler's evidence operations start in Auto; the host moves dependent work to Manual when current task context requires it. It prioritizes blockers, substantive evidence gaps and active risks. Stated user constraints do not need manufactured corroboration. `meta.excluded_topics` removes retired topics from recommendations without deleting evidence or suppressing compiler validation.

The tips hook recompiles after each mutation under its lock. It no longer treats a compilation less than five seconds old as current or truncates actions into a 180-character summary. `off` disables background work; `quiet` surfaces only compiler blockers. MCP status checks the input certificate and requests recompilation when the snapshot is stale, without rewriting the ledger.

## Verification

- Eight focused regressions cover presentation, policy, CLI/MCP parity, stale status, legacy schema hashes, consecutive edits and hook preferences.
- All 40 core checks and the plugin/eight-component suite pass. The lint check passes with existing informational/style diagnostics.
- All 24 clean-consumer archive checks pass, including grouped CLI/MCP output and permission-app removal.
- The first real Codex/Astra and Claude/Fable checks reproduced unwanted recaps. After tightening the tool instruction and compile presentation, both passed the unchanged synthetic check, returning only the lists and assigning user-supplied production access to Manual.

Audit artifacts are `.dogfood/test-results.json`, `.dogfood/package-isolation-audit.json`, `.dogfood/initial-next-actions-host-audit.json`, and `.dogfood/next-actions-host-audit.json`. Reproduce the live test with `node scripts/next-actions-host-check.mjs` after `npm run test:install`; it uses existing host sign-ins and synthetic fixture data.

Host output compliance remains model behavior, not hard enforcement. These results cover one synthetic case per host. This checkpoint covered the local dogfood checkout and its packed test artifact. It did not verify installed plugin caches; see [plugin acceptance](PLUGIN-TESTING.md) for the separate installed-build and cache checks.
