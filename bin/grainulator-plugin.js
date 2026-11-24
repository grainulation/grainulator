#!/usr/bin/env node
// Generated from typescript/bin/grainulator-plugin.ts; edit that source and run npm run build:types.
import { loadWorkspace, validateWorkspace } from "../lib/workspace-config.js";
// Agent plugins (Codex, Antigravity) start MCP inside the plugin directory, not
// the project. Use, in order: an explicit GRAINULATOR_WORKSPACE, the project
// folder the agent shares (MCP roots), then the saved default. Never guess.
const errorMessage = (error) =>
	error instanceof Error ? error.message : String(error);
if (Number(process.versions.node.split(".")[0]) < 24) {
	process.stderr.write(
		`Grainulator requires Node.js 24 or later (24 or 26 LTS); found ${process.version}. Restart your agent with a supported Node.js on PATH.\n`,
	);
	process.exitCode = 1;
} else {
	const { startServer } = await import("../lib/grainulator-mcp.js");
	const advice =
		"Configure an absolute GRAINULATOR_WORKSPACE or use grainulator setup --dir /absolute/project. No workspace files were accessed.";
	if (process.env.GRAINULATOR_WORKSPACE) {
		let selected = process.cwd();
		let configurationError;
		try {
			selected = validateWorkspace(process.env.GRAINULATOR_WORKSPACE);
		} catch (error) {
			configurationError = `${errorMessage(error)} ${advice}`;
		}
		if (configurationError)
			process.stderr.write(
				`Grainulator configuration required: ${configurationError}\n`,
			);
		startServer({
			dir: configurationError ? process.cwd() : selected,
			...(configurationError ? { configurationError } : {}),
		});
	} else {
		let fallback;
		let error;
		try {
			fallback = loadWorkspace().workspace;
		} catch (failure) {
			error = `Your agent did not share a project folder. ${errorMessage(failure)} ${advice}`;
		}
		startServer({
			dir: process.cwd(),
			roots: fallback ? { fallback } : error ? { error } : {},
		});
	}
}
