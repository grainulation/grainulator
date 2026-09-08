#!/usr/bin/env node
// Claude PreToolUse sends JSON on stdin. Exit 2 blocks; exit 1 does not.
// Keep the legacy environment input for older callers. This guards Write/Edit,
// not arbitrary shell commands or hosts that do not load the hook.
"use strict";
const fs = require("node:fs");
let context;
try {
	const input = process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8");
	context = JSON.parse(input.trim() || process.env.CLAUDE_HOOK_CONTEXT || "{}");
} catch {
	process.stderr.write(
		"Grainulator write guard: malformed hook context; no file decision made.\n",
	);
	process.exit(0);
}
const file = context.tool_input?.file_path;
const name =
	typeof file === "string"
		? file.replace(/\\/g, "/").split("/").pop().toLowerCase()
		: "";
if (name === "claims.json" || name === "compilation.json") {
	process.stderr.write(
		`BLOCKED: ${name} is managed evidence. Use grainulator.add_claim or grainulator.resolve for claims and grainulator.compile for compilation.\n`,
	);
	process.exit(2);
}
