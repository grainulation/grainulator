#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertNoSymlinkPath,
	encodeRuntimeArchive,
	NATIVE_TARGETS,
	RUNTIME_BINARIES,
	RUNTIME_SCHEMAS,
	readRegular,
	runtimeVersion,
	sha256,
} from "../lib/runtime-assets.js";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = process.argv.slice(2);
function option(name: string, fallback?: string) {
	const index = args.indexOf(name);
	if (index < 0) return fallback;
	if (!args[index + 1] || args[index + 1]!.startsWith("--"))
		throw new Error(`${name} requires a value`);
	return args[index + 1];
}
// Cargo may hardlink target/release outputs to its deps directory. Only this
// build-input reader accepts those links; installed assets remain single-link.
export function readBuildBinary(file: string, max = 256 * 1024 * 1024) {
	const fd = fs.openSync(
		assertNoSymlinkPath(file),
		fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
	);
	try {
		const before = fs.fstatSync(fd);
		if (
			!before.isFile() ||
			before.nlink < 1 ||
			before.size < 1 ||
			before.size > max
		)
			throw new Error("Expected a bounded regular build binary");
		const bytes = Buffer.alloc(before.size + 1);
		let length = 0;
		while (length < bytes.length) {
			const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
			if (!count) break;
			length += count;
		}
		const after = fs.fstatSync(fd);
		if (
			length !== before.size ||
			after.size !== before.size ||
			after.mtimeMs !== before.mtimeMs ||
			after.ctimeMs !== before.ctimeMs ||
			after.nlink !== before.nlink
		)
			throw new Error("Build binary changed while reading");
		return bytes.subarray(0, length);
	} finally {
		fs.closeSync(fd);
	}
}
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		if (args.includes("--help")) {
			console.log(
				"node scripts/package-native.mjs --bin-dir <built-target-directory> --target <Rust-triple> --source-commit <40hex> --out <new-directory> [--version <version>]\nBuild separately with cargo build --locked --release --target <triple>. Candidate archives contain only canonical native binaries and offline schemas. --allow-dirty is development-only and prevents release promotion.",
			);
			process.exit(0);
		}
		const version = option("--version", runtimeVersion());
		const target = option("--target");
		const sourceCommit = option("--source-commit");
		const binDir = option("--bin-dir");
		const out = option("--out");
		if (
			!binDir ||
			!out ||
			!NATIVE_TARGETS.includes(target!) ||
			!/^[a-f0-9]{40}$/.test(sourceCommit || "") ||
			version !== runtimeVersion()
		)
			throw new Error(
				"Version, target, source commit, bin directory and new output directory are required",
			);
		const git = (argv: string[]) => {
			const result = spawnSync("git", argv, { cwd: root, encoding: "utf8" });
			if (result.status !== 0)
				throw new Error("Cannot establish candidate source identity");
			return result.stdout.trim();
		};
		if (git(["rev-parse", "HEAD"]) !== sourceCommit)
			throw new Error("Candidate commit must be the checked-out source HEAD");
		const dirty = Boolean(
			git(["status", "--porcelain", "--untracked-files=normal"]),
		);
		if (dirty && !args.includes("--allow-dirty"))
			throw new Error(
				"Candidate source is dirty; freeze and commit it before packaging",
			);
		const files = new Map();
		for (const name of RUNTIME_BINARIES)
			files.set(name, {
				bytes: readBuildBinary(path.resolve(binDir, name)),
				mode: 0o755,
			});
		for (const name of RUNTIME_SCHEMAS)
			files.set(name, {
				bytes: readRegular(path.join(root, "packages/runtime", name)),
				mode: 0o644,
			});
		const metadata = {
			schema: "grainulator.runtime.asset.v1",
			version,
			target,
			source_commit: sourceCommit,
			source_dirty: dirty,
			files: Object.fromEntries(
				[...files].map(([name, file]) => [
					name,
					{
						sha256: sha256(file.bytes),
						size: file.bytes.length,
						mode: file.mode,
					},
				]),
			),
		};
		const metadataBytes = Buffer.from(JSON.stringify(metadata, null, 2) + "\n");
		files.set("runtime-asset.json", { bytes: metadataBytes, mode: 0o644 });
		const archive = encodeRuntimeArchive(files);
		const filename = `grainulator-runtime-${version}-${target}.tar.gz`;
		const record = {
			target,
			filename,
			sha256: sha256(archive),
			bytes: archive.length,
			metadata_sha256: sha256(metadataBytes),
			source_commit: sourceCommit,
			source_dirty: dirty,
		};
		fs.mkdirSync(path.resolve(out), { mode: 0o700 });
		fs.writeFileSync(path.join(out, filename), archive, {
			flag: "wx",
			mode: 0o644,
		});
		fs.writeFileSync(path.join(out, "runtime-asset.json"), metadataBytes, {
			flag: "wx",
			mode: 0o644,
		});
		fs.writeFileSync(
			path.join(out, "asset-record.json"),
			JSON.stringify(record, null, 2) + "\n",
			{ flag: "wx", mode: 0o644 },
		);
		console.log(
			JSON.stringify(
				{
					status: "packaged",
					...record,
					directory: path.resolve(out),
					published: false,
				},
				null,
				2,
			),
		);
	} catch (error) {
		console.error(`Grainulator native package: ${(error as Error).message}`);
		process.exitCode = 1;
	}
}
