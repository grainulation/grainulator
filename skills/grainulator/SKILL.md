---
name: grainulator
description: Use Grainulator to carry a substantial research or engineering task through investigation, implementation, and evidence-backed verification. Use when the user invokes /grainulator or asks for a tracked Grainulator workflow.
---

# Grainulator

Preserve the user's requested outcome. A request to build ends with working changes and verification, not a research brief alone.

Locate this checkout's `bin/grainulator.js`. Use `node <checkout>/bin/grainulator.js doctor` to check local components. Prefer available Grainulator MCP tools; otherwise use the CLI. Host-specific slash commands are workflow names when the host cannot execute them.

Create a dedicated sprint directory with `grainulator init --dir <sprint> --question <question> --audience <audience> --constraints <constraints> --done <done criteria>`. Always pass that directory to subsequent tools. Do not repurpose an unrelated sprint or overwrite an existing ledger.

Investigate the questions that determine implementation choices. Record constraints, findings, risks and verification results using `grainulator add`. Evidence tiers describe the supporting material: an agent's assertion is not a test result. Compile after a meaningful pass or change of direction; use the feedback to choose the next useful action.

For implementation tasks, inspect repository instructions, preserve existing edits, make the changes, and run relevant checks. Record which checks actually ran and what they established. Continue useful work while optional preferences are pending; do not infer approval for a dependent action.

Use the host's existing model and tools. CLI and MCP access provide evidence operations; they do not themselves give permission to intercept tool calls or enforce host completion. For a managed external command loop, consult `docs/ADAPTERS.md` in the checkout. Ordinary host use does not require that runner.

Deliver working artifact paths, commands the user can run, verification evidence, and any remaining limitations. Publishing, deployments, messages to others, and repository archival require the user's authorization for those actions.

## Verification scope

Carry existing unresolved findings forward, including failures in a pasted review. For each material result, identify the source revision or build, installed package and cache version when relevant, host version, and exact test scope. Mark untested layers explicitly; a source fix does not establish that an installed package or cached plugin is fixed.

Direct MCP success verifies that connection only. Full plugin acceptance must exercise native discovery and the relevant host behavior; subagent acceptance requires an actual nested tool invocation and its result. A subagent's assertion alone is not invocation evidence.

Close a finding only when a check of its original failing path passes on the affected artifact, or when supported evidence explicitly supersedes it. A generic user success report or a ready compiler does not close unrelated failures. Keep remaining gaps visible in status and next actions without inventing work or imposing test quotas.

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
