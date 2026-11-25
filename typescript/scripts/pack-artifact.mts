#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NpmPack } from "./contracts.mjs";
import { stageCompiledPackage } from "./lib/artifact-tree.mjs";
import { command } from "./lib/local-checks.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out" || !args[1]))
	throw Error("Usage: npm run pack:artifact -- --out DIRECTORY");
const output = path.resolve(args[1] ?? path.join(root, ".dogfood/artifacts"));
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(
	path.join(os.tmpdir(), "grainulator-compiled-package-"),
);
try {
	const stage = path.join(temporary, "package");
	const { identity, inventory } = stageCompiledPackage(root, stage);
	if (fs.existsSync(path.join(output, inventory.filename)))
		throw Error("Artifact already exists; choose a new output directory.");
	const [packed] = JSON.parse(
		String(
			command(
				[
					"npm",
					"pack",
					"--ignore-scripts",
					"--json",
					"--pack-destination",
					output,
				],
				{ cwd: stage },
			),
		),
	) as [NpmPack];
	console.log(
		JSON.stringify(
			{
				archive: path.join(output, packed.filename),
				build_id: identity.id,
				bytes: packed.size,
			},
			null,
			2,
		),
	);
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}
