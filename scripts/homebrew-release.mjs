#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	NATIVE_TARGETS,
	readRegular,
	sha256,
	decodeRuntimeArchive,
	verifyAssetFiles,
} from "../lib/runtime-assets.js";

function record(file) {
	return JSON.parse(readRegular(path.resolve(file), 1024 * 1024));
}
function artifact(recordFile, value) {
	if (
		typeof value.filename !== "string" ||
		path.basename(value.filename) !== value.filename ||
		!/^[a-zA-Z0-9._-]+$/.test(value.filename)
	)
		throw Error("Unsafe artifact filename");
	const file = path.join(
			path.dirname(path.resolve(recordFile)),
			value.filename,
		),
		bytes = readRegular(file);
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
}) {
	if (!migrationRecord)
		throw Error("A separately packaged migration converter is required");
	const base = record(baseRecord),
		baseBytes = artifact(baseRecord, base);
	if (
		base.schema !== "grainulator.base-record.v1" ||
		!/^3\.\d+\.\d+$/.test(base.version) ||
		!/^[a-f0-9]{40}$/.test(base.source_commit) ||
		base.bytes > 5 * 1024 * 1024
	)
		throw Error("Invalid frozen base candidate");
	const assets = [],
		copies = [{ name: base.filename, bytes: baseBytes.bytes }];
	for (const file of assetRecords || []) {
		const item = record(file),
			content = artifact(file, item),
			files = decodeRuntimeArchive(content.bytes);
		const metadataBytes = files.get("runtime-asset.json")?.bytes;
		if (
			!NATIVE_TARGETS.includes(item.target) ||
			assets.some((a) => a.target === item.target) ||
			item.source_dirty !== false ||
			item.source_commit !== base.source_commit
		)
			throw Error("Dirty, duplicate or mismatched native candidate");
		if (!metadataBytes || sha256(metadataBytes) !== item.metadata_sha256)
			throw Error("Unbound runtime metadata");
		const metadata = JSON.parse(metadataBytes);
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
	const manifest = {
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
		const migration = record(migrationRecord),
			content = artifact(migrationRecord, migration);
		if (
			migration.schema !== "grainulator.migration-record.v1" ||
			migration.version !== base.version ||
			migration.source_commit !== base.source_commit
		)
			throw Error("Migration converter identity differs");
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
			options = { assetRecords: [] };
		const map = {
			"--base-record": "baseRecord",
			"--migration-record": "migrationRecord",
			"--out": "out",
		};
		for (let i = 0; i < args.length; i++) {
			const arg = args[i],
				value = args[++i];
			if (!value || value.startsWith("--"))
				throw Error("Every option requires a value");
			if (arg === "--asset-record") options.assetRecords.push(value);
			else if (map[arg] && !options[map[arg]]) options[map[arg]] = value;
			else throw Error("Unknown or duplicate option");
		}
		console.log(JSON.stringify(assembleRelease(options), null, 2));
	} catch (e) {
		console.error("Release assembly: " + e.message);
		process.exitCode = 1;
	}
}
