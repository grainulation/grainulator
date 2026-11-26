#!/usr/bin/env node
import { loadNativeSettings } from "../lib/workspace-config.js";

// Agent plugins (Codex, Antigravity) start MCP inside the plugin directory, not
// the project. Use, in order: an explicit GRAINULATOR_WORKSPACE, the project
// folder the agent shares (MCP roots), then the saved default. Never guess.
const errorMessage = (error: unknown): string =>
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
	try {
		const settings = loadNativeSettings();
		if (process.env.GRAINULATOR_WORKSPACE) {
			startServer({
				toolset: settings.toolset,
				dir: settings.workspace ?? process.cwd(),
				...(settings.workspaceError
					? { configurationError: settings.workspaceError }
					: {}),
			});
		} else {
			startServer({
				toolset: settings.toolset,
				dir: process.cwd(),
				roots: settings.workspace
					? { fallback: settings.workspace }
					: {
							error: `Your agent did not share a project folder. ${settings.workspaceError ?? ""} ${advice}`,
						},
			});
		}
	} catch (error) {
		process.stderr.write(
			`Grainulator configuration required: ${errorMessage(error)}\n`,
		);
		process.exitCode = 1;
	}
}
