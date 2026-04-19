---
name: healthcheck
description: Fast pre-flight health check for all Grainulator MCP servers. Pings each server once, reports status in a table, and provides exact fix commands for any that are down. Use before starting any Grainulator session to avoid wasting time on MCP disconnections.
tools:
  - mcp__wheat__wheat_status
  - mcp__silo__silo_list
  - mcp__mill__mill_formats
  - Bash
---

# /healthcheck -- Pre-flight MCP server verification

Fast health check for all Grainulator MCP servers. One ping per server, no retries, immediate fix commands if anything is down.

## Arguments

$ARGUMENTS

## Instructions

### Step 1: Ping all three servers in parallel

Call these three tools simultaneously (in a single message):

1. `wheat_status` — verifies the Wheat claims engine
2. `mill_formats` — verifies the Mill format converter
3. `silo_list` — verifies the Silo knowledge store

### Step 2: Report results

Print a status table:

```
Grainulator Health Check
========================
  wheat  ✓ healthy   — claims engine
  mill   ✓ healthy   — format conversion
  silo   ✓ healthy   — knowledge storage

All servers operational.
```

If any server fails, show:

```
Grainulator Health Check
========================
  wheat  ✗ FAILED    — claims engine
  mill   ✓ healthy   — format conversion
  silo   ✓ healthy   — knowledge storage

Fix commands:
  wheat: claude mcp add wheat -- npx -y -p @grainulation/wheat wheat-mcp
```

### Step 3: Diagnose failure class (only if a server failed)

Distinguish two failure types by the error message:

1. **"tool not found"** or **"not registered"** — the MCP server is not connected. Fix: re-add it.
2. **"tool call failed"** or **timeout** — the server is registered but the process crashed or network is down. Fix: check Node.js/network, then re-add.

### Step 4: Provide fix commands

If Wheat failed:
- Re-add: `claude mcp add wheat -- npx -y -p @grainulation/wheat wheat-mcp`

If Mill failed:
- Re-add: `claude mcp add mill -- npx -y @grainulation/mill serve-mcp`

If Silo failed:
- Re-add: `claude mcp add silo -- npx -y @grainulation/silo serve-mcp`

### Step 5: Host-capability probe (Claude Code version drift)

After the three MCP pings succeed, verify the Claude Code host exposes
the APIs grainulator needs. If Anthropic ships a breaking change in a
minor version, this is how we detect it before the user sees silent
hook failures.

Check presence of each of these capabilities by inspecting your own
tool availability (no network call needed):

1. **Hook events in use:** PreToolUse, PostToolUse, SessionStart,
   SessionEnd, Stop. Report any that appear unavailable.
2. **Skill loader:** `${CLAUDE_PLUGIN_ROOT}` env var resolves to the
   installed grainulator path. Verify by running (via Bash):

   ```bash
   echo "${CLAUDE_PLUGIN_ROOT}" | head -c 200
   test -f "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" && echo "plugin manifest found"
   ```

   If the manifest is not found, the host's plugin path conventions
   have drifted — surface this clearly so the user knows why their
   skills may behave oddly.
3. **Tool-call protocol:** the MCP pings above already exercise this;
   if they succeeded, the tool-call path is healthy.

If any capability check fails, append to the status table:

```
  host   ⚠ degraded  — <which capability> unavailable
         → Claude Code may have introduced a breaking change.
           Check release notes at https://claude.com/claude-code.
           grainulator >= 1.6.2 requires: PreToolUse/PostToolUse hooks,
           CLAUDE_PLUGIN_ROOT path resolution, MCP stdio protocol.
```

Do not block the user. Do surface the signal — a "degraded" row tells
them which layer to investigate when skills misbehave.

### Rules

- Do NOT retry a failed server. One attempt only. Report and move on.
- Do NOT block the user from working if a server is down — suggest the fix and let them decide.
- Total execution time should be under 10 seconds (Step 5 adds ~1s of filesystem check).
- If ALL servers fail, suggest the user check their network connection and Node.js installation first.
- If the host-capability probe flags degraded, suggest running
  `claude --version` and comparing against the grainulator minimum.
