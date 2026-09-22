// Help is handled before command execution, installation tracking, or stdin reads.
export async function showCommandHelp(command) {
	const existing = {
		add: () => import("./cli-add.js"),
		import: () => import("./cli-import.js"),
		search: () => import("./cli-search.js"),
		resolve: () => import("./cli-resolve.js"),
	};
	if (Object.hasOwn(existing, command)) {
		await (await existing[command]()).run(undefined, ["--help"]);
		return true;
	}
	const component = "node packages/evidence/bin/wheat.js";
	const help = {
		init: `${component} init [--question <text>] [--audience <text>] [--constraints <text>] [--done <text>] [--headless | --auto] [--force] [--git-hook]\nLegacy scaffold initializer: creates sprint data and project instructions/configuration. Git hook installation is opt-in. For data-only initialization use grainulator init --question <text>.`,
		quickstart: `${component} quickstart [--force] [--port <number>] [--no-open]\nLegacy sample sprint setup and evidence-report preview. --force permits replacing existing sample data.`,
		compile:
			"grainulator compile [--summary] [--check] [--json] [--quiet]\nValidate claims.json and write compilation.json. --check exits 1 when compilation is blocked; --summary prints a brief report; --quiet suppresses next-action text.",
		guard:
			"grainulator guard [<tool-input-json>]\nCheck tool input supplied as a JSON argument or on stdin. Exit 0 permits the action; exit 2 blocks it. This command does not grant host permissions.",
		status:
			"grainulator status [--json]\nRead the sprint's claims and compilation status. --json emits machine-readable output.",
		stats: `${component} stats\nRead local sprint statistics beneath the target directory. No remote telemetry is sent.`,
		update: `${component} update [--force]\nLegacy compatibility command: copy templates into .claude/commands/wheat/. Existing differing files are preserved unless --force is given.`,
		serve: `${component} serve [--port <number>] [--cors <origin>]\nPreview generated evidence reports with the legacy local server (default port 9092). This is not the removed permission dashboard.`,
		mcp: "grainulator mcp\nStart the unified stdio MCP server. The direct component entry point starts the legacy evidence-only server.",
		migrate: `${component} migrate\nNo automatic ledger format migration is provided. Existing compatible ledgers can be read directly.`,
	};
	if (!Object.hasOwn(help, command)) return false;
	console.log(
		`Usage:\n  ${help[command]}\n\nOptions:\n  --dir <path>  Target directory (default: current directory; --root is a compatibility alias)\n  --help, -h    Show usage without running the command or changing files`,
	);
	return true;
}
