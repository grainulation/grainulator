"use strict";
const fs = require("node:fs");
const path = require("node:path");

function real(target) {
	try {
		return fs.realpathSync(target);
	} catch {
		return path.resolve(target);
	}
}
/** Exports may replace their own artifacts, never source data or host settings. */
function assertSafeOutput(output, sourcePaths = []) {
	const targets = [path.resolve(output), real(output)];
	const reserved =
		/^(?:claims\.json(?:\..+)?|compilation\.json|(?:wheat|grainulator)-manifest\.json|(?:wheat|grainulator)\.config\.json|agents\.md|claude\.md|package(?:-lock)?\.json|\.mcp\.json|\.gitignore)$/i;
	for (const target of targets) {
		const parts = target.split(path.sep);
		if (
			reserved.test(path.basename(target)) ||
			parts.some((part) =>
				[".git", ".claude", ".codex", ".agents", ".bean"].includes(part),
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
