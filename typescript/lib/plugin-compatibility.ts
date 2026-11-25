/** Source compatibility is separate from shipped-byte integrity and publisher trust. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { portableMcpBytes } from "./build-info.js";
export const PLUGIN_BRIDGE_PROTOCOL = 1;
export function sourceCompatibility(root: string) {
	const files: Record<string, string> = Object.create(null);
	const add = (name: string) => {
		const target = path.join(root, name);
		const fd = fs.openSync(
			target,
			fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
		);
		try {
			if (!fs.fstatSync(fd).isFile())
				throw Error(`Nonregular source compatibility input: ${name}`);
			const bytes = fs.readFileSync(fd);
			files[name] = crypto
				.createHash("sha256")
				.update(
					[".mcp.json", "mcp.json"].includes(name)
						? portableMcpBytes(bytes, target)
						: bytes,
				)
				.digest("hex");
		} finally {
			fs.closeSync(fd);
		}
	};
	const walk = (directory: string) => {
		for (const entry of fs.readdirSync(path.join(root, directory), {
			withFileTypes: true,
		})) {
			const name = path.posix.join(directory, entry.name);
			if (entry.isDirectory()) walk(name);
			else add(name);
		}
	};
	for (const name of fs.readdirSync(path.join(root, "packages"))) {
		const metadata = path.join("packages", name, "package.json");
		if (fs.existsSync(path.join(root, metadata))) add(metadata);
	}
	walk("typescript");
	walk("bootstrap");
	for (const name of [
		"package.json",
		"tsconfig.json",
		".mcp.json",
		"mcp.json",
		"mcp_config.json",
		"plugin.json",
		".claude-plugin/plugin.json",
		".codex-plugin/plugin.json",
		"hooks/hooks.json",
	])
		add(name);
	const canonical = Object.fromEntries(
		Object.entries(files).sort(([a], [b]) => a.localeCompare(b, "en")),
	);
	return {
		protocol: PLUGIN_BRIDGE_PROTOCOL,
		source_sha256: crypto
			.createHash("sha256")
			.update(JSON.stringify(canonical))
			.digest("hex"),
	};
}
