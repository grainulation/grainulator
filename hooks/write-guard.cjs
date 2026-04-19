#!/usr/bin/env node
/**
 * write-guard.cjs -- PreToolUse hook that blocks direct writes to managed wheat files.
 *
 * Invoked on Write/Edit tool calls. Reads CLAUDE_HOOK_CONTEXT from the environment
 * (JSON blob provided by Claude Code) and extracts tool_input.file_path. If the path
 * targets a protected wheat file (claims.json or compilation.json), prints a clear
 * error to stderr and exits 1 to block the tool call.
 *
 * Protected files:
 *   - claims.json      -- must be mutated via wheat MCP tools
 *   - compilation.json -- auto-generated; regenerate via wheat_compile
 *
 * This file exists because embedding this logic as `node -e "..."` inside hooks.json
 * makes it Windows-fragile -- cmd.exe parses nested quotes, backticks, and escapes
 * differently than zsh/bash, so the guard can silently fail-open on Windows.
 *
 * Zero dependencies -- uses only Node.js built-ins. Matches prior inline behavior
 * exactly (same exit codes, same stderr messages).
 */

"use strict";

let ctx;
try {
	ctx = JSON.parse(process.env.CLAUDE_HOOK_CONTEXT || "{}");
} catch {
	// Malformed context -- fail open rather than blocking legitimate writes.
	process.exit(0);
}

const filePath = (ctx.tool_input && ctx.tool_input.file_path) || "";

if (filePath.endsWith("/claims.json")) {
	process.stderr.write(
		"BLOCKED: Direct writes to claims.json are not allowed. Use wheat MCP tools instead:\n" +
			"  - wheat_add-claim: add a new claim\n" +
			"  - wheat_resolve: update or resolve an existing claim\n" +
			"  - wheat_compile: recompile sprint state\n" +
			"File blocked: " +
			filePath +
			"\n",
	);
	process.exit(1);
}

if (filePath.endsWith("/compilation.json")) {
	process.stderr.write(
		"BLOCKED: Direct writes to compilation.json are not allowed. This file is auto-generated.\n" +
			"Run wheat_compile to regenerate it.\n" +
			"File blocked: " +
			filePath +
			"\n",
	);
	process.exit(1);
}

process.exit(0);
