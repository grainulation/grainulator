// Generated from typescript/lib/runtime-assets.ts; edit that source and run npm run build:types.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
export const RUNTIME_BINARIES = [
	"check",
	"verify",
	"run",
	"hook",
	"lessons",
].map((name) => `grainulator-runtime-${name}`);
export const RUNTIME_SCHEMAS = [
	"claim",
	"run",
	"result",
	"trace",
	"lessons",
].map((name) => `schemas/${name}.schema.json`);
export const RUNTIME_FILES = [...RUNTIME_BINARIES, ...RUNTIME_SCHEMAS];
export const NATIVE_TARGETS = [
	"aarch64-apple-darwin",
	"x86_64-apple-darwin",
	"aarch64-unknown-linux-musl",
	"x86_64-unknown-linux-musl",
];
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_EXPANDED = 256 * 1024 * 1024;
export const sha256 = (bytes) =>
	crypto.createHash("sha256").update(bytes).digest("hex");
export function currentTarget() {
	const targets = {
		"darwin:arm64": NATIVE_TARGETS[0],
		"darwin:x64": NATIVE_TARGETS[1],
		"linux:arm64": NATIVE_TARGETS[2],
		"linux:x64": NATIVE_TARGETS[3],
	};
	const target = targets[`${process.platform}:${process.arch}`];
	if (!target)
		throw new Error(
			`Native runtime is not supported on ${process.platform}/${process.arch}`,
		);
	return target;
}
export function runtimeVersion() {
	return JSON.parse(
		fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	).version;
}
export function runtimeCache(home = os.homedir()) {
	return path.join(home, ".grainulator", "runtime", "bin");
}
export function assertNoSymlinkPath(file) {
	let absolute = path.resolve(file);
	if (process.platform === "darwin")
		for (const systemAlias of ["/var", "/tmp"]) {
			if (absolute.startsWith(systemAlias + path.sep))
				absolute =
					fs.realpathSync(systemAlias) + absolute.slice(systemAlias.length);
		}
	let cursor = path.parse(absolute).root;
	for (const part of absolute
		.slice(cursor.length)
		.split(path.sep)
		.filter(Boolean)) {
		cursor = path.join(cursor, part);
		try {
			if (fs.lstatSync(cursor).isSymbolicLink())
				throw new Error(`Symlinked runtime path is not allowed: ${cursor}`);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return absolute;
}
export function readRegular(file, max = MAX_EXPANDED) {
	file = assertNoSymlinkPath(file);
	const fd = fs.openSync(
		file,
		fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
	);
	try {
		const before = fs.fstatSync(fd);
		if (!before.isFile() || before.nlink !== 1 || before.size > max)
			throw new Error("Expected a bounded, unlinked regular runtime file");
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
			after.nlink !== 1 ||
			after.size !== before.size ||
			after.mtimeMs !== before.mtimeMs ||
			after.ctimeMs !== before.ctimeMs
		)
			throw new Error("Runtime file changed while reading");
		return bytes.subarray(0, length);
	} finally {
		fs.closeSync(fd);
	}
}
function octal(bytes) {
	const text = bytes.toString("ascii").replace(/\0.*$/s, "").trim();
	if (!/^[0-7]+$/.test(text)) throw new Error("Invalid tar integer");
	return Number.parseInt(text, 8);
}
function cstring(bytes) {
	return bytes.toString("utf8").replace(/\0.*$/s, "");
}
export function decodeRuntimeArchive(bytes) {
	if (bytes.length > MAX_ARCHIVE)
		throw new Error("Runtime archive exceeds compressed limit");
	const tar = zlib.gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED });
	const files = new Map();
	const folded = new Set();
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) {
			if (tar.subarray(offset).some((byte) => byte !== 0))
				throw new Error("Unexpected data after tar terminator");
			return files;
		}
		const checksum = octal(header.subarray(148, 156));
		let actual = 0;
		for (let i = 0; i < 512; i++)
			actual += i >= 148 && i < 156 ? 32 : header.readUInt8(i);
		if (checksum !== actual) throw new Error("Invalid tar header checksum");
		const prefix = cstring(header.subarray(345, 500));
		const name = cstring(header.subarray(0, 100));
		if (prefix || ![...RUNTIME_FILES, "runtime-asset.json"].includes(name))
			throw new Error("Unexpected or unsafe runtime archive path");
		const key = name.toLowerCase();
		if (folded.has(key)) throw new Error("Duplicate runtime archive path");
		folded.add(key);
		if (![0, 48].includes(header.readUInt8(156)))
			throw new Error("Runtime archives accept regular files only");
		if (cstring(header.subarray(157, 257)))
			throw new Error("Runtime archive links are forbidden");
		const mode = octal(header.subarray(100, 108));
		const expectedMode = RUNTIME_BINARIES.includes(name) ? 0o755 : 0o644;
		if (mode !== expectedMode) throw new Error("Unexpected runtime file mode");
		const size = octal(header.subarray(124, 136));
		if (
			!Number.isSafeInteger(size) ||
			size < 1 ||
			offset + 512 + size > tar.length ||
			files.size >= 11
		)
			throw new Error("Invalid runtime archive size");
		files.set(name, {
			bytes: Buffer.from(tar.subarray(offset + 512, offset + 512 + size)),
			mode,
		});
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	throw new Error("Runtime archive has no complete terminator");
}
// Deterministic bounded ustar writer used by the candidate packager. No platform
// tar extraction, link handling, lifecycle scripts or executable discovery.
export function encodeRuntimeArchive(files) {
	const parts = [];
	for (const [name, file] of files) {
		const header = Buffer.alloc(512);
		const write = (value, start, length) =>
			header.write(value, start, length, "ascii");
		const oct = (number, length) =>
			`${number.toString(8).padStart(length - 1, "0")}\0`;
		write(name, 0, 100);
		write(oct(file.mode, 8), 100, 8);
		write(oct(0, 8), 108, 8);
		write(oct(0, 8), 116, 8);
		write(oct(file.bytes.length, 12), 124, 12);
		write(oct(0, 12), 136, 12);
		header.fill(32, 148, 156);
		header[156] = 48;
		write("ustar\0", 257, 6);
		write("00", 263, 2);
		const checksum = header.reduce((sum, byte) => sum + byte, 0);
		write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
		parts.push(
			header,
			file.bytes,
			Buffer.alloc((512 - (file.bytes.length % 512)) % 512),
		);
	}
	return zlib.gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]), {
		level: 9,
	});
}
export function verifyAssetFiles(
	metadata,
	files,
	{ version, target, sourceCommit } = {},
) {
	if (
		metadata.schema !== "grainulator.runtime.asset.v1" ||
		metadata.version !== version ||
		metadata.target !== target ||
		metadata.source_commit !== sourceCommit
	)
		throw new Error("Runtime asset identity mismatch");
	if (
		!metadata.files ||
		Object.keys(metadata.files).sort().join("\n") !==
			[...RUNTIME_FILES].sort().join("\n")
	)
		throw new Error(
			"Runtime metadata must list every canonical binary and schema",
		);
	for (const name of RUNTIME_FILES) {
		const expected = metadata.files[name],
			actual = files.get(name);
		const mode = RUNTIME_BINARIES.includes(name) ? 0o755 : 0o644;
		if (
			!actual ||
			expected.mode !== mode ||
			actual.mode !== mode ||
			expected.size !== actual.bytes.length ||
			expected.sha256 !== sha256(actual.bytes)
		)
			throw new Error(`Runtime file verification failed: ${name}`);
		if (RUNTIME_BINARIES.includes(name))
			verifyNativeFormat(actual.bytes, target);
		if (RUNTIME_SCHEMAS.includes(name)) {
			const kind = path.basename(name, ".schema.json");
			if (
				JSON.parse(actual.bytes.toString("utf8")).$id !==
				`urn:grainulator:runtime:${kind}:1`
			)
				throw new Error("Noncanonical runtime schema identity");
		}
	}
	if (
		files.size !== RUNTIME_FILES.length + 1 ||
		!files.has("runtime-asset.json")
	)
		throw new Error("Runtime archive inventory mismatch");
}
export function verifyNativeFormat(bytes, target) {
	if (target?.endsWith("apple-darwin")) {
		const cpu = target.startsWith("aarch64-") ? 0x0100000c : 0x01000007;
		if (
			bytes.length < 32 ||
			bytes.readUInt32LE(0) !== 0xfeedfacf ||
			bytes.readUInt32LE(4) !== cpu
		)
			throw new Error("Native binary OS/CPU differs from declared target");
		const commands = bytes.readUInt32LE(16);
		let offset = 32;
		for (let i = 0; i < commands; i++) {
			if (offset + 8 > bytes.length)
				throw new Error("Invalid Mach-O load commands");
			const command = bytes.readUInt32LE(offset),
				size = bytes.readUInt32LE(offset + 4);
			if (size < 8 || offset + size > bytes.length)
				throw new Error("Invalid Mach-O load command length");
			if ([0xc, 0x80000018, 0x8000001f].includes(command)) {
				const nameOffset = bytes.readUInt32LE(offset + 8);
				if (nameOffset >= size)
					throw new Error("Invalid native library reference");
				const library = cstring(
					bytes.subarray(offset + nameOffset, offset + size),
				);
				if (
					!library.startsWith("/usr/lib/") &&
					!library.startsWith("/System/Library/")
				)
					throw new Error(
						"Native runtime must not depend on Homebrew or private libraries",
					);
			}
			offset += size;
		}
	} else if (target?.endsWith("unknown-linux-musl")) {
		const cpu = target.startsWith("aarch64-") ? 183 : 62;
		if (
			bytes.length < 64 ||
			!bytes.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) ||
			bytes[4] !== 2 ||
			bytes[5] !== 1 ||
			bytes.readUInt16LE(18) !== cpu
		)
			throw new Error("Native binary OS/CPU differs from declared target");
		const start = Number(bytes.readBigUInt64LE(32)),
			size = bytes.readUInt16LE(54),
			count = bytes.readUInt16LE(56);
		if (
			!Number.isSafeInteger(start) ||
			size < 56 ||
			start + size * count > bytes.length
		)
			throw new Error("Invalid ELF program headers");
		for (let i = 0; i < count; i++)
			if (bytes.readUInt32LE(start + i * size) === 3)
				throw new Error(
					"Linux native runtime must be static musl, without an ELF interpreter",
				);
	} else throw new Error("Unsupported native binary target");
}
function trustedRelease(
	manifestBytes,
	trustedManifestSha256,
	target,
	version,
	archiveBytes,
) {
	if (
		!/^[a-f0-9]{64}$/.test(trustedManifestSha256 || "") ||
		sha256(manifestBytes) !== trustedManifestSha256
	)
		throw new Error(
			"Release manifest does not match the independently trusted SHA-256 pin",
		);
	const release = JSON.parse(manifestBytes.toString("utf8"));
	if (
		release.schema !== "grainulator.release.v1" ||
		release.version !== version ||
		!/^[a-f0-9]{40}$/.test(release.source_commit || "") ||
		!Array.isArray(release.assets)
	)
		throw new Error("Invalid release manifest identity");
	if (
		new Set(release.assets.map((asset) => asset.target)).size !==
		release.assets.length
	)
		throw new Error("Duplicate release asset target");
	const asset = release.assets.find((item) => item.target === target);
	if (
		!asset ||
		asset.filename !== `grainulator-runtime-${version}-${target}.tar.gz` ||
		asset.bytes !== archiveBytes.length ||
		asset.sha256 !== sha256(archiveBytes)
	)
		throw new Error("Runtime archive is not the pinned release asset");
	return release;
}
export function installRuntimeAsset({
	archive,
	manifest,
	trustedManifestSha256,
	home = os.homedir(),
	version = runtimeVersion(),
	target = currentTarget(),
}) {
	if (
		!NATIVE_TARGETS.includes(target) ||
		!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)
	)
		throw new Error("Unsupported native target or version");
	const archiveBytes = readRegular(archive, MAX_ARCHIVE),
		manifestBytes = readRegular(manifest, 1024 * 1024);
	const release = trustedRelease(
		manifestBytes,
		trustedManifestSha256,
		target,
		version,
		archiveBytes,
	);
	const files = decodeRuntimeArchive(archiveBytes);
	const metadataBytes = files.get("runtime-asset.json")?.bytes;
	if (
		!metadataBytes ||
		release.assets.find((item) => item.target === target).metadata_sha256 !==
			sha256(metadataBytes)
	)
		throw new Error("Runtime metadata differs from the pinned release");
	const metadata = JSON.parse(metadataBytes.toString("utf8"));
	verifyAssetFiles(metadata, files, {
		version,
		target,
		sourceCommit: release.source_commit,
	});
	const base = assertNoSymlinkPath(runtimeCache(home));
	fs.mkdirSync(base, { recursive: true, mode: 0o700 });
	const releaseDir = path.join(base, version);
	assertNoSymlinkPath(releaseDir);
	fs.mkdirSync(releaseDir, { recursive: true, mode: 0o700 });
	const destination = path.join(releaseDir, target);
	if (fs.existsSync(destination)) {
		const existing = verifyInstalledAsset(destination, { version, target });
		if (existing.manifest_sha256 !== trustedManifestSha256)
			throw new Error(
				"Installed runtime release conflicts with pinned manifest",
			);
		return { ...existing, installed: false, unchanged: true };
	}
	const staging = fs.mkdtempSync(path.join(releaseDir, ".install-"));
	try {
		fs.mkdirSync(path.join(staging, "schemas"), { mode: 0o700 });
		for (const [name, file] of files)
			fs.writeFileSync(path.join(staging, name), file.bytes, {
				flag: "wx",
				mode: file.mode,
			});
		fs.writeFileSync(
			path.join(staging, ".install-receipt.json"),
			`${JSON.stringify({
				schema: "grainulator.runtime.install.v1",
				manifest_sha256: trustedManifestSha256,
				manifest: manifestBytes.toString("base64"),
				archive_sha256: sha256(archiveBytes),
			})}\n`,
			{ flag: "wx", mode: 0o600 },
		);
		// mkdir is an exclusive reservation; rename only into that operation's empty
		// destination. A competing installer cannot overwrite an already active asset.
		fs.mkdirSync(destination, { mode: 0o700 });
		try {
			fs.renameSync(staging, destination);
		} catch (error) {
			fs.rmdirSync(destination);
			throw error;
		}
	} finally {
		if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
	}
	return {
		...verifyInstalledAsset(destination, { version, target }),
		installed: true,
	};
}
export function verifyInstalledAsset(
	directory,
	{ version = runtimeVersion(), target = currentTarget() } = {},
) {
	const assetDirectory = assertNoSymlinkPath(directory);
	const metadataBytes = readRegular(
		path.join(assetDirectory, "runtime-asset.json"),
		128 * 1024,
	);
	const metadata = JSON.parse(metadataBytes.toString("utf8"));
	const receipt = JSON.parse(
		readRegular(
			path.join(assetDirectory, ".install-receipt.json"),
			2 * 1024 * 1024,
		).toString("utf8"),
	);
	if (receipt.schema !== "grainulator.runtime.install.v1")
		throw new Error("Missing trusted runtime install receipt");
	const manifestBytes = Buffer.from(receipt.manifest || "", "base64");
	if (sha256(manifestBytes) !== receipt.manifest_sha256)
		throw new Error("Stored runtime manifest changed");
	const release = JSON.parse(manifestBytes.toString("utf8"));
	if (
		release.schema !== "grainulator.release.v1" ||
		release.version !== version ||
		!release.assets?.some(
			(item) =>
				item.target === target && item.sha256 === receipt.archive_sha256,
		)
	)
		throw new Error("Installed runtime receipt identity mismatch");
	if (
		release.assets.find((item) => item.target === target)?.metadata_sha256 !==
		sha256(metadataBytes)
	)
		throw new Error("Installed metadata differs from trusted release");
	const files = new Map([
		["runtime-asset.json", { bytes: metadataBytes, mode: 0o644 }],
	]);
	for (const name of RUNTIME_FILES) {
		const filename = path.join(assetDirectory, name),
			bytes = readRegular(filename);
		files.set(name, { bytes, mode: fs.statSync(filename).mode & 0o7777 });
	}
	verifyAssetFiles(metadata, files, {
		version,
		target,
		sourceCommit: release.source_commit,
	});
	return {
		status: "available",
		version,
		target,
		asset_directory: assetDirectory,
		source_commit: metadata.source_commit,
		manifest_sha256: receipt.manifest_sha256,
		checker_sha256: metadata.files["grainulator-runtime-check"].sha256,
	};
}
export function resolveRuntimeAsset({
	home = os.homedir(),
	version = runtimeVersion(),
	target = currentTarget(),
	directory = process.env.GRAINULATOR_RUNTIME_ASSET_DIR,
} = {}) {
	return verifyInstalledAsset(
		directory || path.join(runtimeCache(home), version, target),
		{ version, target },
	);
}
export function inspectRuntimeInstallation(options = {}) {
	try {
		return {
			...resolveRuntimeAsset(options),
			origin: process.env.GRAINULATOR_RUNTIME_ASSET_DIR
				? "explicit-asset"
				: "user-cache",
			live_host: "unknown",
		};
	} catch (caught) {
		const error = caught;
		return {
			status: error.code === "ENOENT" ? "not-installed" : "invalid",
			version: options.version || runtimeVersion(),
			origin: process.env.GRAINULATOR_RUNTIME_ASSET_DIR
				? "explicit-asset"
				: "user-cache",
			live_host: "unknown",
			...(error.code === "ENOENT"
				? {}
				: {
						error: "Runtime asset failed local integrity or format validation.",
					}),
		};
	}
}
