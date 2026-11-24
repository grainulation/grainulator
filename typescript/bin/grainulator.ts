#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectBuild } from "../lib/build-info.js";
import {
	completion,
	helpText,
	manpage,
	RUN_USAGE,
} from "../lib/command-surface.js";
import { researchCLI } from "../lib/research-cli.js";
import { runTask } from "../lib/runner.js";
import errors from "../packages/shared/lib/errors.cjs";
import projectConfig from "../packages/shared/lib/project-config.cjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(
	fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const [command = "help", ...args] = process.argv.slice(2);
function option(name: string): string | undefined;
function option<T extends string | number>(
	name: string,
	fallback: T,
): string | T;
function option(name: string, fallback: string | undefined): string | undefined;
function option(
	name: string,
	fallback?: string | number,
): string | number | undefined {
	const i = args.indexOf(name);
	if (i < 0) return fallback;
	const value = args[i + 1];
	if (!value || value.startsWith("--"))
		throw new Error(`A value is required for ${name}.`);
	return value;
}
const json = args.includes("--json");
function validateOptions(values: string[] = [], flags: string[] = []) {
	if (args.includes("--help") || args.includes("-h")) return;
	for (let i = 0; i < args.length; i++) {
		const name = args[i];
		if (name === undefined) continue;
		if (["--help", "-h", ...flags].includes(name)) continue;
		if (!values.includes(name)) throw new Error(`Unknown option: ${name}`);
		const value = args[++i];
		if (!value || value.startsWith("--"))
			throw new Error(`A value is required for ${name}.`);
	}
}
const children: Record<string, string> = {
	memory: "packages/memory/bin/memory.js",
	export: "packages/exports/bin/exports.js",
	analytics: "packages/analytics/bin/analytics.js",
	orchestrate: "packages/orchestration/bin/orchestrate.js",
	utils: "packages/shared/bin/shared.js",
};
const evidence = new Set([
	"add",
	"import",
	"compile",
	"status",
	"search",
	"resolve",
	"guard",
	"stats",
]);
async function forward(entry: string, argv: string[]) {
	const child = spawn(process.execPath, [path.join(root, entry), ...argv], {
		stdio: "inherit",
	});
	const stop = (signal: NodeJS.Signals) => child.kill(signal);
	const onInt = () => stop("SIGINT"),
		onTerm = () => stop("SIGTERM");
	process.once("SIGINT", onInt);
	process.once("SIGTERM", onTerm);
	try {
		process.exitCode = await new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code) => resolve(code ?? 1));
		});
	} finally {
		process.removeListener("SIGINT", onInt);
		process.removeListener("SIGTERM", onTerm);
	}
}
const output = (value: unknown, text: unknown) =>
	console.log(json ? JSON.stringify(value, null, 2) : text);
const safePath = (value: unknown) =>
	args.includes("--details") ? value : value ? "<local path>" : undefined;
try {
	if (["version", "--version", "-v"].includes(command)) {
		validateOptions([], ["--json"]);
		output({ version, build: inspectBuild(root) }, version);
	} else if (["help", "--help", "-h"].includes(command))
		console.log(helpText());
	else if (command === "completion") {
		if (args.length !== 1)
			throw new Error("Usage: grainulator completion bash|zsh|fish");
		process.stdout.write(completion(args[0] ?? ""));
	} else if (command === "man") {
		if (args.length) throw new Error("Usage: grainulator man");
		process.stdout.write(manpage());
	} else if (command === "runtime")
		await (await import("../lib/runtime-cli.js")).runtimeCLI(args);
	else if (command === "research") await researchCLI(args);
	else if (command === "maintain")
		await (await import("../lib/maintenance-cli.js")).maintenanceCLI(args);
	else if (command === "report")
		await (await import("../lib/report-packet.js")).reportCLI(args);
	else if (command === "setup") {
		validateOptions(["--dir"], ["--json"]);
		if (args.includes("--help") || args.includes("-h"))
			console.log(
				"Usage:\n  grainulator setup --dir <absolute-project> [--json]\nSave the default native-host workspace binding. Host settings are not changed. Restart the host after changing this binding.",
			);
		else {
			const result = (await import("../lib/workspace-config.js")).saveWorkspace(
				option("--dir", ""),
			);
			output(
				result,
				`Workspace: ${result.workspace}\nSaved: ${result.config}\nRestart the host to load this default workspace.`,
			);
		}
	} else if (command === "init") {
		validateOptions(
			["--question", "--dir", "--audience", "--constraints", "--done"],
			["--json", "--force"],
		);
		if (args.includes("--help") || args.includes("-h"))
			console.log(
				"Usage:\n  grainulator init --question <text> [--dir <path>] [--audience <text>] [--constraints <semicolon-separated text>] [--done <text>] [--force] [--json]\nCreates evidence sprint data. Existing ledgers require explicit force and a backup.",
			);
		else {
			const result = (await import("../lib/sprint-init.js")).initializeSprint(
				path.resolve(option("--dir", process.cwd())),
				{
					...(option("--question") === undefined
						? {}
						: { question: option("--question") ?? "" }),
					...(option("--audience") === undefined
						? {}
						: { audience: option("--audience") ?? "" }),
					...(option("--constraints") === undefined
						? {}
						: { constraints: option("--constraints") ?? "" }),
					...(option("--done") === undefined
						? {}
						: { done: option("--done") ?? "" }),
					force: args.includes("--force"),
				},
			);
			output(
				result,
				!("directory" in result)
					? result.message
					: `Sprint initialized: ${result.directory}\n${result.output}`,
			);
			if (result.status === "error") process.exitCode = 1;
		}
	} else if (command === "mcp") {
		validateOptions(["--dir", "--memory-dir", "--toolset"]);
		if (args.includes("--help") || args.includes("-h"))
			console.log(
				"Usage:\n  grainulator mcp [--dir <workspace>] [--memory-dir <path>] [--toolset legacy|compact]\nOne local stdio server: legacy29 tools (default), compact15 tools;7 resources. Compact covers evidence, local memory and exports; network integrations require CLI/legacy.",
			);
		else
			(await import("../lib/grainulator-mcp.js")).startServer({
				dir: path.resolve(option("--dir", process.cwd())),
				...(option("--memory-dir") === undefined
					? {}
					: { memoryDir: option("--memory-dir") ?? "" }),
				toolset: option("--toolset", "legacy"),
			});
	} else if (command === "connect") {
		validateOptions(["--dir", "--launcher", "--toolset"]);
		if (args.includes("--help") || args.includes("-h"))
			console.log(
				"Usage:\n  grainulator connect [--dir <workspace>] [--launcher <absolute-stable-launcher>] [--toolset legacy|compact]\nPrint MCP registration without changing host settings. For Homebrew select its stable opt/bin/grainulator launcher explicitly; a versioned Cellar path will not survive cleanup.",
			);
		else {
			const toolset = option("--toolset", "legacy");
			if (!["legacy", "compact"].includes(toolset))
				throw new Error("toolset must be legacy or compact.");
			const launcher = option(
				"--launcher",
				process.env.GRAINULATOR_INSTALL_ORIGIN === "homebrew"
					? process.env.GRAINULATOR_HOMEBREW_LAUNCHER
					: undefined,
			);
			if (launcher && !path.isAbsolute(launcher))
				throw new Error("--launcher must be absolute.");
			console.log(
				JSON.stringify(
					{
						mcpServers: {
							grainulator: {
								command: launcher || process.execPath,
								args: [
									...(launcher ? [] : [path.join(root, "bin/grainulator.js")]),
									"mcp",
									"--dir",
									path.resolve(option("--dir", process.cwd())),
									...(args.includes("--toolset") ? ["--toolset", toolset] : []),
								],
							},
						},
					},
					null,
					2,
				),
			);
		}
	} else if (command === "config") {
		const [action, ...rest] = args;
		if (!action || ["--help", "-h"].includes(action))
			console.log(
				"Usage:\n  grainulator config check|explain [--dir <project>] [--workspace <root>] [--config <file>] [--json]\nRead-only. Validates the real section-scoped loaders; explanation reports sources, never config values. GRAINULATOR_CONFIG remains the separate host binding.",
			);
		else {
			if (!["check", "explain"].includes(action))
				throw new Error("Unknown config action.");
			for (let i = 0; i < rest.length; i++) {
				if (rest[i] === "--json") continue;
				if (
					!["--dir", "--workspace", "--config"].includes(rest[i] ?? "") ||
					!rest[++i] ||
					rest[i]?.startsWith("--")
				)
					throw new Error("Invalid config option.");
			}
			const dir = path.resolve(option("--dir", process.cwd())),
				workspace = path.resolve(option("--workspace", dir));
			const options = { workspace, configFile: option("--config") };
			const runtimeSection = projectConfig.readSection(dir, "runtime", options);
			if (runtimeSection.value !== undefined)
				(await import("../lib/runtime-enrollment.js")).validateRun(
					runtimeSection.value,
				);
			const sections = Object.fromEntries(
				(["evidence", "orchestration", "runtime"] as const).map((section) => {
					const selected = projectConfig.readSection(dir, section, {
						...options,
						ascend: section === "orchestration",
					});
					return [
						section,
						{
							configured: selected.value !== undefined,
							source: selected.exists
								? path
										.relative(workspace, selected.file)
										.split(path.sep)
										.join("/")
								: null,
						},
					];
				}),
			);
			let migration = "ready";
			try {
				projectConfig.assertMigrationReady(dir, { workspace });
			} catch {
				migration = "incomplete-or-invalid";
			}
			const result = {
				schema_version: "grainulator.config-check.v1",
				status: migration === "ready" ? "ok" : "blocked",
				sections,
				migration,
			};
			output(
				result,
				`Project configuration: ${result.status}\n${Object.entries(sections)
					.map(
						([name, v]) =>
							`${name}: ${v.configured ? "configured" : "defaults"}`,
					)
					.join("\n")}`,
			);
			if (result.status !== "ok") process.exitCode = 1;
		}
	} else if (command === "doctor") {
		validateOptions(["--dir"], ["--json", "--details", "--require-runtime"]);
		if (args.includes("--help") || args.includes("-h"))
			console.log(
				"Usage:\n  grainulator doctor [--dir <workspace>] [--require-runtime] [--details] [--json]\nRead-only local installation and configuration checks. No providers, host probes or network. Optional native runtime absence is informational; --require-runtime makes it required.",
			);
		else {
			const build = inspectBuild(root),
				dir = path.resolve(option("--dir", process.cwd()));
			const major = Number(process.versions.node.split(".")[0]);
			const checks: {
				id: string;
				component: string;
				available: boolean;
				required?: string;
				actual?: string;
				status?: string;
				tested?: boolean;
				message?: string;
			}[] = [
				{
					id: "node",
					component: "node",
					available: major >= 24,
					required: ">=24",
					actual: process.version,
					status: major >= 24 ? "pass" : "fail",
					tested: [24, 26].includes(major),
					message: [24, 26].includes(major)
						? "Supported LTS line."
						: "This release is tested on Node 24 and 26 LTS.",
				},
				...Object.entries(children).map(([component, entry]) => ({
					id: component,
					component,
					available: fs.existsSync(path.join(root, entry)),
				})),
				{
					id: "evidence",
					component: "evidence",
					available: fs.existsSync(
						path.join(root, "packages/evidence/bin/evidence.js"),
					),
				},
			];
			let configuration: { status: string; source?: string; message?: string } =
				{ status: "valid", source: "project" };
			try {
				const selected = projectConfig.readProjectConfig(dir);
				projectConfig.evidenceConfig(dir);
				if (selected.data.runtime !== undefined)
					(await import("../lib/runtime-enrollment.js")).validateRun(
						selected.data.runtime,
					);
				projectConfig.assertMigrationReady(dir);
			} catch {
				configuration = {
					status: "invalid",
					message:
						"Project configuration or migration metadata needs attention; use config check.",
				};
				checks.push({
					id: "project-config",
					component: "project-config",
					available: false,
				});
			}
			let native: Record<string, unknown> = {
				status: "not-installed",
				origin: "explicit-native-asset",
				live_host: "unknown",
			};
			try {
				const mod = await import("../lib/runtime-assets.js");
				native = { ...native, ...mod.inspectRuntimeInstallation({}) };
			} catch (error) {
				if (errors.errorCode(error) !== "ERR_MODULE_NOT_FOUND")
					native = {
						...native,
						status: "invalid",
						error: "Native installation could not be inspected.",
					};
			}
			let enrollment: Record<string, unknown> = {
				status: "unknown",
				live_host: "unknown",
			};
			try {
				enrollment = (
					await import("../lib/runtime-enrollment.js")
				).inspectRuntimeEnrollment(dir);
			} catch {
				enrollment = { status: "invalid", live_host: "unknown" };
			}
			if (!args.includes("--details")) {
				native = Object.fromEntries(
					["status", "version", "target", "origin", "live_host"]
						.filter((key) => native[key] !== undefined)
						.map((key) => [key, native[key]]),
				);
				enrollment = Object.fromEntries(
					["status", "policy", "state", "origin", "asset_version", "live_host"]
						.filter((key) => enrollment[key] !== undefined)
						.map((key) => [key, enrollment[key]]),
				);
			}
			if (enrollment.status === "invalid")
				checks.push({
					id: "runtime-enrollment",
					component: "runtime-enrollment",
					available: false,
				});
			if (args.includes("--require-runtime") || native.status === "invalid")
				checks.push({
					id: "native-runtime",
					component: "native-runtime",
					available: native.status === "available",
				});
			const result = {
				schema_version: "grainulator.doctor.v1",
				mode: "local",
				node: process.version,
				build,
				checks,
				configuration,
				native,
				enrollment,
				installation: {
					package: safePath(root),
					origin: ["homebrew", "source", "archive", "plugin"].includes(
						process.env.GRAINULATOR_INSTALL_ORIGIN ?? "",
					)
						? process.env.GRAINULATOR_INSTALL_ORIGIN
						: "unknown",
					update_owner: "Use the channel that installed this copy.",
					running_host: "unknown",
				},
				adapters: ["command-json-v1", "command-text"],
				enforcement:
					"Managed command runner; native host permissions depend on the selected integration.",
			};
			output(
				result,
				`Grainulator ${version} · ${build.id || build.status || "invalid build"}\n${checks.map((c) => `${c.available ? "✓" : "✗"} ${c.component}${c.actual ? ` ${c.actual}` : ""}`).join("\n")}\nBuild integrity: ${build.verified === null ? "source checkout" : build.verified ? "verified" : "failed"}\nNative runtime: ${native.status}\nUse grainulator demo for an offline synthetic protocol example.`,
			);
			process.exitCode =
				checks.every((c) => c.available) && build.verified !== false ? 0 : 1;
		}
	} else if (command === "demo" || command === "run") {
		validateOptions(
			[
				"--dir",
				"--task",
				"--adapter",
				"--adapter-args",
				"--verify",
				"--max-rounds",
				"--timeout-ms",
				"--adapter-format",
			],
			["--json"],
		);
		if (args.includes("--help") || args.includes("-h"))
			console.log(
				command === "run"
					? RUN_USAGE
					: "grainulator demo [--dir <writable-output-directory>] [--json]\nSynthetic offline repair/verifier protocol example; does not measure model quality. Defaults to a new temporary workspace.",
			);
		else {
			const demo = command === "demo";
			const selected = option("--dir");
			const cwd = path.resolve(
				selected ||
					(demo
						? fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-demo-"))
						: process.cwd()),
			);
			if (demo) fs.mkdirSync(cwd, { recursive: true });
			const adapter = demo
				? [
						process.execPath,
						path.join(root, "evals/fixtures/repair-adapter.mjs"),
					]
				: [
						option("--adapter", ""),
						...JSON.parse(option("--adapter-args", "[]")),
					];
			const verifier = demo
				? [
						process.execPath,
						path.join(root, "evals/fixtures/answer-verifier.mjs"),
					]
				: option("--verify")
					? JSON.parse(option("--verify") ?? "")
					: null;
			const controller = new AbortController();
			const stop = () => controller.abort();
			process.once("SIGINT", stop);
			process.once("SIGTERM", stop);
			try {
				const result = await runTask({
					task: option(
						"--task",
						demo ? "Calculate 6 × 7. Return the number." : "",
					),
					adapter,
					verifier,
					cwd,
					adapterFormat: option("--adapter-format", "json"),
					maxRounds: Number(option("--max-rounds", 3)),
					timeoutMs: Number(option("--timeout-ms", 60000)),
					signal: controller.signal,
					onRound: (r) => {
						if (!json)
							console.log(
								`Round ${r.round}: ${r.verification?.passed ? "verification passed" : r.verification ? "needs correction" : "unverified"}`,
							);
					},
				});
				output(
					result,
					`${demo ? "Synthetic offline protocol fixture. Does not measure model quality.\n" : ""}${result.status}\n${result.rounds.at(-1)?.answer || result.error || ""}\nTrace: ${result.trace}`,
				);
				process.exitCode =
					result.status === "verified"
						? 0
						: result.status === "soundness_break"
							? 3
							: 2;
			} finally {
				process.removeListener("SIGINT", stop);
				process.removeListener("SIGTERM", stop);
			}
		}
	} else if (evidence.has(command))
		await forward("packages/evidence/bin/evidence.js", [command, ...args]);
	else if (children[command]) await forward(children[command] ?? "", args);
	else throw new Error(`Unknown command: ${command}. Run grainulator --help.`);
} catch (error) {
	const message =
		error instanceof SyntaxError
			? "Invalid JSON argument."
			: errors.errorMessage(error);
	if (json)
		console.log(
			JSON.stringify({
				schema_version: "grainulator.cli-error.v1",
				status: "error",
				message,
				error: { code: errors.errorCode(error) || "E_USAGE", message },
			}),
		);
	else console.error(`Grainulator: ${message}`);
	process.exitCode = 1;
}
