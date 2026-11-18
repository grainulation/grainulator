/** The supported public command inventory. Component entry files are private implementation. */
export const COMMANDS = {
	init: "Create an evidence sprint without changing host settings",
	add: "Append a typed evidence claim",
	import: "Import active document findings",
	compile: "Validate and compile evidence",
	status: "Inspect sprint health",
	search: "Search recorded evidence",
	resolve: "Resolve a claim conflict",
	guard: "Check a proposed write against evidence requirements",
	stats: "Inspect local sprint statistics",
	maintain: "Maintain premises, observations, findings and acceptance",
	report: "Freeze and check grounded report packets",
	research: "Run or resume an exported research session",
	memory: "Store, search and reuse local knowledge",
	export: "Convert evidence into shareable artifacts",
	analytics: "Inspect sprint metrics and retrospectives",
	orchestrate: "Coordinate related sprints",
	runtime: "Explicit native convergence operations and installation",
	utils: "Shared asset and manifest utilities",
	doctor: "Inspect the installed build and local configuration",
	config: "Check and explain project configuration",
	demo: "Run a synthetic offline repair and verifier example",
	run: "Attach a command adapter to a bounded task loop",
	setup: "Save a default native-host workspace binding",
	connect: "Print an explicit MCP registration",
	mcp: "Start the unified local MCP server",
	preview: "Open the local research playground",
	completion: "Print a static bash, zsh or fish completion script",
	man: "Print the offline command reference",
};
export const RUN_USAGE =
	"grainulator run --task <text> --adapter <executable> [--adapter-args <JSON-array>] [--verify <JSON-argv>] [--dir <workspace>] [--max-rounds 3] [--timeout-ms 60000] [--adapter-format json|text] [--json]";
export function helpText() {
	return `Grainulator\n\nUsage: grainulator <command> [options]\n\n${Object.entries(
		COMMANDS,
	)
		.map(([name, description]) => `  ${name.padEnd(13)} ${description}`)
		.join(
			"\n",
		)}\n\nUse grainulator <command> --help for details.\n--dir <path> selects the evidence workspace for supported commands.\n--version [--json] prints the exact installed product/build identity.\nrun uses the JS adapter protocol; runtime uses an explicitly installed native asset.\nHost permissions and remote-write authorization remain with the host.`;
}
export function completion(shell) {
	const names = [...Object.keys(COMMANDS), "help", "--help", "--version"];
	if (shell === "bash") return `complete -W '${names.join(" ")}' grainulator\n`;
	if (shell === "zsh")
		return `#compdef grainulator\n_arguments '1:command:(${names.join(" ")})' '*::argument:_files'\n`;
	if (shell === "fish")
		return names
			.filter((name) => !name.startsWith("-"))
			.map(
				(name) =>
					`complete -c grainulator -f -n '__fish_use_subcommand' -a '${name}'`,
			)
			.join("\n")
			.concat("\n");
	throw new Error("Choose completion bash, zsh or fish.");
}
export function manpage() {
	return `.TH GRAINULATOR 1\n.SH NAME\ngrainulator \\- evidence and execution tools\n.SH SYNOPSIS\n.B grainulator\ncommand [options]\n.SH COMMANDS\n${Object.entries(
		COMMANDS,
	)
		.map(([name, description]) => `.TP\n.B ${name}\n${description}.`)
		.join(
			"\n",
		)}\n.SH EXIT STATUS\nExit statuses are command-specific. The adapter run returns 0 for verified, 2 for an unverified terminal outcome, 3 for a soundness break and 1 for usage/configuration errors. Native runtime and Stop hook protocols have distinct statuses; see their command help.\n.SH DATA\nProject configuration is grainulator.config.json. Evidence claims.json and compilation.json remain generic filenames. User data is retained when the package is removed.\n.SH SEE ALSO\nRun grainulator command --help.\n`;
}
