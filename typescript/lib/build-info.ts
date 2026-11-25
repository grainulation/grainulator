import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Distribution preserves the original server definition; the local host adds
// its security wrapper again when loading it. Never edit the live host config.
export function portableMcpBytes(bytes: Buffer | string, configPath?: string) {
	const config: {
		mcpServers?: Record<string, { command?: unknown; args?: unknown }>;
	} = JSON.parse(bytes.toString());
	for (const [name, server] of Object.entries(config.mcpServers || {})) {
		if (
			server.command === "/usr/local/bin/prompt_security/prompt_security_mcp"
		) {
			if (
				!configPath ||
				!Array.isArray(server.args) ||
				server.args.length < 4 ||
				!server.args.every((arg) => typeof arg === "string") ||
				server.args[1] !== name ||
				server.args[2] !== "__args__" ||
				!server.args[3] ||
				!path.isAbsolute(server.args[0]!) ||
				fs.realpathSync(server.args[0]!) !== fs.realpathSync(configPath)
			) {
				throw new Error(
					"Security wrapper does not reference this MCP configuration and server.",
				);
			}
			server.command = server.args[3];
			server.args = server.args.slice(4);
		}
		if (Array.isArray(server.args))
			server.args = server.args.map((arg: unknown) =>
				typeof arg === "string"
					? arg.replaceAll(
							"/bootstrap/plugin-entry.mts",
							"/bootstrap/plugin-entry.mjs",
						)
					: arg,
			);
	}
	return Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
}

/** Deterministic source-to-artifact launch configuration; never rewrites live source. */
export function portableArtifactBytes(
	relative: string,
	bytes: Buffer,
	configPath?: string,
): Buffer {
	if ([".mcp.json", "mcp.json", "mcp_config.json"].includes(relative))
		return portableMcpBytes(bytes, configPath);
	if (relative !== "hooks/hooks.json") return bytes;
	const document = JSON.parse(bytes.toString()) as {
		hooks?: Record<string, { hooks?: { command?: unknown }[] }[]>;
	};
	for (const groups of Object.values(document.hooks ?? {}))
		for (const group of groups)
			for (const hook of group.hooks ?? []) {
				if (typeof hook.command === "string")
					hook.command = hook.command.replaceAll(
						"/bootstrap/plugin-entry.mts",
						"/bootstrap/plugin-entry.mjs",
					);
			}
	return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

export function inspectBuild(root: string) {
	const file = path.join(root, "build-info.json");
	if (!fs.existsSync(file))
		return {
			id: null,
			verified: null,
			status: "source checkout (no integrity manifest)",
		};
	try {
		const manifest: {
			id?: string;
			version?: string;
			source_sha256?: string;
			files?: Record<string, unknown>;
		} = JSON.parse(fs.readFileSync(file, "utf8"));
		if (
			!manifest.id ||
			!manifest.files ||
			typeof manifest.files !== "object" ||
			Array.isArray(manifest.files) ||
			!Object.keys(manifest.files).length
		)
			throw Error("Invalid build manifest");
		const changed = [],
			missing = [],
			host_adaptations = [];
		const base = fs.realpathSync(root);
		for (const [relative, expected] of Object.entries(manifest.files)) {
			if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))
				throw Error("Invalid file checksum in build manifest");
			const target = path.resolve(base, relative);
			if (!target.startsWith(base + path.sep))
				throw Error("Build path escapes package");
			if (!fs.existsSync(target)) {
				missing.push(relative);
				continue;
			}
			if (!fs.realpathSync(target).startsWith(base + path.sep))
				throw Error("Build symlink escapes package");
			const bytes = fs.readFileSync(target);
			const actual = crypto.createHash("sha256").update(bytes).digest("hex");
			if (actual !== expected) {
				const config: {
					mcpServers?: Record<string, { command?: unknown }>;
				} | null = [
					".mcp.json",
					"mcp.json",
					"mcp_config.json",
					"hooks/hooks.json",
				].includes(relative)
					? JSON.parse(bytes.toString())
					: null;
				const wrapped =
					config &&
					Object.values(config.mcpServers || {}).some(
						(s) =>
							s.command ===
							"/usr/local/bin/prompt_security/prompt_security_mcp",
					);
				if (
					config &&
					crypto
						.createHash("sha256")
						.update(portableArtifactBytes(relative, bytes, target))
						.digest("hex") === expected
				) {
					if (wrapped) host_adaptations.push(relative);
				} else changed.push(relative);
			}
		}
		return {
			id: manifest.id,
			version: manifest.version,
			source_sha256: manifest.source_sha256,
			verified: !changed.length && !missing.length,
			changed,
			missing,
			host_adaptations,
		};
	} catch (error) {
		return { id: null, verified: false, error: (error as Error).message };
	}
}
