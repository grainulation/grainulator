#!/usr/bin/env node
// Actual Homebrew Ruby recipe, isolated prefix, supplied verified artifacts.
// No global keg/dependency installation or user host configuration.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
	currentTarget,
	decodeRuntimeArchive,
	readRegular,
	sha256,
	verifyAssetFiles,
} from "../lib/runtime-assets.js";
import { renderFormula } from "./homebrew-formula.mjs";
import { unpackBase } from "./homebrew-archive.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
	args = process.argv.slice(2),
	options = {};
const keys = new Map([
	["--formula", "formula"],
	["--release-dir", "releaseDir"],
	["--manifest-sha256", "pin"],
	["--brew", "brew"],
]);
try {
	for (let i = 0; i < args.length; i++) {
		const key = keys.get(args[i]),
			value = args[++i];
		if (!key || !value || options[key])
			throw Error("Unknown, missing or duplicate option");
		options[key] = value;
	}
	const release = path.resolve(options.releaseDir),
		manifest = path.join(release, "release-manifest.json");
	const expected = renderFormula({
		manifest,
		manifestSha256: options.pin,
		artifactDirectory: release,
	});
	if (fs.readFileSync(options.formula, "utf8") !== expected)
		throw Error("Formula differs from pinned generated candidate");
	const m = JSON.parse(readRegular(manifest)),
		target = currentTarget(),
		record = m.assets.find((a) => a.target === target);
	if (!record) throw Error("Host native target is missing");
	if (!/^v24\./.test(process.version))
		throw Error(
			"Recipe test requires the existing supported Node24 dependency, not an arbitrary PATH Node",
		);
	const privateRoot = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-brew-")),
	);
	const source = path.join(privateRoot, "source");
	unpackBase(readRegular(path.join(release, m.base.filename)), source);
	const native = path.join(privateRoot, "native");
	fs.mkdirSync(native);
	fs.mkdirSync(path.join(native, "schemas"));
	const files = decodeRuntimeArchive(
		readRegular(path.join(release, record.filename)),
	);
	verifyAssetFiles(JSON.parse(files.get("runtime-asset.json").bytes), files, {
		version: m.version,
		target,
		sourceCommit: m.source_commit,
	});
	for (const [name, file] of files)
		fs.writeFileSync(path.join(native, name), file.bytes, {
			flag: "wx",
			mode: file.mode,
		});
	const manifestResource = path.join(privateRoot, "manifest");
	fs.mkdirSync(manifestResource);
	fs.copyFileSync(
		manifest,
		path.join(manifestResource, "release-manifest.json"),
	);
	const env = {
		...process.env,
		HOMEBREW_NO_AUTO_UPDATE: "1",
		HOMEBREW_NO_ANALYTICS: "1",
		HOMEBREW_DEVELOPER: "1",
		XDG_CONFIG_HOME: path.join(privateRoot, "config"),
		HOMEBREW_LOGS: path.join(privateRoot, "logs"),
	};
	const brew = options.brew || "brew";
	const run = (argv, optional = false) => {
		const r = spawnSync(brew, argv, {
			env,
			encoding: "utf8",
			maxBuffer: 10 * 1024 * 1024,
		});
		if (!optional && (r.error || r.status !== 0))
			throw Error(r.stderr || r.error?.message || "Homebrew check failed");
		return r;
	};
	const tap = "grainulation/grainulator-check-" + process.pid;
	run(["tap-new", "--no-git", tap]);
	try {
		const tapRoot = run(["--repository", tap]).stdout.trim(),
			formula = path.join(tapRoot, "Formula/grainulator.rb");
		fs.copyFileSync(options.formula, formula);
		if (run(["help", "trust"], true).status === 0)
			run(["trust", "--formula", tap + "/grainulator"]);
		const result = run([
			"ruby",
			path.join(root, "scripts/homebrew-recipe.rb"),
			tap + "/grainulator",
			formula,
			source,
			native,
			manifestResource,
			process.execPath,
			options.pin,
			path.join(release, record.filename),
		]);
		console.log(result.stdout);
	} finally {
		run(["untap", tap]);
	}
	console.log(
		JSON.stringify({
			status: "passed",
			scope:
				"actual Homebrew Ruby recipe/private prefix/offline functional tests; real wrapper enrollment and retained native gate after disposable keg/Node launcher removal; supplied Node dependency",
			manifest_sha256: options.pin,
			target,
			version: m.version,
			global_keg: false,
			public_install: false,
			provider_calls: false,
		}),
	);
} catch (e) {
	console.error("Homebrew candidate check: " + e.message);
	process.exitCode = 1;
}
