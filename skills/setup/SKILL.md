---
name: setup
description: Set up the local Grainulator MCP connection, check capabilities, and initialize the requested sprint.
allowed-tools:
  - mcp__grainulator__status
  - mcp__plugin_grainulator_grainulator__status
  - mcp__grainulator__init
  - mcp__plugin_grainulator_grainulator__init
  - mcp__grainulator__memory_list
  - mcp__plugin_grainulator_grainulator__memory_list
  - mcp__grainulator__exports_formats
  - mcp__plugin_grainulator_grainulator__exports_formats
  - Bash
  - Read
---

# /setup — Configure Grainulator

Locate the installed checkout and run `node <checkout>/bin/grainulator.js doctor`. Node.js 24 or later is required; Node 25 is the local default. This checks local components without changing global host settings.

For a 1.x upgrade or stale tools after an update, read `../../docs/UPGRADING.md`. Identify the actual loaded plugin/cache and installation scope before troubleshooting. A marketplace refresh, plugin update, and host restart are separate actions. Inspect pins and duplicate scopes; preserve host security wrappers and user configuration. Hidden old tool-name aliases work only on the new `grainulator` server, not the old server IDs or remote DeepWiki tool contract. Review stale generated Farmer instructions with the user’s scope in mind; do not rewrite unrelated `CLAUDE.md` rules or remove their research data.

Grainulator uses one local MCP server named `grainulator`. Check `grainulator.status` with the intended sprint directory, `grainulator.memory_list`, and `grainulator.exports_formats`. A missing sprint is not a broken connection. Report which capability failed and its actual error; continue independent local work through the CLI.

For a host that has not loaded the plugin, `grainulator connect --dir <sprint>` prints the connection configuration. Apply it only in the host scope the user authorized. In Claude Code the plugin registers its server automatically; inspect existing configuration before adding another entry. A host restart or plugin reload may be needed after changing registration. Do not remove existing entries or alter global settings as a routine troubleshooting step.

For the native Codex plugin, use the intended installed build's `node <checkout>/bin/grainulator.js setup --dir /absolute/path/to/project`, then restart Codex. This saves `~/.config/grainulator/workspace.json` without changing host settings, including for Codex Desktop. It changes the user's shared native workspace default, so choose the requested project; do not silently switch unrelated sessions. `GRAINULATOR_WORKSPACE=/absolute/path/to/project codex` (or `codex exec ...`) overrides the default for one launch. An absolute `GRAINULATOR_CONFIG` can select a separate config file. The directory must exist and contain the intended sprint. Codex starts plugin servers in the package cache, which is not the user's workspace. Missing or invalid configuration permits discovery but tool calls return a configuration-required error and do not write. Environment overrides must reach the actual app process; a terminal export does not update an already running app.

Alternatively, run `node <checkout>/bin/grainulator.js connect --dir /absolute/path/to/project` and register that direct MCP connection in the authorized host scope. It binds the workspace through `--dir` and does not require the native plugin environment variable. Direct MCP access does not install or verify bundled skills, agents, or hooks. After either setup, require a real status call on the intended sprint before reporting success.

External connectors such as DeepWiki and Confluence are optional. Their absence does not block local evidence operations, memory or document exports. Check for their tools only when the task needs them; use local sources or available web tools otherwise.

Use the active sprint supplied in the request or repository instructions. If none exists and the request provides a question, run the init workflow in a dedicated directory. Infer routine audience and completion criteria from the task; ask only for essential missing information. Never repurpose an unrelated ledger.

Summarize connection results briefly. Continue the user’s requested work when setup succeeds. If setup was the whole request, provide the Auto and Manual next actions below.
## Pinned host limitation

Codex CLI 0.155.1 skips hook loading for portable AgentPlugin manifests. Direct MCP success does not establish hook discovery or write protection. On this host, explicitly run `compile` after evidence mutations and before reading next actions. Do not bypass trust settings or add unsupported manifest fields. Recheck native hook discovery when the host changes; direct hook harnesses only test handlers.

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
