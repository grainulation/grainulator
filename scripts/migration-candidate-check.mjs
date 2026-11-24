#!/usr/bin/env node
// Execute only the converter bytes validated from the exact candidate archive.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readRegular, sha256 } from "../lib/runtime-assets.js";
import { verifyMigrationArchive } from "./release-archive.mjs";

export function checkMigrationCandidate(candidateDirectory) {
	const directory = path.resolve(candidateDirectory);
	const record = JSON.parse(
		readRegular(path.join(directory, "migration-record.json"), 1024 * 1024),
	);
	if (
		record.schema !== "grainulator.migration-record.v1" ||
		!/^3\.\d+\.\d+$/.test(record.version) ||
		!/^[a-f0-9]{40}$/.test(record.source_commit) ||
		record.filename !== `grainulator-migrate-${record.version}.tar.gz`
	)
		throw Error("Invalid converter candidate record");
	const bytes = readRegular(
		path.join(directory, record.filename),
		32 * 1024 * 1024,
	);
	if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256)
		throw Error("Converter candidate archive changed");
	const { prefix, files } = verifyMigrationArchive(bytes, {
		version: record.version,
		sourceCommit: record.source_commit,
	});
	const stage = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-converter-acceptance-")),
	);
	try {
		const extracted = path.join(stage, "converter");
		fs.mkdirSync(extracted);
		for (const [name, file] of files)
			fs.writeFileSync(
				path.join(extracted, name.slice(prefix.length)),
				file.bytes,
				{ flag: "wx", mode: file.mode },
			);
		const converter = path.join(extracted, "converter.mjs");
		const run = (args) => {
			const result = spawnSync(process.execPath, [converter, ...args], {
				cwd: stage,
				encoding: "utf8",
				timeout: 15000,
				maxBuffer: 1024 * 1024,
			});
			assert.ifError(result.error);
			assert.equal(result.status, 0, result.stderr || result.stdout);
			return JSON.parse(result.stdout);
		};
		const project = path.join(stage, "project # café");
		fs.mkdirSync(project);
		fs.writeFileSync(
			path.join(project, "wheat.config.json"),
			JSON.stringify({ dirs: {}, custom: "preserve" }),
		);
		const evidence = path.join(project, ".wheat/sprints/check/claims.json");
		fs.mkdirSync(path.dirname(evidence), { recursive: true });
		const original = Buffer.from(
			'{"claims":[{"id":"keep","content":"literal historical evidence & <tag>"}]}\n',
		);
		fs.writeFileSync(evidence, original);
		const plan = path.join(stage, "reviewed-plan.json");
		assert.equal(
			run(["inspect", "--project", project, "--out", plan]).status,
			"planned",
		);
		const applied = run(["apply", "--plan", plan, "--quiesced"]);
		assert.equal(applied.status, "complete");
		assert.equal(
			run(["verify", "--transaction", applied.transaction_directory]).status,
			"verified",
		);
		assert.deepEqual(
			fs.readFileSync(
				path.join(project, ".grainulator/evidence/sprints/check/claims.json"),
			),
			original,
		);
		assert.deepEqual(fs.readFileSync(evidence), original);
		assert.equal(
			run([
				"rollback",
				"--transaction",
				applied.transaction_directory,
				"--quiesced",
			]).status,
			"rolled-back",
		);
		assert.deepEqual(fs.readFileSync(evidence), original);
		assert.equal(
			fs.existsSync(path.join(project, "grainulator.config.json")),
			false,
		);
		return {
			status: "verified",
			source_commit: record.source_commit,
			version: record.version,
			archive_sha256: record.sha256,
			checks: [
				"exact converter inventory and hashes",
				"archived CLI inspect/apply/verify/rollback",
				"source bytes preserved",
			],
		};
	} finally {
		fs.rmSync(stage, { recursive: true, force: true });
	}
}
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		if (process.argv.length !== 4 || process.argv[2] !== "--candidate-dir")
			throw Error(
				"Usage: node scripts/migration-candidate-check.mjs --candidate-dir DIR",
			);
		console.log(
			JSON.stringify(checkMigrationCandidate(process.argv[3]), null, 2),
		);
	} catch (error) {
		console.error("Converter acceptance: " + error.message);
		process.exitCode = 1;
	}
}
