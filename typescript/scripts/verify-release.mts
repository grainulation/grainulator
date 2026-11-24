#!/usr/bin/env node
// Publication consumes only files bound by the independently carried manifest pin.
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
import type { ReleaseManifest, VerifyOptions } from "./contracts.mjs";
import {
	verifyBaseArchive,
	verifyMigrationArchive,
} from "./release-archive.mjs";

export function verifyRelease({
	directory,
	manifestSha256,
	version,
	sourceCommit,
}: VerifyOptions) {
	const root = path.resolve(directory),
		manifestBytes = readRegular(
			path.join(root, "release-manifest.json"),
			1024 * 1024,
		);
	if (
		!/^[a-f0-9]{64}$/.test(manifestSha256 || "") ||
		sha256(manifestBytes) !== manifestSha256
	)
		throw Error("Release manifest differs from trusted pin");
	const m = JSON.parse(String(manifestBytes)) as ReleaseManifest;
	if (
		m.schema !== "grainulator.release.v1" ||
		!/^3\.\d+\.\d+$/.test(m.version) ||
		!/^[a-f0-9]{40}$/.test(m.source_commit)
	)
		throw Error("Invalid release manifest identity");
	if (
		(version && m.version !== version) ||
		(sourceCommit && m.source_commit !== sourceCommit)
	)
		throw Error("Release tag/source differs from manifest");
	if (
		!m.base ||
		m.base.filename !== "grainulator-" + m.version + ".tgz" ||
		!new RegExp(
			"^release-" + m.version.replaceAll(".", "\\.") + "-[a-f0-9]{16}$",
		).test(m.base.build_id || "")
	)
		throw Error("Invalid base identity");
	if (
		!m.migration ||
		m.migration.filename !== "grainulator-migrate-" + m.version + ".tar.gz"
	)
		throw Error("Separate converter is required");
	if (
		!Array.isArray(m.assets) ||
		m.assets.length !== 4 ||
		new Set(m.assets.map((a) => a.target)).size !== 4 ||
		m.assets.some(
			(a) =>
				!NATIVE_TARGETS.includes(a.target) ||
				a.filename !==
					"grainulator-runtime-" + m.version + "-" + a.target + ".tar.gz" ||
				!/^[a-f0-9]{64}$/.test(a.metadata_sha256 || ""),
		)
	)
		throw Error("Four canonical native assets required");
	const declared = [m.base, ...m.assets, m.migration],
		verified = [];
	for (const item of declared) {
		if (
			typeof item.filename !== "string" ||
			path.basename(item.filename) !== item.filename ||
			!/^[a-zA-Z0-9._-]+$/.test(item.filename) ||
			!/^[a-f0-9]{64}$/.test(item.sha256 || "") ||
			!Number.isSafeInteger(item.bytes) ||
			item.bytes <= 0
		)
			throw Error("Unsafe release record");
		const limit =
			item === m.base
				? 5 * 1024 * 1024
				: item === m.migration
					? 32 * 1024 * 1024
					: 64 * 1024 * 1024;
		const bytes = readRegular(path.join(root, item.filename), limit);
		if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256)
			throw Error(
				"Release artifact differs from trusted manifest: " + item.filename,
			);
		if (item === m.base)
			verifyBaseArchive(bytes, {
				version: m.version,
				buildId: m.base.build_id,
			});
		if (item === m.migration)
			verifyMigrationArchive(bytes, {
				version: m.version,
				sourceCommit: m.source_commit,
			});
		if (
			"target" in item &&
			"metadata_sha256" in item &&
			typeof item.target === "string"
		) {
			const files = decodeRuntimeArchive(bytes),
				metadataBytes = files.get("runtime-asset.json")?.bytes;
			if (!metadataBytes || sha256(metadataBytes) !== item.metadata_sha256)
				throw Error("Native metadata pin mismatch");
			const metadata = JSON.parse(String(metadataBytes));
			if (metadata.source_dirty !== false)
				throw Error("Dirty native source cannot be published");
			verifyAssetFiles(metadata, files, {
				version: m.version,
				target: item.target,
				sourceCommit: m.source_commit,
			});
		}
		verified.push({ filename: item.filename, sha256: item.sha256 });
	}
	verified.push({
		filename: "release-manifest.json",
		sha256: sha256(manifestBytes),
	});
	const expected = verified
		.map((v) => v.filename)
		.concat("SHA256SUMS")
		.sort();
	const actual = fs.readdirSync(root).sort();
	if (JSON.stringify(actual) !== JSON.stringify(expected))
		throw Error("Unexpected or missing release attachment");
	const checksums = verified
		.sort((a, b) => a.filename.localeCompare(b.filename))
		.map((v) => v.sha256 + "  " + v.filename + "\n")
		.join("");
	if (
		readRegular(path.join(root, "SHA256SUMS"), 64 * 1024).toString("utf8") !==
		checksums
	)
		throw Error("Adjacent checksum inventory differs from trusted manifest");
	return {
		status: "verified",
		version: m.version,
		source_commit: m.source_commit,
		manifest_sha256: manifestSha256,
		files: expected.map((f) => path.join(root, f)),
	};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const argv = process.argv.slice(2),
			o: Partial<VerifyOptions> = {},
			map: Record<string, keyof VerifyOptions> = {
				"--directory": "directory",
				"--manifest-sha256": "manifestSha256",
				"--version": "version",
				"--source-commit": "sourceCommit",
			};
		for (let i = 0; i < argv.length; i++) {
			const k = map[argv[i]!],
				v = argv[++i];
			if (!k || !v || o[k])
				throw Error("Unknown, missing or duplicate verification option");
			o[k] = v;
		}
		console.log(JSON.stringify(verifyRelease(o as VerifyOptions), null, 2));
	} catch (_e) {
		const e = _e as Error;
		console.error("Release verification: " + e.message);
		process.exitCode = 1;
	}
}
