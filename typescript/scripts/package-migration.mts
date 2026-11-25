#!/usr/bin/env node
// Package only committed converter bytes, separately from the normal application.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertNoSymlinkPath,
	encodeRuntimeArchive,
	sha256,
} from "../lib/runtime-assets.js";
import { withFrozenSource } from "./lib/frozen-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
	const args = process.argv.slice(2),
		options: Record<string, string | undefined> = {};
	for (let i = 0; i < args.length; i++) {
		const name = args[i]!,
			value = args[++i];
		if (!["--out", "--revision"].includes(name) || !value || options[name])
			throw Error(
				"Usage: node scripts/package-migration.mjs --revision COMMIT --out NEW-DIRECTORY",
			);
		options[name] = value;
	}
	if (!options["--out"] || !options["--revision"])
		throw Error("Explicit revision and new output are required");
	const requestedOutput = options["--out"];
	withFrozenSource(root, options["--revision"], (source, commit) => {
		const read = (name: string) => fs.readFileSync(path.join(source, name));
		const version = JSON.parse(String(read("package.json"))).version;
		if (!/^3\.\d+\.\d+$/.test(version))
			throw Error("Expected v3 converter source");
		const prefix = "grainulator-migrate-" + version,
			files = new Map();
		const inventory: Record<string, string> = {};
		for (const name of [
			"converter.mjs",
			"remote.mjs",
			"README.md",
			"LICENSE",
		]) {
			const content = read(name === "LICENSE" ? name : "migration/" + name);
			inventory[name] = sha256(content);
			files.set(prefix + "/" + name, {
				bytes: content,
				mode: name === "converter.mjs" ? 0o755 : 0o644,
			});
		}
		files.set(prefix + "/manifest.json", {
			bytes: Buffer.from(
				JSON.stringify(
					{
						schema: "grainulator.migration-asset.v1",
						version,
						source_commit: commit,
						files: inventory,
					},
					null,
					2,
				) + "\n",
			),
			mode: 0o644,
		});
		const content = encodeRuntimeArchive(files),
			record = {
				schema: "grainulator.migration-record.v1",
				version,
				source_commit: commit,
				filename: prefix + ".tar.gz",
				sha256: sha256(content),
				bytes: content.length,
			};
		const out = assertNoSymlinkPath(path.resolve(requestedOutput));
		if (fs.existsSync(out)) throw Error("Output already exists");
		fs.mkdirSync(out);
		fs.writeFileSync(path.join(out, record.filename), content, { flag: "wx" });
		fs.writeFileSync(
			path.join(out, "migration-record.json"),
			JSON.stringify(record, null, 2) + "\n",
			{ flag: "wx" },
		);
		console.log(JSON.stringify(record, null, 2));
	});
} catch (e) {
	console.error("Converter packaging: " + (e as Error).message);
	process.exitCode = 1;
}
