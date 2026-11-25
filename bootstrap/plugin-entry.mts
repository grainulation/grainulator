/** Node 24 bootstrap: launch compiled artifacts; never build, install or download. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
const fail = (message: string) => {
	process.stderr.write(
		`Grainulator plugin: ${message}\nInstall the matching Grainulator release CLI or build this source checkout with npm ci --ignore-scripts && npm run build.\n`,
	);
	process.exitCode = mode === "tips" ? 0 : 2;
};
try {
	if (Number(process.versions.node.split(".")[0]) < 24)
		throw Error("Node.js 24 or later is required.");
	if (
		!mode ||
		!["claude-mcp", "native-mcp", "write-guard", "tips"].includes(mode) ||
		process.argv.length !== 3
	)
		throw Error("Unsupported plugin launch mode.");
	const bundled = path.join(root, "bin/grainulator.js");
	let executable: string;
	let prefix: string[];
	if (fs.existsSync(bundled)) {
		executable = process.execPath;
		prefix = [bundled];
	} else {
		const explicit = process.env.GRAINULATOR_CLI;
		if (explicit && !path.isAbsolute(explicit))
			throw Error("GRAINULATOR_CLI must be an absolute installed CLI path.");
		const candidates = explicit
			? [explicit]
			: (process.env.PATH ?? "")
					.split(path.delimiter)
					.filter((directory) => path.isAbsolute(directory))
					.map((directory) => path.join(directory, "grainulator"));
		const selected = candidates.find((candidate) => {
			const resolved = path.resolve(candidate);
			if (
				resolved.startsWith(path.resolve(root) + path.sep) ||
				(!explicit && resolved.startsWith(process.cwd() + path.sep))
			)
				return false;
			try {
				fs.accessSync(resolved, fs.constants.X_OK);
				return fs.statSync(resolved).isFile();
			} catch {
				return false;
			}
		});
		if (!selected)
			throw Error(
				"No installed release CLI found. Set an absolute GRAINULATOR_CLI if it is outside PATH.",
			);
		executable = selected;
		prefix = [];
	}
	const child = spawn(
		executable,
		[
			...prefix,
			"plugin-bridge",
			"--plugin-root",
			root,
			"--mode",
			mode,
			"--protocol",
			"1",
		],
		{ stdio: "inherit" },
	);
	const onInt = () => child.kill("SIGINT");
	const onTerm = () => child.kill("SIGTERM");
	process.once("SIGINT", onInt);
	process.once("SIGTERM", onTerm);
	try {
		const code = await new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code) => resolve(code ?? 2));
		});
		process.exitCode = mode === "tips" ? 0 : code;
	} finally {
		process.removeListener("SIGINT", onInt);
		process.removeListener("SIGTERM", onTerm);
	}
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
