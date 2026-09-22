---
name: healthcheck
description: Check the unified Grainulator MCP server and local CLI without blocking useful work on optional connectors.
allowed-tools:
  - mcp__grainulator__status
  - mcp__plugin_grainulator_grainulator__status
  - mcp__grainulator__memory_list
  - mcp__plugin_grainulator_grainulator__memory_list
  - mcp__grainulator__exports_formats
  - mcp__plugin_grainulator_grainulator__exports_formats
  - Bash
  - Read
---

# /healthcheck — Verify the local connection

Check the three capability groups exposed by the single `grainulator` server:

- `grainulator.status` with the active sprint `dir`: evidence operations. No sprint found is a valid connected response.
- `grainulator.memory_list`: local knowledge storage.
- `grainulator.exports_formats`: document conversion.

Batch independent checks where the host supports it. Distinguish an unavailable tool from a connected tool returning an application error. Report actual results; an advertised tool alone does not prove a successful call.

If MCP is unavailable, run `node <checkout>/bin/grainulator.js doctor` and continue through the local CLI. Generate the intended connection with `grainulator connect --dir <sprint>`. In a plugin host, reload its registration before adding duplicates; in another host, use its supported local MCP configuration. Do not silently edit global settings.

Check optional external connectors only when needed. Their failure does not make the core connection unhealthy. Hooks are host-specific: an MCP ping does not prove that PreToolUse or PostToolUse fired. Report hook behavior as unverified unless exercised. CLI and MCP remain usable in hosts without hooks; skills still supply the next-step output contract.

Keep diagnostics concise and continue already authorized work. List any action that truly needs the user under Manual; otherwise use Auto.
## Pinned host limitation

Codex CLI 0.155.1 skips hook loading for portable AgentPlugin manifests. Direct MCP success does not establish hook discovery or write protection. On this host, explicitly run `compile` after evidence mutations and before reading next actions. Do not bypass trust settings or add unsupported manifest fields. Recheck native hook discovery when the host changes; direct hook harnesses only test handlers.

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
