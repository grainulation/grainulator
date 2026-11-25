/** Copy compiled package bytes to a private tree and materialize only artifact launchers. */
import fs from "node:fs";
import path from "node:path";
import { inspectBuild, portableArtifactBytes } from "../../lib/build-info.js";
import { sourceCompatibility } from "../../lib/plugin-compatibility.js";
import type { NpmPack } from "../contracts.mjs";
import { command } from "./local-checks.mjs";
import { assertPackageInventory } from "./package-inventory.mjs";
export function stageCompiledPackage(root: string, destination: string) {
	if (inspectBuild(root).verified !== true)
		throw Error(
			"Build identity is missing or stale; run npm run build before packing.",
		);
	const identity = JSON.parse(
		fs.readFileSync(path.join(root, "build-info.json"), "utf8"),
	) as { id: string; compatibility?: { source_sha256?: string } };
	if (
		fs.existsSync(path.join(root, "typescript/outputs.json")) &&
		sourceCompatibility(root).source_sha256 !==
			identity.compatibility?.source_sha256
	)
		throw Error(
			"Source changed after compilation; run npm run build before packing.",
		);
	const [inventory] = JSON.parse(
		String(
			command(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], {
				cwd: root,
			}),
		),
	) as [NpmPack];
	assertPackageInventory(root, inventory.files);
	fs.mkdirSync(destination);
	for (const file of inventory.files) {
		const source = path.join(root, file.path),
			target = path.join(destination, file.path);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(source, target);
		const bytes = fs.readFileSync(target);
		fs.writeFileSync(target, portableArtifactBytes(file.path, bytes, source));
	}
	if (inspectBuild(destination).verified !== true)
		throw Error("Staged compiled artifact differs from its build identity.");
	return { identity, inventory };
}
