#!/usr/bin/env node
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPath } from "../lib/runtime-assets.js";
// Candidate bytes always come from one committed snapshot, never dirty worktree files.
import type { NpmPack } from "./contracts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha = (bytes: Buffer) =>
	crypto.createHash("sha256").update(bytes).digest("hex");
function run(
	command: string,
	args: string[],
	options: Partial<SpawnSyncOptionsWithStringEncoding> = {},
) {
	const result = spawnSync(command, args, {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		...options,
	});
	if (result.error || result.status !== 0)
		throw Error(
			command +
				" failed: " +
				(result.stderr || result.error?.message || result.status),
		);
	return result.stdout;
}
export function packageRelease({
	out,
	revision,
}: {
	out?: string | undefined;
	revision?: string | undefined;
}) {
	if (!out || !revision)
		throw Error(
			"Explicit --out <new-directory> and --revision <commit> are required",
		);
	out = assertNoSymlinkPath(path.resolve(out));
	if (fs.existsSync(out)) throw Error("Output directory already exists");
	const commit = run("git", [
		"rev-parse",
		"--verify",
		revision + "^{commit}",
	]).trim();
	if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("Invalid source identity");
	// Refuse links/submodules before extracting our own exact Git archive.
	for (const entry of run("git", ["ls-tree", "-rz", "--full-tree", commit])
		.split("\0")
		.filter(Boolean)) {
		if (!/^(100644|100755) blob /.test(entry))
			throw Error("Candidate source contains a nonregular entry");
	}
	const stage = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-release-"));
	const source = path.join(stage, "source");
	fs.mkdirSync(source);
	const archive = path.join(stage, "source.tar");
	const archived = spawnSync("git", ["archive", "--format=tar", commit], {
		cwd: root,
		maxBuffer: 64 * 1024 * 1024,
	});
	if (archived.error || archived.status !== 0)
		throw Error("Cannot read committed snapshot");
	fs.writeFileSync(archive, archived.stdout, { flag: "wx" });
	run("tar", ["-xf", archive, "-C", source]);
	const pkg = JSON.parse(
		String(fs.readFileSync(path.join(source, "package.json"))),
	);
	if (!/^3\.\d+\.\d+$/.test(pkg.version))
		throw Error("Candidate must declare a plain v3 release version");
	run(process.execPath, [path.join(source, "scripts/build-identity.mjs")], {
		cwd: source,
	});
	const identity = JSON.parse(
		String(fs.readFileSync(path.join(source, "build-info.json"))),
	);
	const packed = (
		JSON.parse(
			String(
				run(
					"npm",
					["pack", "--ignore-scripts", "--json", "--pack-destination", stage],
					{ cwd: source },
				),
			),
		) as [NpmPack]
	)[0];
	if (packed.size > 5 * 1024 * 1024) throw Error("Base archive exceeds5MiB");
	if (
		packed.files.some(
			(f) =>
				f.path.startsWith("migration/") ||
				f.path.startsWith("packages/legacy-cli/"),
		)
	)
		throw Error("Normal base contains retired runtime or separate converter");
	const content = fs.readFileSync(path.join(stage, packed.filename));
	const record = {
		schema: "grainulator.base-record.v1",
		version: pkg.version,
		source_commit: commit,
		filename: "grainulator-" + pkg.version + ".tgz",
		sha256: sha(content),
		bytes: content.length,
		build_id: identity.id,
	};
	fs.mkdirSync(out);
	fs.writeFileSync(path.join(out, record.filename), content, { flag: "wx" });
	fs.writeFileSync(
		path.join(out, "base-record.json"),
		JSON.stringify(record, null, 2) + "\n",
		{ flag: "wx" },
	);
	console.log(JSON.stringify({ status: "candidate", ...record, out }, null, 2));
	return record;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2),
		options: Record<string, string | undefined> = {};
	for (let i = 0; i < args.length; i++) {
		if (
			!["--out", "--revision"].includes(args[i]!) ||
			!args[i + 1] ||
			options[args[i]!]
		)
			throw Error(
				"Usage: node scripts/package-release.mjs --revision COMMIT --out NEW-DIRECTORY",
			);
		options[args[i]!] = args[++i];
	}
	try {
		packageRelease({ out: options["--out"], revision: options["--revision"] });
	} catch (e) {
		console.error((e as Error).message);
		process.exitCode = 1;
	}
}
