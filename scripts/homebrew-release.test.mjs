import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
	RUNTIME_FILES,
	RUNTIME_SCHEMAS,
	NATIVE_TARGETS,
	encodeRuntimeArchive,
	sha256,
} from "../lib/runtime-assets.js";
import { assembleRelease } from "./homebrew-release.mjs";
import { renderFormula } from "./homebrew-formula.mjs";
import { unpackBase } from "./homebrew-archive.mjs";
import { verifyRelease } from "./homebrew-verify-release.mjs";
const version = "3.0.0",
	commit = "a".repeat(40);
// Header-only fixtures exercise packaging identity; they are never executed and
// do not stand in for the separate real native candidate execution gate.
function binaryFixture(target) {
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
function fixture(t) {
	const dir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-distribution-")),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const baseDir = path.join(dir, "base");
	fs.mkdirSync(baseDir);
	const baseArchive = encodeRuntimeArchive(
		new Map([
			[
				"package/package.json",
				{
					bytes: Buffer.from(
						JSON.stringify({ name: "@grainulation/grainulator", version }),
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
		build_id: "release-3.0.0-" + "a".repeat(16),
	};
	fs.writeFileSync(path.join(baseDir, base.filename), baseArchive);
	const baseRecord = path.join(baseDir, "base-record.json");
	fs.writeFileSync(baseRecord, JSON.stringify(base));
	const assetRecords = [];
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
	const converter = Buffer.from("separate converter fixture"),
		migrationRecord = path.join(migrationDir, "migration-record.json");
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
test("frozen candidate set yields pinned release plus literal formula, without publication", (t) => {
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
	const manifest = path.join(out, "release-manifest.json");
	const formula = renderFormula({
		manifest,
		manifestSha256: result.manifest_sha256,
		artifactDirectory: out,
	});
	assert.match(formula, /depends_on "node@24"/);
	assert.match(formula, /GRAINULATOR_HOMEBREW_LAUNCHER/);
	assert.match(
		formula,
		/GRAINULATOR_RUNTIME_ASSET_DIR=#\{\(libexec/,
		"native asset path must be this exact keg, not symlinked opt",
	);
	assert.doesNotMatch(formula, /\bpost_install\b|system "npm"|curl/);
	assert.match(formula, /runtime", "check"/);
	assert.match(formula, /bash_completion\.install_symlink/);
	assert.match(formula, /zsh_completion\.install_symlink/);
	assert.match(formula, /man1\.install_symlink/);
	assert.doesNotMatch(
		formula,
		/^\s*(?:bash_completion|zsh_completion|fish_completion|man1)\.install /m,
	);
	const ruby = path.join(f.dir, "grainulator.rb");
	fs.writeFileSync(ruby, formula);
	const syntax = spawnSync("ruby", ["-c", ruby], { encoding: "utf8" });
	assert.equal(syntax.status, 0, syntax.stderr);
	const extracted = path.join(f.dir, "extracted");
	unpackBase(
		fs.readFileSync(path.join(out, "grainulator-3.0.0.tgz")),
		extracted,
	);
	assert.equal(
		JSON.parse(fs.readFileSync(path.join(extracted, "package.json"))).version,
		version,
	);
	assert.throws(
		() =>
			renderFormula({
				manifest,
				manifestSha256: "0".repeat(64),
				artifactDirectory: out,
			}),
		/reviewed SHA/,
	);
	fs.appendFileSync(path.join(out, "grainulator-3.0.0.tgz"), "changed");
	assert.throws(
		() =>
			renderFormula({
				manifest,
				manifestSha256: result.manifest_sha256,
				artifactDirectory: out,
			}),
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
				assetRecords: [...f.assetRecords.slice(1), f.assetRecords[1]],
				out: path.join(f.dir, "dup"),
			}),
		/duplicate/,
	);
	const file = f.assetRecords[0],
		original = fs.readFileSync(file),
		record = JSON.parse(original);
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
test("base archive extraction refuses traversal, duplicate case paths and nonregular entries", (t) => {
	const { dir } = fixture(t);
	const entry = (name) => [
		name,
		{ bytes: Buffer.from("content"), mode: 0o644 },
	];
	for (const names of [
		["package/../escaped"],
		["package/abs/../../escaped"],
		["package/A", "package/a"],
		["other/package.json"],
	]) {
		const archive = encodeRuntimeArchive(new Map(names.map(entry)));
		const destination = path.join(
			dir,
			"bad-" + Math.random().toString(16).slice(2),
		);
		assert.throws(
			() => unpackBase(archive, destination),
			/Unsafe|Duplicate|Unexpected/,
		);
	}
	assert.equal(fs.existsSync(path.join(dir, "escaped")), false);
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
