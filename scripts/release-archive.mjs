// Generated from typescript/scripts/release-archive.mts; edit that source and run npm run build:types.
// Bounded, read-only archive inspection. Never delegate archive paths to tar extraction.
import crypto from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";
import { portableMcpBytes } from "../lib/build-info.js";
import { sha256 } from "../lib/runtime-assets.js";
const string = (bytes) => bytes.toString("utf8").replace(/\0.*$/s, "");
const octal = (bytes) => {
	const value = string(bytes).trim();
	if (!/^[0-7]+$/.test(value)) throw Error("Invalid release archive integer");
	const parsed = Number.parseInt(value, 8);
	if (!Number.isSafeInteger(parsed))
		throw Error("Oversized release archive integer");
	return parsed;
};
export function readReleaseArchive(bytes, maxCompressed = 32 * 1024 * 1024) {
	if (bytes.length > maxCompressed)
		throw Error("Release archive exceeds compressed bound");
	const tar = zlib.gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
	const files = new Map(),
		seen = new Set();
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) {
			if (tar.subarray(offset).some((byte) => byte !== 0))
				throw Error("Data after release tar terminator");
			return files;
		}
		let checksum = 0;
		for (let i = 0; i < 512; i++)
			checksum += i >= 148 && i < 156 ? 32 : header[i];
		if (checksum !== octal(header.subarray(148, 156)))
			throw Error("Invalid release tar checksum");
		const prefix = string(header.subarray(345, 500));
		const name = (prefix ? prefix + "/" : "") + string(header.subarray(0, 100));
		if (
			!name ||
			name.includes("\\") ||
			name.includes(":") ||
			path.posix.isAbsolute(name) ||
			name.split("/").some((part) => !part || part === "." || part === "..")
		)
			throw Error("Unsafe release archive path");
		const folded = name.toLowerCase();
		if (seen.has(folded)) throw Error("Duplicate release archive path");
		seen.add(folded);
		if (![0, 48].includes(header[156]) || string(header.subarray(157, 257)))
			throw Error("Release archives require regular files without links");
		const mode = octal(header.subarray(100, 108));
		if (![0o644, 0o755].includes(mode))
			throw Error("Unsafe release archive mode");
		const size = octal(header.subarray(124, 136));
		if (
			size > 32 * 1024 * 1024 ||
			offset + 512 + size > tar.length ||
			files.size >= 2048
		)
			throw Error("Release archive member exceeds bounds");
		files.set(name, {
			bytes: Buffer.from(tar.subarray(offset + 512, offset + 512 + size)),
			mode,
		});
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	throw Error("Release archive has no complete terminator");
}
const object = (value) =>
	value !== null && typeof value === "object" && !Array.isArray(value);
const json = (files, name) => {
	const bytes = files.get(name)?.bytes;
	if (!bytes) throw Error("Missing archive identity member: " + name);
	const value = JSON.parse(String(bytes));
	if (!object(value)) throw Error("Expected archive JSON object");
	return value;
};
export function verifyBaseArchive(bytes, { version, buildId }) {
	const files = readReleaseArchive(bytes, 5 * 1024 * 1024);
	if ([...files.keys()].some((name) => !name.startsWith("package/")))
		throw Error("Unexpected base archive namespace");
	const pkg = json(files, "package/package.json"),
		build = json(files, "package/build-info.json");
	if (
		pkg.name !== "@grainulation/grainulator" ||
		pkg.version !== version ||
		build.schema !== 1 ||
		build.version !== version ||
		build.id !== buildId ||
		!object(build.files)
	)
		throw Error("Base archive identity differs from release record");
	const names = [...files.keys()]
		.map((name) => name.slice(8))
		.filter((name) => name !== "build-info.json")
		.sort();
	if (
		!names.length ||
		JSON.stringify(Object.keys(build.files).sort()) !== JSON.stringify(names)
	)
		throw Error("Base archive build inventory differs");
	const digest = crypto.createHash("sha256");
	for (const name of names) {
		const raw = files.get("package/" + name).bytes;
		const content = [".mcp.json", "mcp.json"].includes(name)
			? portableMcpBytes(raw)
			: raw;
		if (build.files[name] !== sha256(content))
			throw Error("Base archive file differs from build identity: " + name);
		digest.update(name).update("\0").update(content).update("\0");
	}
	const sourceHash = digest.digest("hex");
	if (
		build.source_sha256 !== sourceHash ||
		buildId !== `release-${version}-${sourceHash.slice(0, 16)}`
	)
		throw Error("Base archive build digest differs from release identity");
	return { version, build_id: buildId, files };
}
export function verifyMigrationArchive(bytes, { version, sourceCommit }) {
	const files = readReleaseArchive(bytes),
		prefix = `grainulator-migrate-${version}/`;
	const members = ["converter.mjs", "remote.mjs", "README.md", "LICENSE"];
	const expected = members
		.concat("manifest.json")
		.map((name) => prefix + name)
		.sort();
	if (JSON.stringify([...files.keys()].sort()) !== JSON.stringify(expected))
		throw Error("Converter archive inventory differs");
	const manifest = json(files, prefix + "manifest.json");
	if (
		manifest.schema !== "grainulator.migration-asset.v1" ||
		manifest.version !== version ||
		manifest.source_commit !== sourceCommit ||
		!object(manifest.files) ||
		JSON.stringify(Object.keys(manifest.files).sort()) !==
			JSON.stringify(members.slice().sort())
	)
		throw Error("Converter archive identity differs");
	for (const name of members) {
		if (manifest.files[name] !== sha256(files.get(prefix + name).bytes))
			throw Error("Converter archive member changed: " + name);
		if (
			files.get(prefix + name).mode !==
			(name === "converter.mjs" ? 0o755 : 0o644)
		)
			throw Error("Converter archive mode differs");
	}
	return { prefix, files };
}
