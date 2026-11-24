#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	decodeRuntimeArchive,
	NATIVE_TARGETS,
	readRegular,
	sha256,
	verifyAssetFiles,
} from "../lib/runtime-assets.js";
import type {
	ArtifactRecord,
	AssembleOptions,
	BaseCandidate,
	MigrationCandidate,
	NativeCandidate,
	ReleaseManifest,
	UnknownRecord,
} from "./contracts.mjs";

import {
	verifyBaseArchive,
	verifyMigrationArchive,
} from "./release-archive.mjs";

function record(file: string): UnknownRecord {
	return JSON.parse(String(readRegular(path.resolve(file), 1024 * 1024)));
}
function artifact(
	recordFile: string,
	value: ArtifactRecord,
	maxBytes = 64 * 1024 * 1024,
) {
	if (
		typeof value.filename !== "string" ||
		path.basename(value.filename) !== value.filename ||
		!/^[a-zA-Z0-9._-]+$/.test(value.filename)
	)
		throw Error("Unsafe artifact filename");
	if (
		!Number.isSafeInteger(value.bytes) ||
		value.bytes <= 0 ||
		value.bytes > maxBytes
	)
		throw Error("Invalid candidate artifact size");
	const file = path.join(
			path.dirname(path.resolve(recordFile)),
			value.filename,
		),
		bytes = readRegular(file, maxBytes);
	if (
		!/^[a-f0-9]{64}$/.test(value.sha256 || "") ||
		sha256(bytes) !== value.sha256 ||
		bytes.length !== value.bytes
	)
		throw Error("Candidate artifact changed");
	return { file, bytes };
}
export function assembleRelease({
	baseRecord,
	assetRecords,
	migrationRecord,
	out,
}: AssembleOptions) {
	if (!migrationRecord)
		throw Error("A separately packaged migration converter is required");
	const base = record(baseRecord) as BaseCandidate;
	if (
		base.schema !== "grainulator.base-record.v1" ||
		!/^3\.\d+\.\d+$/.test(base.version) ||
		!/^[a-f0-9]{40}$/.test(base.source_commit) ||
		base.filename !== `grainulator-${base.version}.tgz` ||
		!new RegExp(
			`^release-${base.version.replaceAll(".", "\\.")}-[a-f0-9]{16}$`,
		).test(base.build_id || "")
	)
		throw Error("Invalid frozen base candidate identity");
	const baseBytes = artifact(baseRecord, base, 5 * 1024 * 1024);
	verifyBaseArchive(baseBytes.bytes, {
		version: base.version,
		buildId: base.build_id,
	});
	const assets: ReleaseManifest["assets"] = [],
		copies = [{ name: base.filename, bytes: baseBytes.bytes }];
	for (const file of assetRecords || []) {
		const item = record(file) as NativeCandidate;
		if (
			!NATIVE_TARGETS.includes(item.target) ||
			assets.some((a) => a.target === item.target) ||
			item.source_dirty !== false ||
			item.source_commit !== base.source_commit
		)
			throw Error("Dirty, duplicate or mismatched native candidate");
		if (
			item.filename !==
			`grainulator-runtime-${base.version}-${item.target}.tar.gz`
		)
			throw Error("Invalid native candidate archive identity");
		const content = artifact(file, item),
			files = decodeRuntimeArchive(content.bytes);
		const metadataBytes = files.get("runtime-asset.json")?.bytes;
		if (!metadataBytes || sha256(metadataBytes) !== item.metadata_sha256)
			throw Error("Unbound runtime metadata");
		const metadata = JSON.parse(String(metadataBytes));
		if (metadata.source_dirty !== false)
			throw Error("Dirty runtime bytes cannot be promoted");
		verifyAssetFiles(metadata, files, {
			version: base.version,
			target: item.target,
			sourceCommit: base.source_commit,
		});
		assets.push({
			target: item.target,
			filename: item.filename,
			sha256: item.sha256,
			bytes: item.bytes,
			metadata_sha256: item.metadata_sha256,
		});
		copies.push({ name: item.filename, bytes: content.bytes });
	}
	if (assets.length !== NATIVE_TARGETS.length)
		throw Error("All four frozen native candidates are required");
	const manifest: ReleaseManifest = {
		schema: "grainulator.release.v1",
		version: base.version,
		source_commit: base.source_commit,
		base: {
			filename: base.filename,
			sha256: base.sha256,
			bytes: base.bytes,
			build_id: base.build_id,
		},
		assets: assets.sort((a, b) => a.target.localeCompare(b.target)),
	};
	if (migrationRecord) {
		const migration = record(migrationRecord) as MigrationCandidate;
		if (
			migration.schema !== "grainulator.migration-record.v1" ||
			migration.version !== base.version ||
			migration.source_commit !== base.source_commit ||
			migration.filename !== `grainulator-migrate-${base.version}.tar.gz`
		)
			throw Error("Migration converter identity differs");
		const content = artifact(migrationRecord, migration, 32 * 1024 * 1024);
		verifyMigrationArchive(content.bytes, {
			version: base.version,
			sourceCommit: base.source_commit,
		});
		manifest.migration = {
			filename: migration.filename,
			sha256: migration.sha256,
			bytes: migration.bytes,
		};
		copies.push({ name: migration.filename, bytes: content.bytes });
	}
	if (!out || fs.existsSync(path.resolve(out)))
		throw Error("Select a new output directory");
	fs.mkdirSync(path.resolve(out));
	for (const copy of copies)
		fs.writeFileSync(path.join(out, copy.name), copy.bytes, { flag: "wx" });
	const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
	fs.writeFileSync(path.join(out, "release-manifest.json"), manifestBytes, {
		flag: "wx",
	});
	copies.push({ name: "release-manifest.json", bytes: manifestBytes });
	fs.writeFileSync(
		path.join(out, "SHA256SUMS"),
		copies
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((c) => sha256(c.bytes) + "  " + c.name + "\n")
			.join(""),
		{ flag: "wx" },
	);
	return {
		status: "candidate",
		version: manifest.version,
		source_commit: manifest.source_commit,
		manifest_sha256: sha256(manifestBytes),
		artifacts: copies.map((c) => c.name),
		published: false,
	};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const args = process.argv.slice(2),
			options: Partial<AssembleOptions> & { assetRecords: string[] } = {
				assetRecords: [],
			};
		const map: Record<string, "baseRecord" | "migrationRecord" | "out"> = {
			"--base-record": "baseRecord",
			"--migration-record": "migrationRecord",
			"--out": "out",
		};
		for (let i = 0; i < args.length; i++) {
			const arg = args[i]!,
				value = args[++i];
			if (!value || value.startsWith("--"))
				throw Error("Every option requires a value");
			if (arg === "--asset-record") options.assetRecords.push(value);
			else if (map[arg] && !options[map[arg]!]) options[map[arg]!] = value;
			else throw Error("Unknown or duplicate option");
		}
		console.log(
			JSON.stringify(assembleRelease(options as AssembleOptions), null, 2),
		);
	} catch (_e) {
		const e = _e as Error;
		console.error("Release assembly: " + e.message);
		process.exitCode = 1;
	}
}
