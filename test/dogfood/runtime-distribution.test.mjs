import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";
import {
	currentTarget,
	decodeRuntimeArchive,
	encodeRuntimeArchive,
	inspectRuntimeInstallation,
	installRuntimeAsset,
	RUNTIME_BINARIES,
	RUNTIME_SCHEMAS,
	readRegular,
	runtimeVersion,
	sha256,
	verifyInstalledAsset,
} from "../../lib/runtime-assets.js";
import {
	detachRuntimeEnrollment,
	enrollRuntime,
	initializeRuntime,
	mutateRuntimeClaim,
	reviewRuntimeMigration,
	rollbackRuntimeEnrollment,
} from "../../lib/runtime-enrollment.js";

// Synthetic executable-format headers make the archive parser tests independent
// of a Rust toolchain. Native candidate acceptance executes the real binaries.
function fixture({ version = runtimeVersion() } = {}) {
	const root = fs.mkdtempSync(
		path.join(fs.realpathSync(os.tmpdir()), "grainulator-runtime-test-"),
	);
	const home = path.join(root, "home"),
		workspace = path.join(root, "project with spaces");
	fs.mkdirSync(home);
	fs.mkdirSync(workspace);
	const target = currentTarget(),
		sourceCommit = "a".repeat(40),
		files = new Map();
	for (const name of RUNTIME_BINARIES) {
		const bytes = Buffer.alloc(64);
		if (target.endsWith("apple-darwin")) {
			bytes.writeUInt32LE(0xfeedfacf, 0);
			bytes.writeUInt32LE(
				target.startsWith("aarch64") ? 0x0100000c : 0x01000007,
				4,
			);
		} else {
			Buffer.from([127, 69, 76, 70, 2, 1]).copy(bytes);
			bytes.writeUInt16LE(target.startsWith("aarch64") ? 183 : 62, 18);
			bytes.writeBigUInt64LE(64n, 32);
			bytes.writeUInt16LE(56, 54);
		}
		files.set(name, { bytes, mode: 0o755 });
	}
	for (const name of RUNTIME_SCHEMAS)
		files.set(name, {
			bytes: Buffer.from(
				JSON.stringify({
					$id: `urn:grainulator:runtime:${path.basename(name, ".schema.json")}:1`,
				}),
			),
			mode: 0o644,
		});
	const metadata = {
		schema: "grainulator.runtime.asset.v1",
		version,
		target,
		source_commit: sourceCommit,
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
	const archiveBytes = encodeRuntimeArchive(files),
		archive = path.join(root, "runtime.tar.gz");
	fs.writeFileSync(archive, archiveBytes);
	const manifest = {
		schema: "grainulator.release.v1",
		version,
		source_commit: sourceCommit,
		assets: [
			{
				target,
				filename: `grainulator-runtime-${version}-${target}.tar.gz`,
				sha256: sha256(archiveBytes),
				bytes: archiveBytes.length,
				metadata_sha256: sha256(metadataBytes),
			},
		],
	};
	const manifestFile = path.join(root, "release.json");
	fs.writeFileSync(manifestFile, JSON.stringify(manifest));
	const options = {
		archive,
		manifest: manifestFile,
		trustedManifestSha256: sha256(readRegular(manifestFile)),
		home,
		version,
		target,
	};
	return {
		root,
		home,
		workspace,
		files,
		metadata,
		manifest,
		options,
		install: () => installRuntimeAsset(options),
		cleanup: () => fs.rmSync(root, { recursive: true }),
	};
}
const claim = {
	id: "c1",
	type: "factual",
	topic: "runtime",
	content: "A typed native claim.",
	evidence: "documented",
};

test("native install requires independent manifest pin and refuses self-consistent replacement", () => {
	const f = fixture();
	try {
		assert.throws(
			() =>
				installRuntimeAsset({
					...f.options,
					trustedManifestSha256: "0".repeat(64),
				}),
			/independently trusted/,
		);
		const replacement = { ...f.manifest, source_commit: "b".repeat(40) };
		fs.writeFileSync(f.options.manifest, JSON.stringify(replacement));
		assert.throws(f.install, /independently trusted/);
		assert.equal(fs.existsSync(path.join(f.home, ".grainulator")), false);
	} finally {
		f.cleanup();
	}
});
test("native parser refuses traversal, absolute paths, duplicate paths, links and unsafe modes", () => {
	const f = fixture();
	try {
		for (const name of ["../escape", "/absolute", "unknown"])
			assert.throws(
				() =>
					decodeRuntimeArchive(
						encodeRuntimeArchive(
							new Map([[name, { bytes: Buffer.from("x"), mode: 0o644 }]]),
						),
					),
				/unsafe/,
			);
		const bytes = zlib.gunzipSync(
			encodeRuntimeArchive(
				new Map([
					["runtime-asset.json", { bytes: Buffer.from("{}"), mode: 0o644 }],
				]),
			),
		);
		const entry = bytes.subarray(0, 1024);
		assert.throws(
			() =>
				decodeRuntimeArchive(
					zlib.gzipSync(Buffer.concat([entry, entry, Buffer.alloc(1024)])),
				),
			/Duplicate/,
		);
		const malicious = (type) => {
			const tar = Buffer.from(bytes);
			tar[156] = type;
			tar.fill(32, 148, 156);
			const checksum = tar
				.subarray(0, 512)
				.reduce((sum, byte) => sum + byte, 0);
			tar.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
			return zlib.gzipSync(tar);
		};
		for (const type of [49, 50, 51, 53, 120])
			assert.throws(
				() => decodeRuntimeArchive(malicious(type)),
				/regular files/,
			);
		assert.throws(
			() =>
				decodeRuntimeArchive(
					encodeRuntimeArchive(
						new Map([
							["runtime-asset.json", { bytes: Buffer.from("{}"), mode: 0o666 }],
						]),
					),
				),
			/mode/,
		);
	} finally {
		f.cleanup();
	}
});
test("installed verification binds file bytes and metadata to the approved release", () => {
	const f = fixture();
	try {
		const installed = f.install();
		assert.equal(installed.installed, true);
		assert.equal(f.install().unchanged, true);
		const file = path.join(installed.asset_directory, RUNTIME_BINARIES[0]);
		fs.appendFileSync(file, "changed");
		assert.throws(
			() => verifyInstalledAsset(installed.asset_directory, f.options),
			/verification failed/,
		);
		const metadataFile = path.join(
			installed.asset_directory,
			"runtime-asset.json",
		);
		const forged = JSON.parse(readRegular(metadataFile));
		forged.files[RUNTIME_BINARIES[0]].sha256 = sha256(readRegular(file));
		forged.files[RUNTIME_BINARIES[0]].size = readRegular(file).length;
		fs.writeFileSync(metadataFile, JSON.stringify(forged));
		assert.throws(
			() => verifyInstalledAsset(installed.asset_directory, f.options),
			/metadata differs from trusted release/,
		);
		assert.equal(inspectRuntimeInstallation(f.options).status, "invalid");
	} finally {
		f.cleanup();
	}
});
test("native archive rejects mismatched CPU and externally linked binary formats", () => {
	const f = fixture();
	try {
		const file = f.files.get(RUNTIME_BINARIES[0]);
		file.bytes[0] = 0;
		f.metadata.files[RUNTIME_BINARIES[0]].sha256 = sha256(file.bytes);
		const metadata = Buffer.from(JSON.stringify(f.metadata));
		f.files.set("runtime-asset.json", { bytes: metadata, mode: 0o644 });
		const archive = encodeRuntimeArchive(f.files);
		fs.writeFileSync(f.options.archive, archive);
		Object.assign(f.manifest.assets[0], {
			sha256: sha256(archive),
			bytes: archive.length,
			metadata_sha256: sha256(metadata),
		});
		fs.writeFileSync(f.options.manifest, JSON.stringify(f.manifest));
		f.options.trustedManifestSha256 = sha256(readRegular(f.options.manifest));
		assert.throws(f.install, /OS\/CPU/);
	} finally {
		f.cleanup();
	}
});
test("native typed mutation preserves history, refuses invalid updates and shares the writer lock", () => {
	const f = fixture();
	try {
		initializeRuntime(f.workspace);
		const directory = path.join(f.workspace, ".grainulator/runtime"),
			file = path.join(directory, "claims.json");
		const original = readRegular(file);
		const added = mutateRuntimeClaim(f.workspace, "add", claim);
		assert.equal(added.verdicts_reverified, false);
		assert.deepEqual(readRegular(added.history), original);
		const saved = readRegular(file);
		assert.throws(
			() =>
				mutateRuntimeClaim(
					f.workspace,
					"update",
					{ evidence: "guaranteed" },
					{ id: claim.id },
				),
			/needs/,
		);
		assert.deepEqual(readRegular(file), saved);
		assert.throws(
			() =>
				mutateRuntimeClaim(
					f.workspace,
					"update",
					{ content: "changed" },
					{ id: claim.id, expectedHash: "0".repeat(64) },
				),
			/changed since inspection/,
		);
		fs.mkdirSync(path.join(directory, ".write.lock"));
		assert.throws(
			() => mutateRuntimeClaim(f.workspace, "add", { ...claim, id: "c2" }),
			/EEXIST/,
		);
		assert.deepEqual(readRegular(file), saved);
		fs.rmdirSync(path.join(directory, ".write.lock"));
		mutateRuntimeClaim(f.workspace, "add", { ...claim, id: "c2" });
		mutateRuntimeClaim(f.workspace, "supersede", null, { id: "c1", by: "c2" });
		assert.equal(JSON.parse(readRegular(file)).claims[0].resolved_by, "c2");
		assert.throws(() => initializeRuntime(f.workspace), /already exists/);
	} finally {
		f.cleanup();
	}
});
test("explicit enrollment preserves unrelated settings and supports hash-bound rollback", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const config = path.join(f.root, "host"),
			settings = path.join(config, "hooks.json");
		fs.mkdirSync(config);
		const original = Buffer.from(
			'{"theme":"dark","hooks":{"Stop":[{"hooks":[{"type":"command","command":"unrelated"}]}]}}\n',
		);
		fs.writeFileSync(settings, original);
		const result = enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: sha256(original),
			home: f.home,
		});
		const current = JSON.parse(readRegular(settings));
		assert.equal(current.theme, "dark");
		assert.equal(current.hooks.Stop[0].hooks[0].command, "unrelated");
		const receipt = path.join(
			f.workspace,
			".grainulator/runtime/enrollment.json",
		);
		rollbackRuntimeEnrollment(f.workspace, {
			expectedEnrollmentHash: sha256(readRegular(receipt)),
			expectedSettingsHash: sha256(readRegular(settings)),
		});
		assert.deepEqual(readRegular(settings), original);
		assert.equal(fs.existsSync(receipt), false);
		assert.ok(
			result.asset_directory.startsWith(
				path.join(f.home, ".grainulator/runtime/bin/"),
			),
		);
		assert.ok(fs.existsSync(result.asset_directory));
	} finally {
		f.cleanup();
	}
});
test("host changes, malformed settings and later native writes cannot be overwritten by enrollment rollback", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const config = path.join(f.root, "host"),
			settings = path.join(config, "settings.json");
		fs.mkdirSync(config);
		fs.writeFileSync(settings, "{ malformed");
		assert.throws(
			() =>
				enrollRuntime(f.workspace, {
					host: "claude",
					configDirectory: config,
					expectedSettingsHash: sha256(readRegular(settings)),
					home: f.home,
				}),
			/JSON/,
		);
		assert.equal(fs.readFileSync(settings, "utf8"), "{ malformed");
		fs.writeFileSync(settings, "{}");
		enrollRuntime(f.workspace, {
			host: "claude",
			configDirectory: config,
			expectedSettingsHash: sha256(readRegular(settings)),
			home: f.home,
		});
		const receipt = path.join(
			f.workspace,
			".grainulator/runtime/enrollment.json",
		);
		mutateRuntimeClaim(f.workspace, "add", claim);
		assert.throws(
			() =>
				rollbackRuntimeEnrollment(f.workspace, {
					expectedEnrollmentHash: sha256(readRegular(receipt)),
					expectedSettingsHash: sha256(readRegular(settings)),
				}),
			/data changed/,
		);
		const before = readRegular(receipt);
		fs.writeFileSync(settings, '{"concurrent":true}');
		assert.throws(
			() =>
				detachRuntimeEnrollment(f.workspace, {
					expectedEnrollmentHash: sha256(before),
					expectedSettingsHash: "0".repeat(64),
				}),
			/settings changed/,
		);
		assert.deepEqual(readRegular(receipt), before);
		assert.equal(JSON.parse(readRegular(settings)).concurrent, true);
	} finally {
		f.cleanup();
	}
});
test("converted runtime review is explicit, hash-bound and never executes retained oracle argv", () => {
	const f = fixture();
	try {
		initializeRuntime(f.workspace);
		const directory = path.join(f.workspace, ".grainulator/runtime"),
			marker = path.join(directory, "migration-required.json");
		fs.writeFileSync(
			marker,
			JSON.stringify({
				schema: "grainulator.runtime.migration.v1",
				state: "verification-required",
				oracle_bindings_requiring_review: ["unit"],
			}),
		);
		const run = path.join(directory, "run.json"),
			sentinel = path.join(f.root, "must-not-exist");
		fs.writeFileSync(
			run,
			JSON.stringify({
				verification: { mode: "strict" },
				oracles: {
					unit: {
						cmd: [
							process.execPath,
							"-e",
							`require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'bad')`,
						],
					},
				},
			}),
		);
		assert.throws(
			() => reviewRuntimeMigration(f.workspace, "0".repeat(64)),
			/Concurrent/,
		);
		const reviewed = reviewRuntimeMigration(
			f.workspace,
			sha256(readRegular(marker)),
		);
		assert.equal(reviewed.oracles_executed, false);
		assert.equal(fs.existsSync(sentinel), false);
		assert.equal(
			JSON.parse(readRegular(marker)).reviewed_run_sha256,
			sha256(readRegular(run)),
		);
	} finally {
		f.cleanup();
	}
});

function enrollmentPaths(workspace, config, host = "codex") {
	return {
		receipt: path.join(workspace, ".grainulator/runtime/enrollment.json"),
		settings: path.join(
			config,
			host === "codex" ? "hooks.json" : "settings.json",
		),
	};
}
async function versionedEnrollmentModule(f, version) {
	const directory = path.join(f.root, `cli-${version}`);
	fs.mkdirSync(path.join(directory, "lib"), { recursive: true });
	fs.mkdirSync(path.join(directory, "packages/shared/lib"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(directory, "package.json"),
		JSON.stringify({ type: "module", version }),
	);
	for (const name of ["runtime-assets.js", "runtime-enrollment.js"])
		fs.copyFileSync(
			fileURLToPath(new URL(`../../lib/${name}`, import.meta.url)),
			path.join(directory, "lib", name),
		);
	fs.copyFileSync(
		fileURLToPath(
			new URL("../../packages/shared/lib/project-config.cjs", import.meta.url),
		),
		path.join(directory, "packages/shared/lib/project-config.cjs"),
	);
	return import(
		pathToFileURL(path.join(directory, "lib/runtime-enrollment.js")).href
	);
}
test("Brew-selected native origin does not override the independently retained enrollment cache", () => {
	const f = fixture(),
		before = process.env.GRAINULATOR_RUNTIME_ASSET_DIR;
	try {
		const installed = f.install();
		initializeRuntime(f.workspace);
		process.env.GRAINULATOR_RUNTIME_ASSET_DIR = path.join(
			f.root,
			"removed-brew-keg",
		);
		const enrolled = enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: path.join(f.root, "host"),
			expectedSettingsHash: "absent",
			home: f.home,
		});
		assert.equal(enrolled.asset_directory, installed.asset_directory);
		assert.equal(
			fs.existsSync(process.env.GRAINULATOR_RUNTIME_ASSET_DIR),
			false,
		);
	} finally {
		if (before === undefined) delete process.env.GRAINULATOR_RUNTIME_ASSET_DIR;
		else process.env.GRAINULATOR_RUNTIME_ASSET_DIR = before;
		f.cleanup();
	}
});
test("one host refuses a second workspace before changing either enrollment or settings", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const other = path.join(f.root, "second-project");
		fs.mkdirSync(other);
		initializeRuntime(other);
		const config = path.join(f.root, "host"),
			files = enrollmentPaths(f.workspace, config);
		enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: "absent",
			home: f.home,
		});
		const settings = readRegular(files.settings),
			receipt = readRegular(files.receipt);
		const otherState = path.join(other, ".grainulator/runtime");
		assert.throws(
			() =>
				enrollRuntime(other, {
					host: "codex",
					configDirectory: config,
					expectedSettingsHash: sha256(settings),
					home: f.home,
				}),
			/one workspace per host/,
		);
		assert.deepEqual(readRegular(files.settings), settings);
		assert.deepEqual(readRegular(files.receipt), receipt);
		assert.equal(
			fs.existsSync(path.join(otherState, "enrollment.json")),
			false,
		);
		assert.equal(fs.existsSync(path.join(otherState, "host-backups")), false);
		assert.equal(JSON.parse(settings).hooks.Stop.length, 1);
	} finally {
		f.cleanup();
	}
});
test("a workspace refuses another host scope before creating its directory or orphaning its gate", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const config = path.join(f.root, "codex-host"),
			otherConfig = path.join(f.root, "claude-host"),
			files = enrollmentPaths(f.workspace, config);
		enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: "absent",
			home: f.home,
		});
		const settings = readRegular(files.settings),
			receipt = readRegular(files.receipt);
		assert.throws(
			() =>
				enrollRuntime(f.workspace, {
					host: "claude",
					configDirectory: otherConfig,
					expectedSettingsHash: "absent",
					expectedEnrollmentHash: sha256(receipt),
					home: f.home,
				}),
			/one host settings scope/,
		);
		assert.deepEqual(readRegular(files.settings), settings);
		assert.deepEqual(readRegular(files.receipt), receipt);
		assert.equal(fs.existsSync(otherConfig), false);
	} finally {
		f.cleanup();
	}
});
test("different release cohorts cannot share a host, while an owned release handoff rolls back exactly", async () => {
	const nextVersion = runtimeVersion().replace(/\d+$/, (patch) =>
		String(Number(patch) + 1),
	);
	const a = fixture(),
		b = fixture({ version: nextVersion });
	try {
		a.install();
		b.options.home = a.home;
		b.install();
		initializeRuntime(a.workspace);
		initializeRuntime(b.workspace);
		const next = await versionedEnrollmentModule(b, nextVersion);
		const config = path.join(a.root, "host"),
			files = enrollmentPaths(a.workspace, config);
		const first = enrollRuntime(a.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: "absent",
			home: a.home,
		});
		const initialSettings = readRegular(files.settings),
			initialReceipt = readRegular(files.receipt);
		assert.throws(
			() =>
				next.enrollRuntime(b.workspace, {
					host: "codex",
					configDirectory: config,
					expectedSettingsHash: sha256(initialSettings),
					home: a.home,
				}),
			/one workspace per host/,
		);
		assert.deepEqual(readRegular(files.settings), initialSettings);
		assert.equal(
			fs.existsSync(
				path.join(b.workspace, ".grainulator/runtime/enrollment.json"),
			),
			false,
		);
		const upgraded = next.enrollRuntime(a.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: sha256(initialSettings),
			expectedEnrollmentHash: sha256(initialReceipt),
			home: a.home,
		});
		assert.equal(upgraded.asset_version, nextVersion);
		const groups = JSON.parse(readRegular(files.settings)).hooks.Stop;
		assert.equal(groups.length, 1);
		assert.equal(groups[0].hooks.length, 1);
		assert.notEqual(groups[0].hooks[0].command, first.hook_command);
		assert.ok(fs.existsSync(first.asset_directory));
		assert.ok(fs.existsSync(upgraded.asset_directory));
		next.rollbackRuntimeEnrollment(a.workspace, {
			expectedEnrollmentHash: sha256(readRegular(files.receipt)),
			expectedSettingsHash: sha256(readRegular(files.settings)),
		});
		assert.deepEqual(readRegular(files.settings), initialSettings);
		assert.deepEqual(readRegular(files.receipt), initialReceipt);
	} finally {
		a.cleanup();
		b.cleanup();
	}
});
test("detach cannot remove a duplicated or foreign active runtime cohort", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const config = path.join(f.root, "host"),
			files = enrollmentPaths(f.workspace, config);
		enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: "absent",
			home: f.home,
		});
		const receipt = readRegular(files.receipt),
			settings = JSON.parse(readRegular(files.settings));
		settings.hooks.Stop.push({
			hooks: [
				{
					type: "command",
					command: "'/another/release/grainulator-runtime-hook' --required",
				},
			],
		});
		fs.writeFileSync(files.settings, JSON.stringify(settings));
		const before = readRegular(files.settings);
		assert.throws(
			() =>
				detachRuntimeEnrollment(f.workspace, {
					expectedEnrollmentHash: sha256(receipt),
					expectedSettingsHash: sha256(before),
				}),
			/cohort/,
		);
		assert.deepEqual(readRegular(files.settings), before);
		assert.deepEqual(readRegular(files.receipt), receipt);
	} finally {
		f.cleanup();
	}
});
test("rollback rejects missing, malformed, oversized or changed archived settings before touching live files", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const config = path.join(f.root, "host"),
			files = enrollmentPaths(f.workspace, config);
		fs.mkdirSync(config);
		fs.writeFileSync(files.settings, '{"theme":"preserve"}');
		const enrolled = enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: sha256(readRegular(files.settings)),
			home: f.home,
		});
		const receipt = readRegular(files.receipt),
			settings = readRegular(files.settings),
			originalBackup = JSON.parse(readRegular(enrolled.backup));
		for (const corrupt of [
			(backup) => {
				backup.settings = null;
			},
			(backup) => {
				delete backup.settings;
			},
			(backup) => {
				backup.settings = "not$base64";
			},
			(backup) => {
				backup.settings = Buffer.from("{}").toString("base64");
			},
			(backup) => {
				backup.settings = Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64");
			},
			(backup) => {
				backup.enrollment = "e30=";
			},
		]) {
			const backup = structuredClone(originalBackup);
			corrupt(backup);
			fs.writeFileSync(enrolled.backup, JSON.stringify(backup));
			assert.throws(
				() =>
					rollbackRuntimeEnrollment(f.workspace, {
						expectedEnrollmentHash: sha256(receipt),
						expectedSettingsHash: sha256(settings),
					}),
				/backup/,
			);
			assert.deepEqual(readRegular(files.settings), settings);
			assert.deepEqual(readRegular(files.receipt), receipt);
		}
	} finally {
		f.cleanup();
	}
});
test("rollback validates archived enrollment ownership even with a self-consistent payload digest", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const config = path.join(f.root, "host"),
			files = enrollmentPaths(f.workspace, config);
		enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: "absent",
			home: f.home,
		});
		enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: sha256(readRegular(files.settings)),
			expectedEnrollmentHash: sha256(readRegular(files.receipt)),
			home: f.home,
		});
		const originalReceipt = JSON.parse(readRegular(files.receipt)),
			originalBackup = JSON.parse(readRegular(originalReceipt.backup)),
			settings = readRegular(files.settings);
		for (const mutate of [
			(prior) => {
				prior.workspace = path.join(f.root, "foreign-workspace");
			},
			(prior) => {
				prior.schema = "unrecognized";
			},
			(prior) => {
				prior.host = "claude";
				prior.settings_file = path.join(config, "settings.json");
			},
		]) {
			const backup = structuredClone(originalBackup),
				receipt = structuredClone(originalReceipt),
				prior = JSON.parse(Buffer.from(backup.enrollment, "base64"));
			mutate(prior);
			const payload = Buffer.from(JSON.stringify(prior));
			backup.enrollment = payload.toString("base64");
			receipt.enrollment_before_sha256 = sha256(payload);
			fs.writeFileSync(receipt.backup, JSON.stringify(backup));
			fs.writeFileSync(files.receipt, JSON.stringify(receipt));
			const before = readRegular(files.receipt);
			assert.throws(
				() =>
					rollbackRuntimeEnrollment(f.workspace, {
						expectedEnrollmentHash: sha256(before),
						expectedSettingsHash: sha256(settings),
					}),
				/workspace|recovery|scope/,
			);
			assert.deepEqual(readRegular(files.settings), settings);
			assert.deepEqual(readRegular(files.receipt), before);
		}
	} finally {
		f.cleanup();
	}
});
test("only an actually absent archived preimage permits removal of newly created host settings", () => {
	const f = fixture();
	try {
		f.install();
		initializeRuntime(f.workspace);
		const config = path.join(f.root, "host"),
			files = enrollmentPaths(f.workspace, config);
		const enrolled = enrollRuntime(f.workspace, {
			host: "codex",
			configDirectory: config,
			expectedSettingsHash: "absent",
			home: f.home,
		});
		const backup = JSON.parse(readRegular(enrolled.backup)),
			receipt = readRegular(files.receipt),
			settings = readRegular(files.settings);
		fs.writeFileSync(
			enrolled.backup,
			JSON.stringify({
				...backup,
				settings: Buffer.from("{}").toString("base64"),
			}),
		);
		assert.throws(
			() =>
				rollbackRuntimeEnrollment(f.workspace, {
					expectedEnrollmentHash: sha256(receipt),
					expectedSettingsHash: sha256(settings),
				}),
			/presence/,
		);
		assert.deepEqual(readRegular(files.settings), settings);
		assert.deepEqual(readRegular(files.receipt), receipt);
		fs.writeFileSync(enrolled.backup, JSON.stringify(backup));
		rollbackRuntimeEnrollment(f.workspace, {
			expectedEnrollmentHash: sha256(receipt),
			expectedSettingsHash: sha256(settings),
		});
		assert.equal(fs.existsSync(files.settings), false);
		assert.equal(fs.existsSync(files.receipt), false);
		assert.equal(
			fs.existsSync(path.join(f.workspace, ".grainulator/runtime/claims.json")),
			true,
		);
	} finally {
		f.cleanup();
	}
});

test("immutable runtime history reuses exact snapshots and rejects collisions, links and create errors before claims change", () => {
	for (const kind of [
		"matching",
		"collision",
		"symlink",
		"hardlink",
		"permission",
	]) {
		const f = fixture();
		try {
			initializeRuntime(f.workspace);
			const directory = path.join(f.workspace, ".grainulator/runtime"),
				file = path.join(directory, "claims.json"),
				bytes = readRegular(file),
				history = path.join(directory, "history");
			fs.mkdirSync(history);
			const backup = path.join(history, `claims-${sha256(bytes)}.json`),
				peer = path.join(f.workspace, "peer-history.json");
			if (kind === "matching") fs.writeFileSync(backup, bytes);
			else if (kind === "collision") fs.writeFileSync(backup, "collision");
			else if (kind === "symlink") {
				fs.writeFileSync(peer, bytes);
				fs.symlinkSync(peer, backup);
			} else if (kind === "hardlink") {
				fs.writeFileSync(peer, bytes);
				fs.linkSync(peer, backup);
			}
			const open = fs.openSync;
			if (kind === "permission")
				fs.openSync = function (target, ...rest) {
					if (target === backup) {
						const error = new Error("Synthetic denied history creation");
						error.code = "EACCES";
						throw error;
					}
					return open.call(this, target, ...rest);
				};
			try {
				if (kind === "matching") {
					const result = mutateRuntimeClaim(f.workspace, "add", claim);
					assert.deepEqual(readRegular(result.history), bytes);
				} else {
					assert.throws(() => mutateRuntimeClaim(f.workspace, "add", claim));
					assert.deepEqual(readRegular(file), bytes);
					if (kind === "collision")
						assert.equal(fs.readFileSync(backup, "utf8"), "collision");
				}
			} finally {
				fs.openSync = open;
			}
		} finally {
			f.cleanup();
		}
	}
});
