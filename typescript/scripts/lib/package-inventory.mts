/** Required compiler outputs are checked independently of npm's selected file list. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
export function assertPackageInventory(
	root: string,
	packed: readonly { path: string; mode?: number }[],
) {
	const pkg = JSON.parse(
		fs.readFileSync(path.join(root, "package.json"), "utf8"),
	) as { files: string[]; bin: Record<string, string> };
	const inventory = JSON.parse(
		fs.readFileSync(path.join(root, "typescript/outputs.json"), "utf8"),
	) as { modules: { output: string }[] };
	const files = new Map(packed.map((file) => [file.path, file]));
	for (const declared of pkg.files) {
		// Identity is generated after this audit; archive/check-package verify it separately.
		if (declared === "build-info.json") continue;
		const prefix = declared.replace(/\/$/, "") + "/";
		assert.ok(
			[...files.keys()].some(
				(name) => name === declared || name.startsWith(prefix),
			),
			`Declared package input is missing: ${declared}`,
		);
	}
	const selected = (name: string) =>
		pkg.files.some(
			(pattern) =>
				name === pattern || name.startsWith(pattern.replace(/\/$/, "") + "/"),
		);
	const required = [
		...inventory.modules.map((item) => item.output).filter(selected),
		...Object.values(pkg.bin),
		"bootstrap/plugin-entry.mts",
		"hooks/hooks.json",
		".mcp.json",
		"mcp.json",
	];
	for (const name of required) {
		assert.ok(
			files.has(name),
			`Compiled artifact inventory is missing ${name}; build before packing`,
		);
		const bytes = fs.readFileSync(path.join(root, name));
		if (bytes.subarray(0, 2).toString() === "#!") {
			const packedMode = files.get(name)?.mode;
			if (packedMode !== undefined)
				assert.ok(
					packedMode & 0o111,
					`Packed executable lost execute mode: ${name}`,
				);
			assert.ok(
				(fs.statSync(path.join(root, name)).mode & 0o111) !== 0,
				`Executable artifact has no execute mode: ${name}`,
			);
		}
	}
	for (const name of files.keys()) {
		assert.ok(
			!name.startsWith("node_modules/") &&
				!name.startsWith("typescript/") &&
				!name.startsWith("migration/"),
			`Source/toolchain or converter leaked into base: ${name}`,
		);
		assert.ok(
			!/\.(?:ts|mts|cts)$/.test(name) || name === "bootstrap/plugin-entry.mts",
			`Unexpected TypeScript source in base: ${name}`,
		);
	}
}
