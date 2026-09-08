---
name: setup
description: Set up the local Grainulator MCP connection, check capabilities, and initialize the requested sprint.
tools:
  - mcp__grainulator__status
  - mcp__grainulator__init
  - mcp__grainulator__memory_list
  - mcp__grainulator__exports_formats
  - Bash
  - Read
---

# /setup — Configure Grainulator

Locate the installed checkout and run `node <checkout>/bin/grainulator.js doctor`. Node.js 24 or later is required; Node 25 is the local default. This checks local components without changing global host settings.

Grainulator uses one local MCP server named `grainulator`. Check `grainulator.status` with the intended sprint directory, `grainulator.memory_list`, and `grainulator.exports_formats`. A missing sprint is not a broken connection. Report which capability failed and its actual error; continue independent local work through the CLI.

For a host that has not loaded the plugin, `grainulator connect --dir <sprint>` prints the connection configuration. Apply it only in the host scope the user authorized. In Claude Code the plugin registers its server automatically; inspect existing configuration before adding another entry. A host restart or plugin reload may be needed after changing registration. Do not remove existing entries or alter global settings as a routine troubleshooting step.

For the native Codex plugin, bind the workspace explicitly before starting a fresh host process: `GRAINULATOR_WORKSPACE=/absolute/path/to/project codex` (or `codex exec ...` with the same environment). Use an existing absolute project directory that contains the intended sprint. Codex starts plugin servers in the package cache, so its current plugin directory is not your workspace. Without the binding, discovery can succeed but tool calls return a configuration-required error and do not write. For Codex Desktop, the variable must reach the actual app process; do not assume a terminal export reaches an already running app.

Alternatively, run `node <checkout>/bin/grainulator.js connect --dir /absolute/path/to/project` and register that direct MCP connection in the authorized host scope. It binds the workspace through `--dir` and does not require the native plugin environment variable. Direct MCP access does not install or verify bundled skills, agents, or hooks. After either setup, require a real status call on the intended sprint before reporting success.

External connectors such as DeepWiki and Confluence are optional. Their absence does not block local evidence operations, memory or document exports. Check for their tools only when the task needs them; use local sources or available web tools otherwise.

Use the active sprint supplied in the request or repository instructions. If none exists and the request provides a question, run the init workflow in a dedicated directory. Infer routine audience and completion criteria from the task; ask only for essential missing information. Never repurpose an unrelated ledger.

Summarize connection results briefly. Continue the user’s requested work when setup succeeds. If setup was the whole request, provide the Auto and Manual next actions below.
## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
