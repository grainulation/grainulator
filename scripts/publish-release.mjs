#!/usr/bin/env node
// Source identity is checked against the live peeled tag immediately before create.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRelease } from "./verify-release.mjs";

const defaultRun = (argv) =>
	spawnSync("gh", argv, {
		encoding: "utf8",
		maxBuffer: 1024 * 1024,
		timeout: 60000,
	});
function request(run, endpoint) {
	const result = run(["api", endpoint]);
	if (result.error || result.status !== 0)
		throw Error("Cannot establish live release tag identity");
	return JSON.parse(result.stdout);
}
export function publishRelease({
	directory,
	manifestSha256,
	version,
	sourceCommit,
	tag,
	repository,
	run = defaultRun,
}) {
	if (
		!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "") ||
		tag !== `v${version}` ||
		!/^v3\.\d+\.\d+$/.test(tag) ||
		!/^[a-f0-9]{40}$/.test(sourceCommit || "")
	)
		throw Error(
			"Explicit repository, versioned tag and frozen source commit are required",
		);
	const verified = verifyRelease({
		directory,
		manifestSha256,
		version,
		sourceCommit,
	});
	const existing = run([
		"api",
		"--include",
		`repos/${repository}/releases/tags/${tag}`,
	]);
	if (
		existing.error ||
		existing.status === 0 ||
		!/^HTTP\/[^\s]+ 404\b/.test(existing.stdout || "")
	)
		throw Error(
			"Release exists or its absence could not be established; refusing publication",
		);
	let object = request(run, `repos/${repository}/git/ref/tags/${tag}`).object;
	const seen = new Set();
	for (let depth = 0; depth < 8; depth++) {
		if (!object || !/^[a-f0-9]{40}$/.test(object.sha || ""))
			throw Error("Invalid live release tag target");
		if (object.type === "commit") break;
		if (object.type !== "tag" || seen.has(object.sha))
			throw Error("Invalid live annotated tag chain");
		seen.add(object.sha);
		object = request(run, `repos/${repository}/git/tags/${object.sha}`).object;
	}
	if (object?.type !== "commit" || object.sha !== sourceCommit)
		throw Error("Live release tag differs from frozen source commit");
	// A live check cannot make mutable tags atomic. Release tags must remain immutable.
	const result = run([
		"release",
		"create",
		tag,
		...verified.files,
		"--repo",
		repository,
		"--verify-tag",
		"--title",
		tag,
		"--generate-notes",
	]);
	if (result.error || result.status !== 0)
		throw Error(
			"Release creation failed or outcome unknown; reconcile before retry",
		);
	return {
		status: "published",
		tag,
		source_commit: sourceCommit,
		manifest_sha256: manifestSha256,
	};
}
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		const tag = process.env.GITHUB_REF_NAME;
		console.log(
			JSON.stringify(
				publishRelease({
					directory: "release-input",
					manifestSha256: process.env.EXPECTED_MANIFEST_SHA256,
					version: tag?.slice(1),
					sourceCommit: process.env.GITHUB_SHA,
					tag,
					repository: process.env.GITHUB_REPOSITORY,
				}),
				null,
				2,
			),
		);
	} catch (error) {
		console.error("Release publication: " + error.message);
		process.exitCode = 1;
	}
}
