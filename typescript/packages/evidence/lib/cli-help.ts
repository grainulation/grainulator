// Help is handled before command execution, installation tracking, or stdin reads.
export async function showCommandHelp(command: string) {
	const existing = {
		add: () => import("./cli-add.js"),
		import: () => import("./cli-import.js"),
		search: () => import("./cli-search.js"),
		resolve: () => import("./cli-resolve.js"),
	};
	if (Object.hasOwn(existing, command)) {
		await (await existing[command as keyof typeof existing]()).run("", [
			"--help",
		]);
		return true;
	}
	const help = {
		compile:
			"grainulator compile [--summary] [--check] [--json] [--quiet]\nValidate the selected ledger and write its compilation.",
		guard:
			"grainulator guard [<tool-input-json>]\nRead stdin or tool-input JSON; exit 0 allows, 2 blocks. No host permission is granted.",
		status:
			"grainulator status [--json]\nInspect evidence and compilation freshness without writing.",
		stats:
			"grainulator stats [--json]\nInspect local sprint statistics without network telemetry.",
	};
	if (!Object.hasOwn(help, command)) return false;
	console.log(
		`Usage:\n  ${help[command as keyof typeof help]}\n\n--dir <path> selects the sprint. --help, -h shows help without executing.`,
	);
	return true;
}
