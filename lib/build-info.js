import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Distribution preserves the original server definition; the local host adds
// its security wrapper again when loading it. Never edit the live host config.
export function portableMcpBytes(bytes, configPath) {
	const config = JSON.parse(bytes.toString());
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
				!path.isAbsolute(server.args[0]) ||
				fs.realpathSync(server.args[0]) !== fs.realpathSync(configPath)
			) {
				throw new Error(
					"Security wrapper does not reference this MCP configuration and server.",
				);
			}
			server.command = server.args[3];
			server.args = server.args.slice(4);
		}
	}
	return Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
}

export function inspectBuild(root) {
	const file = path.join(root, "build-info.json");
	if (!fs.existsSync(file))
		return {
			id: null,
			verified: null,
			status: "source checkout (no integrity manifest)",
		};
	try {
		const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
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
			if (!/^[a-f0-9]{64}$/.test(expected))
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
				const config = [".mcp.json", "mcp.json"].includes(relative)
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
						.update(portableMcpBytes(bytes, target))
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
		return { id: null, verified: false, error: error.message };
	}
}
