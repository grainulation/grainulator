---
name: setup
description: Guide the user through verifying Grainulator's MCP servers are running, explain what each server does, handle optional dependencies, and initialize a first sprint if none exists. Use when the plugin is first installed, when MCP servers fail to connect, or when the user asks for help setting up Grainulator.
tools:
  - mcp__wheat__wheat_status
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__silo__silo_list
  - mcp__mill__mill_formats
  - Bash
  - Read
  - Write
---

# /setup -- Configure and verify Grainulator

The user wants to set up Grainulator or verify that all MCP servers and dependencies are working correctly.

## Arguments

$ARGUMENTS

## Instructions

### Phase 1: Verify core MCP servers

Grainulator bundles three core MCP servers that run locally via `npx`. Check each one in order:

1. **Wheat** (research claims engine)
   - Purpose: Manages typed claims (`claims.json`), compiles sprint state, resolves conflicts, and searches across claims. This is the backbone of every research sprint.
   - Verify: Call `wheat_status`. If it returns sprint data or a "no sprint found" message, the server is healthy.
   - If it fails: The `@grainulation/wheat` npm package may not be accessible. Ask the user to run `npx -y @grainulation/wheat` manually to check for npm/network issues.
   - Env: `WHEAT_ROOT` defaults to `.wheat` (relative to the working directory).

2. **Mill** (format conversion engine)
   - Purpose: Converts between document formats (Markdown, HTML, PDF). Used by `/brief` and `/present` to produce output artifacts.
   - Verify: Call `mill_formats`. If it returns a list of supported formats, the server is healthy.
   - If it fails: The `@grainulation/mill` npm package may not be accessible. Same troubleshooting as Wheat.

3. **Silo** (knowledge storage)
   - Purpose: Stores and retrieves knowledge packs, manages a graph of connected concepts, and integrates with Confluence. Used by `/research` and `/pull` for knowledge reuse across sprints.
   - Verify: Call `silo_list`. If it returns a list (even empty), the server is healthy.
   - If it fails: The `@grainulation/silo` npm package may not be accessible. Note that Silo uses `${CLAUDE_PLUGIN_DATA}/silo` for persistent storage.

Report the status of each server:

```
MCP Server Status:
  wheat  ✓ running  (claims engine)
  mill   ✓ running  (format conversion)
  silo   ✓ running  (knowledge storage)
```

If any server fails, show the error and suggest a fix. Do NOT proceed to Phase 2 until all three core servers are confirmed running.

### Phase 2: Check optional dependencies

4. **DeepWiki** (external, optional)
   - Purpose: Provides read access to public GitHub repository documentation via MCP. Used by `/research` when investigating open-source projects. This is an HTTP MCP server hosted at `https://mcp.deepwiki.com/mcp` -- Grainulator does not control it.
   - Verify: Check if `mcp__deepwiki__ask_question` appears in the available tools list. If the tool is listed, the server connected successfully.
   - If unavailable: This is **expected and non-blocking**. DeepWiki is a convenience for researching public repos. All core Grainulator functionality works without it. Tell the user:
     > DeepWiki is optional. If it's unavailable, `/research` will use WebSearch and direct code reading instead. No action needed.
   - Do NOT treat DeepWiki failure as a setup failure.

Report:

```
Optional Dependencies:
  deepwiki  ✓ connected  (GitHub repo docs -- optional)
```

or:

```
Optional Dependencies:
  deepwiki  ✗ unavailable  (GitHub repo docs -- optional, not required)
```

### Phase 3: Check for existing sprints

5. Look for existing sprints in `.wheat/sprints/`. If sprints exist, list them with their question and phase:

```
Existing sprints:
  marketplace-submission  (phase: research, 22 claims)
  gamification-playbook   (phase: define, 3 claims)
```

6. If **no sprints exist**, offer to initialize one:

> No sprints found. Would you like me to start one? Tell me your research question and I'll run `/init` to set it up.

If the user provides a question (either as $ARGUMENTS or in conversation), proceed to run the `/init` workflow to create the first sprint.

### Phase 4: Summary

Print the final setup report:

```
Grainulator setup complete.

Core servers:    3/3 running
Optional deps:   1/1 connected (or: 0/1 -- deepwiki unavailable, non-blocking)
Active sprints:  <count>

You're ready to go. Try:
  /research <topic>  -- start investigating
  /status            -- view sprint dashboard
  /init <question>   -- start a new sprint
```

## Troubleshooting notes

- **All three core servers use `npx -y`**, so they download on first run. First-run latency of 5-15 seconds is normal.
- **Node.js is required.** If `npx` is not found, the user needs to install Node.js (v18+ recommended).
- **Network required for first run** since packages are fetched from npm. After the first run, npx caches them locally.
- **WHEAT_ROOT** can be overridden if the user stores sprint data in a non-default location.
- **Silo persistence**: Silo stores data in `${CLAUDE_PLUGIN_DATA}/silo`. This survives plugin updates but is deleted on uninstall (unless `--keep-data` is used).
