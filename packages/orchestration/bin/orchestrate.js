#!/usr/bin/env node
// Generated from typescript/packages/orchestration/bin/orchestrate.ts; edit that source and run npm run build:types.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vlog as componentVlog, setVerbose } from "../../shared/lib/cli.js";
import { writeNewFile } from "../../shared/lib/fs-safe.cjs";
import projectConfig from "../../shared/lib/project-config.cjs";
import { assignSprint } from "../lib/assignments.js";
import {
	detectConflicts,
	filterBySeverity,
	printConflicts,
} from "../lib/conflicts.js";
import { applyDecomposition, printDecomposition } from "../lib/decompose.js";
import { printReport, runChecks } from "../lib/doctor.js";
import { emitInstructions, printNext } from "../lib/emit.js";
import * as hack from "../lib/hackathon.js";
import {
	buildGraph,
	detectCycles,
	generateMermaid,
	printDependencyGraph,
	topoSort,
} from "../lib/planner.js";
import { setPortfolioSelection } from "../lib/project-config.js";
import { syncAll } from "../lib/sync.js";
import { getStatusData, printStatus } from "../lib/tracker.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const verbose =
	process.argv.includes("--verbose") || process.argv.includes("-v");
setVerbose(verbose);
const vlog = (...a) => componentVlog("grainulator orchestrate:", ...a);
const COMMANDS = {
	init: "Initialize grainulator.config.json orchestration section in the current directory",
	plan: "Show sprint dependency graph (--format mermaid|ascii, --mermaid)",
	status: "Show status of all tracked sprints",
	conflicts: "Show cross-sprint conflicts (--severity critical|warning|info)",
	assign: "Assign a person to a sprint",
	sync: "Sync sprint states from their directories",
	decompose: "Auto-decompose a question into sub-sprints",
	hackathon: "Hackathon coordinator (init|team|status|end)",
	next: "Show sprints ready for grainulator execution",
	doctor: "Check health of orchestration setup",
	help: "Show this help message",
};
function loadConfig(dir) {
	return projectConfig.readSection(dir, "orchestration").value;
}
function findPortfolioRoot(start, options) {
	const selected = projectConfig.readSection(start, "orchestration", {
		...options,
		ascend: true,
	});
	return selected.value ? selected.origin : null;
}
function printHelp() {
	console.log("");
	console.log("  grainulator orchestrate - Multi-sprint research orchestrator");
	console.log("");
	console.log("  Usage: grainulator orchestrate <command> [options]");
	console.log("");
	console.log("  Commands:");
	for (const [cmd, desc] of Object.entries(COMMANDS)) {
		console.log(`    ${cmd.padEnd(12)} ${desc}`);
	}
	console.log("");
	console.log("");
	console.log("");
	console.log(
		"  Config: grainulator.config.json orchestration section in project root",
	);
	console.log("");
}
async function main() {
	const args = process.argv.slice(2);
	function value(flag, fallback) {
		const i = args.indexOf(flag);
		if (i < 0) return fallback;
		const next = args[i + 1];
		if (!next || next.startsWith("--"))
			throw new Error(`${flag} requires a value.`);
		return next;
	}
	const selectedDir = path.resolve(value("--dir", process.cwd()));
	const workspace = path.resolve(
		value("--workspace", process.env.GRAINULATOR_WORKSPACE || selectedDir),
	);
	const selection = { workspace, configFile: value("--config") };
	const command = args[0] || "help";
	vlog("startup", `command=${command}`, `cwd=${process.cwd()}`);
	if (command === "help" || command === "--help" || command === "-h") {
		printHelp();
		process.exit(0);
	}
	if (command === "--version" || command === "-v") {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
		);
		console.log(pkg.version);
		process.exit(0);
	}
	if (command === "serve") {
		console.error(
			"The component browser dashboard has been retired. Use the CLI or MCP tools.",
		);
		process.exit(1);
	}
	if (!Object.hasOwn(COMMANDS, command)) {
		console.error(`grainulator orchestrate: unknown command: ${command}`);
		console.error(
			`Run "grainulator orchestrate help" to see available commands.`,
		);
		process.exit(1);
	}
	if (command === "init") {
		const rootDir = selectedDir;
		if (projectConfig.readSection(rootDir, "orchestration", selection).value)
			throw new Error("An orchestration section already exists.");
		projectConfig.updateSection(
			rootDir,
			"orchestration",
			() => ({ sprints: [], settings: { sync_interval: "manual" } }),
			{ ...selection, create: true },
		);
		console.log("Initialized grainulator.config.json orchestration section.");
		process.exit(0);
	}
	const root = findPortfolioRoot(selectedDir, selection);
	setPortfolioSelection(selection);
	if (!root && command !== "help" && command !== "doctor") {
		console.error(
			"grainulator orchestrate: no grainulator.config.json orchestration section found. Run from a directory with grainulator.config.json orchestration section or a subdirectory.",
		);
		console.error("");
		console.error("Create one:");
		console.error('  { "sprints": [] }');
		process.exit(1);
	}
	const config = root
		? projectConfig.readSection(selectedDir, "orchestration", {
				...selection,
				ascend: true,
			}).value
		: { sprints: [] };
	const jsonMode = args.includes("--json");
	switch (command) {
		case "plan": {
			if (jsonMode) {
				const graph = buildGraph(config);
				const order = topoSort(config);
				const cycles = detectCycles(config);
				console.log(JSON.stringify({ graph, order, cycles }, null, 2));
				break;
			}
			const fmtIdx = args.indexOf("--format");
			const planFormat =
				fmtIdx !== -1 && args[fmtIdx + 1] ? args[fmtIdx + 1] : null;
			if (args.includes("--mermaid") || planFormat === "mermaid") {
				console.log(generateMermaid(config));
				break;
			}
			if (planFormat === "ascii" || !planFormat) {
				printDependencyGraph(config, root);
				break;
			}
			console.error(
				`grainulator orchestrate: unknown plan format: ${planFormat}. Supported: ascii, mermaid`,
			);
			process.exit(1);
			break;
		}
		case "status": {
			if (jsonMode) {
				const data = getStatusData(config, root);
				console.log(JSON.stringify(data, null, 2));
				break;
			}
			printStatus(config, root);
			break;
		}
		case "assign": {
			const sprintPath = args[1];
			const person = args[2];
			if (!sprintPath || !person) {
				console.error(
					"grainulator orchestrate: usage: grainulator orchestrate assign <sprint-path> <person>",
				);
				process.exit(1);
			}
			assignSprint(config, root, sprintPath, person);
			break;
		}
		case "sync": {
			syncAll(config, root);
			break;
		}
		case "conflicts": {
			const sevIdx = args.indexOf("--severity");
			const severity =
				sevIdx !== -1 && args[sevIdx + 1] ? args[sevIdx + 1] : "info";
			if (jsonMode) {
				const all = detectConflicts(config, root);
				const filtered = filterBySeverity(all, severity);
				console.log(
					JSON.stringify(
						{ conflicts: filtered, count: filtered.length },
						null,
						2,
					),
				);
				break;
			}
			printConflicts(config, root, { severity });
			break;
		}
		case "decompose": {
			const question = args
				.filter((a) => !a.startsWith("--"))
				.slice(1)
				.join(" ");
			if (!question) {
				console.error(
					'grainulator orchestrate: usage: grainulator orchestrate decompose "<question>" [--apply] [--max <n>]',
				);
				process.exit(1);
			}
			const maxIdx = args.indexOf("--max");
			const maxSprints =
				maxIdx !== -1 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 5;
			if (args.includes("--apply")) {
				const sprints = applyDecomposition(root, question, { maxSprints });
				console.log(`Created ${sprints.length} sub-sprints for: "${question}"`);
				for (const s of sprints) {
					console.log(`  ${s.path}`);
				}
			} else {
				printDecomposition(question, { maxSprints });
			}
			break;
		}
		case "hackathon": {
			const sub = args[1];
			switch (sub) {
				case "init": {
					const nameIdx = args.indexOf("--name");
					const durIdx = args.indexOf("--duration");
					const name =
						nameIdx !== -1 && args[nameIdx + 1] ? args[nameIdx + 1] : undefined;
					const duration =
						durIdx !== -1 && args[durIdx + 1]
							? parseInt(args[durIdx + 1], 10)
							: undefined;
					const h = hack.initHackathon(root, { name, duration });
					console.log(`Hackathon "${h.name}" started — ends at ${h.endTime}`);
					break;
				}
				case "team": {
					const teamName = args[2];
					const qIdx = args.indexOf("--question");
					const question =
						qIdx !== -1 ? args.slice(qIdx + 1).join(" ") : undefined;
					if (!teamName) {
						console.error(
							'grainulator orchestrate: usage: grainulator orchestrate hackathon team <name> [--question "..."]',
						);
						process.exit(1);
					}
					const result = hack.addTeam(root, teamName, question);
					console.log(
						`Team "${result.teamName}" added — sprint: ${result.sprintPath}`,
					);
					break;
				}
				case "end": {
					const board = hack.endHackathon(root);
					console.log("Hackathon ended! Final leaderboard:");
					for (let i = 0; i < board.length; i++) {
						const t = board[i];
						console.log(
							`  ${i + 1}. ${t.team} — ${t.score}pts (${t.claimCount} claims)`,
						);
					}
					break;
				}
				default: {
					if (jsonMode) {
						const timer = hack.timerStatus(root);
						const board = hack.leaderboard(root);
						console.log(JSON.stringify({ timer, leaderboard: board }, null, 2));
					} else {
						hack.printHackathon(root);
					}
					break;
				}
			}
			break;
		}
		case "next": {
			if (jsonMode) {
				const instructions = emitInstructions(config, root);
				console.log(JSON.stringify(instructions, null, 2));
			} else {
				printNext(config, root);
			}
			break;
		}
		case "doctor": {
			const result = runChecks(root || selectedDir);
			if (jsonMode) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				printReport(result);
			}
			if (!result.ok) process.exit(1);
			break;
		}
	}
}
main().catch((err) => {
	console.error(
		process.argv.includes("--json")
			? JSON.stringify({
					schema_version: "grainulator.cli-error.v1",
					status: "error",
					error: { code: err.code || "E_CONFIG", message: err.message },
				})
			: `grainulator orchestrate: ${err.message}`,
	);
	process.exit(1);
});
