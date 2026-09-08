"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function real(target, depth = 0) {
	if (depth > 40) throw new Error("Too many symbolic links.");
	const absolute = path.resolve(target);
	try {
		return fs.realpathSync(absolute);
	} catch (error) {
		if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		try {
			if (fs.lstatSync(absolute).isSymbolicLink())
				return real(path.resolve(path.dirname(absolute), fs.readlinkSync(absolute)), depth + 1);
		} catch (linkError) {
			if (linkError.code !== "ENOENT" && linkError.code !== "ENOTDIR") throw linkError;
		}
		const parent = path.dirname(absolute);
		if (parent === absolute) throw error;
		return path.join(real(parent, depth), path.basename(absolute));
	}
}
/** Exports may replace their own artifacts, never source data or host settings. */
function assertSafeOutput(output, sourcePaths = []) {
	const targets = [path.resolve(output), real(output)];
	const workspaceConfigs = [
		path.join(os.homedir(), ".config", "grainulator", "workspace.json"),
		process.env.GRAINULATOR_CONFIG,
	].filter(Boolean);
	for (const config of workspaceConfigs) {
		let sameFile = targets.includes(real(config));
		try {
			const a = fs.statSync(output);
			const b = fs.statSync(config);
			sameFile ||= a.dev === b.dev && a.ino === b.ino;
		} catch (error) {
			if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		}
		if (sameFile) throw new Error(`Protected output: ${output}. Native workspace configuration cannot be replaced by an export.`);
	}
	const reserved =
		/^(?:claims\.json(?:\..+)?|compilation\.json|(?:wheat|grainulator)-manifest\.json|(?:wheat|grainulator)\.config\.json|agents\.md|claude\.md|package(?:-lock)?\.json|\.?mcp\.json|plugin\.json|build-info\.json|\.gitignore)$/i;
	for (const target of targets) {
		const parts = target.split(path.sep);
		if (
			reserved.test(path.basename(target)) ||
			parts.some((part) =>
				[".git", ".claude", ".codex", ".agents", ".bean", ".claude-plugin", ".codex-plugin"].includes(part.toLowerCase()),
			)
		)
			throw new Error(
				`Protected output: ${output}. Choose an export artifact path such as output/report.md.`,
			);
	}
	for (const source of sourcePaths) {
		if (targets.includes(real(source)))
			throw new Error(`Output would overwrite its source: ${output}`);
		try {
			const a = fs.statSync(output);
			const b = fs.statSync(source);
			if (a.dev === b.dev && a.ino === b.ino)
				throw new Error(`Output would overwrite its source: ${output}`);
		} catch (error) {
			if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		}
	}
}
module.exports = { assertSafeOutput };
