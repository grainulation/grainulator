import fs from "node:fs";
import path from "node:path";
import { inspectBuild } from "./build-info.js";
import {
	PLUGIN_BRIDGE_PROTOCOL,
	sourceCompatibility,
} from "./plugin-compatibility.js";
export function pluginBridge(root: string, args: string[]) {
	const options = new Map<string, string>();
	for (let i = 0; i < args.length; i += 2) {
		const key = args[i],
			value = args[i + 1];
		if (
			!key ||
			!["--plugin-root", "--mode", "--protocol"].includes(key) ||
			!value ||
			options.has(key)
		)
			throw Error("Invalid plugin bridge arguments.");
		options.set(key, value);
	}
	const mode = options.get("--mode");
	const entries: Record<string, [string, string[]]> = {
		"claude-mcp": ["bin/grainulator.js", ["mcp"]],
		"native-mcp": ["bin/grainulator-plugin.js", []],
		"write-guard": ["hooks/write-guard.cjs", []],
		tips: ["lib/tips-hook.cjs", []],
	};
	if (
		options.get("--protocol") !== String(PLUGIN_BRIDGE_PROTOCOL) ||
		!mode ||
		!Object.hasOwn(entries, mode)
	)
		throw Error(
			"Unsupported plugin bridge protocol or mode; install the matching release CLI.",
		);
	const pluginRoot = options.get("--plugin-root");
	if (!pluginRoot || !path.isAbsolute(pluginRoot))
		throw Error("An absolute plugin root is required.");
	if (inspectBuild(root).verified !== true)
		throw Error(
			"Installed CLI integrity failed; reinstall the trusted release artifact.",
		);
	const installed = JSON.parse(
		fs.readFileSync(path.join(root, "package.json"), "utf8"),
	) as { version: string };
	const plugin = JSON.parse(
		fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"),
	) as { version: string };
	if (installed.version.split("-")[0] !== plugin.version.split("-")[0])
		throw Error(
			"Plugin and CLI versions differ; install a matching release or local build.",
		);
	const installedIdentity = JSON.parse(
		fs.readFileSync(path.join(root, "build-info.json"), "utf8"),
	) as { compatibility?: { protocol?: number; source_sha256?: string } };
	let selected = installedIdentity.compatibility;
	if (path.resolve(pluginRoot) !== path.resolve(root)) {
		if (fs.existsSync(path.join(pluginRoot, "typescript/outputs.json")))
			selected = sourceCompatibility(pluginRoot);
		else {
			if (inspectBuild(pluginRoot).verified !== true)
				throw Error("Plugin artifact integrity failed.");
			selected = (
				JSON.parse(
					fs.readFileSync(path.join(pluginRoot, "build-info.json"), "utf8"),
				) as typeof installedIdentity
			).compatibility;
		}
	}
	if (
		!selected ||
		selected.protocol !== PLUGIN_BRIDGE_PROTOCOL ||
		!selected.source_sha256 ||
		selected.source_sha256 !== installedIdentity.compatibility?.source_sha256
	)
		throw Error(
			"Plugin source and installed CLI are incompatible; build and install the same source revision.",
		);
	return entries[mode]!;
}
