/**
 * cli.cjs — CommonJS mirror of lib/cli.js.
 */

import fs = require("node:fs");

let _verbose = false;

function setVerbose(on: unknown) {
	_verbose = Boolean(on);
}

function vlog(name: string, ...args: unknown[]) {
	if (!_verbose) return;
	const ts = new Date().toISOString();
	process.stderr.write(`[${ts}] ${name} ${args.join(" ")}\n`);
}

function parseFlags(argv = process.argv.slice(2)) {
	const flags: Record<string, string | true> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) continue;
		if (!arg.startsWith("--")) continue;
		const eq = arg.indexOf("=");
		if (eq !== -1) {
			flags[arg.slice(2, eq)] = arg.slice(eq + 1);
			continue;
		}
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith("--")) {
			flags[key] = next;
			i++;
		} else {
			flags[key] = true;
		}
	}
	return flags;
}

function flag(name: string, argv = process.argv.slice(2)) {
	const flags = parseFlags(argv);
	return flags[name];
}

function flagList(name: string, argv = process.argv.slice(2)) {
	const value = flag(name, argv);
	if (typeof value !== "string") return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function loadJSON(filePath: fs.PathLike, fallback: unknown = null): unknown {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return fallback;
	}
}

function isFlag(s: unknown) {
	return typeof s === "string" && s.startsWith("--");
}

export = {
	parseFlags,
	flag,
	flagList,
	loadJSON,
	setVerbose,
	vlog,
	isFlag,
};
