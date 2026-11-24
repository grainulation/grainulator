#!/usr/bin/env node
// Claude PreToolUse sends JSON on stdin. Exit 2 blocks; exit 1 does not.
// Host context can be supplied on stdin or through CLAUDE_HOOK_CONTEXT. This guards Write/Edit,
// not arbitrary shell commands or hosts that do not load the hook.
"use strict";
async function guard() {
	let context;
	try {
		// Node may make stdin nonblocking when its stream is initialized. Consume
		// the stream through EOF so delayed pipe input cannot become an EAGAIN parse failure.
		let input = "";
		if (!process.stdin.isTTY) {
			process.stdin.setEncoding("utf8");
			for await (const chunk of process.stdin) input += chunk;
		}
		context = JSON.parse(
			input.trim() || process.env.CLAUDE_HOOK_CONTEXT || "{}",
		);
		if (
			context === null ||
			typeof context !== "object" ||
			Array.isArray(context) ||
			(context.tool_input !== undefined &&
				(context.tool_input === null ||
					typeof context.tool_input !== "object" ||
					Array.isArray(context.tool_input)))
		)
			throw new Error("Invalid hook context shape.");
	} catch {
		process.stderr.write(
			"Grainulator write guard: malformed hook context; no file decision made.\n",
		);
		process.exit(0);
	}
	const files = [context.tool_input?.file_path];
	const patch =
		context.tool_input?.command ??
		context.tool_input?.patch ??
		context.tool_input?.input;
	if (typeof patch === "string") {
		for (const match of patch.matchAll(
			/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm,
		))
			files.push(match[1]);
	}
	for (const file of files) {
		const name =
			typeof file === "string"
				? file.trim().replace(/\\/g, "/").split("/").pop().toLowerCase()
				: "";
		if (name === "claims.json" || name === "compilation.json") {
			process.stderr.write(
				`BLOCKED: ${name} is managed evidence. Use grainulator.add_claim or grainulator.resolve for claims and grainulator.compile for compilation.\n`,
			);
			process.exit(2);
		}
	}
}

void guard();
