import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import test from "node:test";
import {
	encodeRuntimeArchive,
	NATIVE_TARGETS,
	RUNTIME_FILES,
	RUNTIME_SCHEMAS,
	sha256,
} from "../lib/runtime-assets.js";
import { assembleRelease } from "./assemble-release.mjs";
import type { GHRunner } from "./contracts.mjs";
import { verifyRelease } from "./verify-release.mjs";

const version = "3.0.0",
	commit = "a".repeat(40);
// Header-only fixtures exercise packaging identity; they are never executed and
// do not stand in for the separate real native candidate execution gate.
function binaryFixture(target: string) {
	const b = Buffer.alloc(128);
	if (target.endsWith("apple-darwin")) {
		b.writeUInt32LE(0xfeedfacf, 0);
		b.writeUInt32LE(target.startsWith("aarch64-") ? 0x0100000c : 0x01000007, 4);
	} else {
		Buffer.from([127, 69, 76, 70, 2, 1]).copy(b);
		b.writeUInt16LE(target.startsWith("aarch64-") ? 183 : 62, 18);
		b.writeBigUInt64LE(64n, 32);
		b.writeUInt16LE(56, 54);
	}
	return b;
}
function fixture(t: TestContext) {
	const dir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-distribution-")),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const baseDir = path.join(dir, "base");
	fs.mkdirSync(baseDir);
	const packageBytes = Buffer.from(
		JSON.stringify({ name: "@grainulation/grainulator", version }),
	);
	const sourceHash = sha256(
		Buffer.concat([
			Buffer.from("package.json\0"),
			packageBytes,
			Buffer.from("\0"),
		]),
	);
	const buildId = `release-${version}-${sourceHash.slice(0, 16)}`;
	const baseArchive = encodeRuntimeArchive(
		new Map([
			["package/package.json", { bytes: packageBytes, mode: 0o644 }],
			[
				"package/build-info.json",
				{
					bytes: Buffer.from(
						JSON.stringify({
							schema: 1,
							id: buildId,
							version,
							source_sha256: sourceHash,
							files: { "package.json": sha256(packageBytes) },
						}),
					),
					mode: 0o644,
				},
			],
		]),
	);
	const base = {
		schema: "grainulator.base-record.v1",
		version,
		source_commit: commit,
		filename: "grainulator-3.0.0.tgz",
		bytes: baseArchive.length,
		sha256: sha256(baseArchive),
		build_id: buildId,
	};
	fs.writeFileSync(path.join(baseDir, base.filename), baseArchive);
	const baseRecord = path.join(baseDir, "base-record.json");
	fs.writeFileSync(baseRecord, JSON.stringify(base));
	const assetRecords: string[] = [];
	for (const target of NATIVE_TARGETS) {
		const folder = path.join(dir, target);
		fs.mkdirSync(folder);
		const files = new Map(
			RUNTIME_FILES.map((name) => [
				name,
				{
					bytes: RUNTIME_SCHEMAS.includes(name)
						? Buffer.from(
								JSON.stringify({
									$id:
										"urn:grainulator:runtime:" +
										path.basename(name, ".schema.json") +
										":1",
								}),
							)
						: binaryFixture(target),
					mode: name.startsWith("schemas/") ? 0o644 : 0o755,
				},
			]),
		);
		const metadata = {
			schema: "grainulator.runtime.asset.v1",
			version,
			target,
			source_commit: commit,
			source_dirty: false,
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
		const metadataBytes = Buffer.from(JSON.stringify(metadata));
		files.set("runtime-asset.json", { bytes: metadataBytes, mode: 0o644 });
		const archive = encodeRuntimeArchive(files),
			filename = "grainulator-runtime-" + version + "-" + target + ".tar.gz";
		fs.writeFileSync(path.join(folder, filename), archive);
		const record = path.join(folder, "asset-record.json");
		fs.writeFileSync(
			record,
			JSON.stringify({
				target,
				filename,
				bytes: archive.length,
				sha256: sha256(archive),
				metadata_sha256: sha256(metadataBytes),
				source_commit: commit,
				source_dirty: false,
			}),
		);
		assetRecords.push(record);
	}
	const migrationDir = path.join(dir, "migration");
	fs.mkdirSync(migrationDir);
	const migrationRecord = path.join(migrationDir, "migration-record.json");
	const converterFiles = new Map(
		["converter.mjs", "remote.mjs", "README.md", "LICENSE"].map((name) => [
			`grainulator-migrate-${version}/${name}`,
			{
				bytes: Buffer.from(name.endsWith(".mjs") ? "export {};\n" : name),
				mode: name === "converter.mjs" ? 0o755 : 0o644,
			},
		]),
	);
	converterFiles.set(`grainulator-migrate-${version}/manifest.json`, {
		bytes: Buffer.from(
			JSON.stringify({
				schema: "grainulator.migration-asset.v1",
				version,
				source_commit: commit,
				files: Object.fromEntries(
					[...converterFiles].map(([name, file]) => [
						name.split("/").pop(),
						sha256(file.bytes),
					]),
				),
			}),
		),
		mode: 0o644,
	});
	const converter = encodeRuntimeArchive(converterFiles);
	fs.writeFileSync(
		path.join(migrationDir, "grainulator-migrate-3.0.0.tar.gz"),
		converter,
	);
	fs.writeFileSync(
		migrationRecord,
		JSON.stringify({
			schema: "grainulator.migration-record.v1",
			version,
			source_commit: commit,
			filename: "grainulator-migrate-3.0.0.tar.gz",
			bytes: converter.length,
			sha256: sha256(converter),
		}),
	);
	return { dir, baseRecord, assetRecords, migrationRecord };
}
test("frozen candidate set yields pinned release without publication", (t) => {
	const f = fixture(t),
		out = path.join(f.dir, "release");
	const result = assembleRelease({ ...f, out });
	assert.equal(result.published, false);
	assert.equal(result.artifacts.length, 7);
	assert.equal(
		verifyRelease({
			directory: out,
			manifestSha256: result.manifest_sha256,
			version,
			sourceCommit: commit,
		}).status,
		"verified",
	);
	assert.throws(
		() => verifyRelease({ directory: out, manifestSha256: "0".repeat(64) }),
		/trusted pin/,
	);
	fs.appendFileSync(path.join(out, "grainulator-3.0.0.tgz"), "changed");
	assert.throws(
		() =>
			verifyRelease({ directory: out, manifestSha256: result.manifest_sha256 }),
		/differ/,
	);
});
test("missing, duplicate, dirty, mismatched and modified native candidates cannot be promoted", (t) => {
	const f = fixture(t);
	assert.throws(
		() =>
			assembleRelease({
				...f,
				assetRecords: f.assetRecords.slice(1),
				out: path.join(f.dir, "missing"),
			}),
		/All four/,
	);
	assert.throws(
		() =>
			assembleRelease({
				...f,
				assetRecords: [...f.assetRecords.slice(1), f.assetRecords[1]!],
				out: path.join(f.dir, "dup"),
			}),
		/duplicate/,
	);
	const file = f.assetRecords[0]!,
		original = fs.readFileSync(file),
		record = JSON.parse(String(original));
	fs.writeFileSync(file, JSON.stringify({ ...record, source_dirty: true }));
	assert.throws(
		() => assembleRelease({ ...f, out: path.join(f.dir, "dirty") }),
		/Dirty/,
	);
	fs.writeFileSync(
		file,
		JSON.stringify({ ...record, source_commit: "b".repeat(40) }),
	);
	assert.throws(
		() => assembleRelease({ ...f, out: path.join(f.dir, "mismatch") }),
		/mismatched/,
	);
	fs.writeFileSync(file, original);
	fs.appendFileSync(path.join(path.dirname(file), record.filename), "changed");
	assert.throws(
		() => assembleRelease({ ...f, out: path.join(f.dir, "tamper") }),
		/changed/,
	);
});

test("publisher rejects modified bytes plus rewritten adjacent checksums, extras and missing assets", (t) => {
	const f = fixture(t),
		out = path.join(f.dir, "release");
	const result = assembleRelease({ ...f, out }),
		options = {
			directory: out,
			manifestSha256: result.manifest_sha256,
			version,
			sourceCommit: commit,
		};
	fs.writeFileSync(path.join(out, "unexpected.txt"), "must not publish");
	assert.throws(() => verifyRelease(options), /Unexpected/);
	fs.unlinkSync(path.join(out, "unexpected.txt"));
	const artifact = path.join(out, "grainulator-3.0.0.tgz"),
		original = fs.readFileSync(artifact),
		checksums = fs.readFileSync(path.join(out, "SHA256SUMS"));
	fs.writeFileSync(
		artifact,
		Buffer.concat([original, Buffer.from("modified")]),
	);
	fs.writeFileSync(
		path.join(out, "SHA256SUMS"),
		checksums
			.toString()
			.replace(sha256(original), sha256(fs.readFileSync(artifact))),
	);
	assert.throws(() => verifyRelease(options), /differs from trusted manifest/);
	fs.writeFileSync(artifact, original);
	fs.writeFileSync(path.join(out, "SHA256SUMS"), checksums);
	const migration = path.join(out, "grainulator-migrate-3.0.0.tar.gz");
	fs.unlinkSync(migration);
	assert.throws(() => verifyRelease(options), /ENOENT/);
});

test("assembly rejects unusable archive identities before creating output", (t) => {
	const f = fixture(t);
	for (const [label, recordFile, updates] of [
		["base-name", f.baseRecord, { filename: "other-base.tgz" }],
		[
			"base-build",
			f.baseRecord,
			{ build_id: "release-3.0.1-" + "a".repeat(16) },
		],
		[
			"base-archive-build",
			f.baseRecord,
			{ build_id: "release-3.0.0-" + "f".repeat(16) },
		],
		["base-size", f.baseRecord, { bytes: 5 * 1024 * 1024 + 1 }],
		["native-name", f.assetRecords[0]!, { filename: "other-native.tar.gz" }],
		[
			"converter-name",
			f.migrationRecord,
			{ filename: "other-converter.tar.gz" },
		],
		["converter-size", f.migrationRecord, { bytes: 32 * 1024 * 1024 + 1 }],
	] satisfies [
		string,
		string,
		{ filename?: string; build_id?: string; bytes?: number },
	][]) {
		const original = fs.readFileSync(recordFile),
			record = JSON.parse(String(original));
		if (updates.filename) {
			fs.copyFileSync(
				path.join(path.dirname(recordFile), record.filename),
				path.join(path.dirname(recordFile), updates.filename),
			);
		}
		fs.writeFileSync(recordFile, JSON.stringify({ ...record, ...updates }));
		const out = path.join(f.dir, label);
		try {
			assert.throws(
				() => assembleRelease({ ...f, out }),
				/identity|candidate/i,
			);
			assert.equal(
				fs.existsSync(out),
				false,
				"invalid candidates cannot leave partial output",
			);
		} finally {
			fs.writeFileSync(recordFile, original);
		}
	}
});

test("pinned publication independently binds the base archive build ID and converter inventory", (t) => {
	const f = fixture(t),
		out = path.join(f.dir, "release");
	assembleRelease({ ...f, out });
	const manifestFile = path.join(out, "release-manifest.json");
	const original = fs.readFileSync(manifestFile),
		manifest = JSON.parse(String(original));
	manifest.base.build_id = `release-${version}-${"f".repeat(16)}`;
	fs.writeFileSync(manifestFile, JSON.stringify(manifest));
	assert.throws(
		() =>
			verifyRelease({
				directory: out,
				manifestSha256: sha256(fs.readFileSync(manifestFile)),
			}),
		/Base archive identity/,
	);
	fs.writeFileSync(manifestFile, original);
	const record = JSON.parse(String(fs.readFileSync(f.migrationRecord)));
	const invalid = encodeRuntimeArchive(
		new Map([
			[
				`grainulator-migrate-${version}/converter.mjs`,
				{ bytes: Buffer.from("export {};"), mode: 0o755 },
			],
		]),
	);
	fs.writeFileSync(
		path.join(path.dirname(f.migrationRecord), record.filename),
		invalid,
	);
	fs.writeFileSync(
		f.migrationRecord,
		JSON.stringify({
			...record,
			bytes: invalid.length,
			sha256: sha256(invalid),
		}),
	);
	const rejected = path.join(f.dir, "missing-converter-member");
	assert.throws(
		() => assembleRelease({ ...f, out: rejected }),
		/Converter archive inventory/,
	);
	assert.equal(fs.existsSync(rejected), false);
});

test("publication checks peeled live tag identity and refuses ambiguous release lookup", async (t) => {
	const { publishRelease } = await import("./publish-release.mjs");
	const f = fixture(t),
		out = path.join(f.dir, "release");
	const result = assembleRelease({ ...f, out });
	const options = {
		directory: out,
		manifestSha256: result.manifest_sha256,
		version,
		sourceCommit: commit,
		tag: "v" + version,
		repository: "grainulation/grainulator",
	};
	for (const annotated of [false, true]) {
		const calls: string[][] = [];
		const run: GHRunner = (argv) => {
			calls.push(argv);
			if (argv[0] === "release") return { status: 0, stdout: "published" };
			if (argv[1] === "--include")
				return {
					status: 1,
					stdout: 'HTTP/2.0 404 Not Found\n\n{"message":"Not Found"}',
				};
			const object =
				annotated && argv[1]!.includes("/git/ref/")
					? { type: "tag", sha: "b".repeat(40) }
					: { type: "commit", sha: commit };
			return { status: 0, stdout: JSON.stringify({ object }) };
		};
		assert.equal(publishRelease({ ...options, run }).status, "published");
		assert.equal(calls.at(-1)![0], "release");
		assert.equal(calls.at(-2)![0], "api");
		if (annotated)
			assert.ok(calls.some((argv) => argv[1]!.includes("/git/tags/")));
	}
	for (const failure of ["moved", "lookup", "existing", "cycle"]) {
		const calls: string[][] = [];
		const run: GHRunner = (argv) => {
			calls.push(argv);
			if (argv[1] === "--include")
				return failure === "lookup"
					? { status: 1, stdout: "" }
					: failure === "existing"
						? { status: 0, stdout: "HTTP/2.0 200 OK" }
						: { status: 1, stdout: "HTTP/2.0 404 Not Found" };
			return {
				status: 0,
				stdout: JSON.stringify({
					object: {
						type: failure === "cycle" ? "tag" : "commit",
						sha: "c".repeat(40),
					},
				}),
			};
		};
		assert.throws(
			() => publishRelease({ ...options, run }),
			/Live release tag differs|absence|annotated tag chain/,
		);
		assert.equal(
			calls.some((argv) => argv[0] === "release"),
			false,
			"Rejected publication must never reach create",
		);
	}
});

test("release archive inspection rejects unsafe paths, aliases and modes before extraction", async () => {
	const { readReleaseArchive } = await import("./release-archive.mjs");
	for (const name of [
		"../escape",
		"package/../escape",
		"/absolute",
		"package\\escape",
		"package//double",
	]) {
		const archive = encodeRuntimeArchive(
			new Map([[name, { bytes: Buffer.from("data"), mode: 0o644 }]]),
		);
		assert.throws(
			() => readReleaseArchive(archive),
			/Unsafe release archive path/,
		);
	}
	assert.throws(
		() =>
			readReleaseArchive(
				encodeRuntimeArchive(
					new Map([
						["package/file", { bytes: Buffer.from("a"), mode: 0o644 }],
						["package/FILE", { bytes: Buffer.from("b"), mode: 0o644 }],
					]),
				),
			),
		/Duplicate release archive path/,
	);
	assert.throws(
		() =>
			readReleaseArchive(
				encodeRuntimeArchive(
					new Map([["package/file", { bytes: Buffer.from("a"), mode: 0o777 }]]),
				),
			),
		/Unsafe release archive mode/,
	);
});
