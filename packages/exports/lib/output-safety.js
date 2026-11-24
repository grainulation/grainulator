// Generated from typescript/packages/exports/lib/output-safety.ts; edit that source and run npm run build:types.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const projectConfig = require("../../shared/lib/project-config.cjs");
function real(target, depth = 0) {
	if (depth > 40) throw new Error("Too many symbolic links.");
	const absolute = path.resolve(target);
	try {
		return fs.realpathSync(absolute);
	} catch (caughterror) {
		const error =
			caughterror instanceof Error
				? caughterror
				: new Error(String(caughterror));
		if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		try {
			if (fs.lstatSync(absolute).isSymbolicLink())
				return real(
					path.resolve(path.dirname(absolute), fs.readlinkSync(absolute)),
					depth + 1,
				);
		} catch (caughtlinkError) {
			const linkError =
				caughtlinkError instanceof Error
					? caughtlinkError
					: new Error(String(caughtlinkError));
			if (linkError.code !== "ENOENT" && linkError.code !== "ENOTDIR")
				throw linkError;
		}
		const parent = path.dirname(absolute);
		if (parent === absolute) throw error;
		return path.join(real(parent, depth), path.basename(absolute));
	}
}
/** Exports may replace their own artifacts, never source data or host settings. */
function assertSafeOutput(output, sourcePaths = [], options = {}) {
	sourcePaths = [...sourcePaths];
	const protectedRoots = [];
	// Inspect only enclosing canonical project configurations. These are protection
	// rules, never legacy readers or fallback paths.
	const visited = new Set();
	for (const start of [
		path.dirname(output),
		...sourcePaths.map((file) => path.dirname(file)),
	]) {
		const scope = projectConfig.resolveScopeRoot(start, options);
		projectConfig.assertMigrationReady(start, { workspace: scope });
		let current = path.resolve(start);
		for (;;) {
			if (!visited.has(current)) {
				visited.add(current);
				const markerFile = path.join(current, ".grainulator", "migration.json");
				if (fs.existsSync(markerFile)) {
					const marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
					const transaction = marker.transaction_directory;
					if (
						typeof transaction !== "string" ||
						path.dirname(real(transaction)) !==
							real(path.join(current, ".grainulator-migrations"))
					)
						throw new Error(
							"Migration source protection inventory is invalid.",
						);
					const journal = JSON.parse(
						fs.readFileSync(path.join(transaction, "journal.json"), "utf8"),
					);
					if (!Array.isArray(journal.plan?.operations))
						throw new Error(
							"Migration source protection inventory is unavailable.",
						);
					for (const operation of journal.plan.operations)
						for (const source of [
							operation.source,
							...(operation.sources || []).map((item) => item.path),
							operation.manifest?.path,
						].filter(Boolean))
							if (typeof source === "string")
								protectedRoots.push(path.resolve(source));
				}
				const selected = projectConfig.readSection(current, "evidence", {
					workspace: scope,
				});
				if (selected.exists) {
					sourcePaths.push(selected.file);
					const value = selected.value;
					for (const key of ["claims", "compilation"]) {
						const file = value?.compiler?.[key];
						if (file) sourcePaths.push(path.resolve(selected.origin, file));
					}
				}
			}
			if (real(current) === real(scope)) break;
			const parent = path.dirname(current);
			if (parent === current) break;
			current = parent;
		}
	}
	const targets = [path.resolve(output), real(output)];
	for (const original of protectedRoots) {
		const preserved = real(original);
		for (const target of targets) {
			const relative = path.relative(preserved, target);
			if (
				relative === "" ||
				(relative !== ".." &&
					!relative.startsWith(`..${path.sep}`) &&
					!path.isAbsolute(relative))
			)
				throw new Error(
					"Protected output: a migration original cannot be replaced.",
				);
		}
	}
	const workspaceConfigs = [
		path.join(os.homedir(), ".config", "grainulator", "workspace.json"),
		process.env.GRAINULATOR_CONFIG,
	].filter((value) => typeof value === "string" && Boolean(value));
	for (const config of workspaceConfigs) {
		let sameFile = targets.includes(real(config));
		try {
			const a = fs.statSync(output);
			const b = fs.statSync(config);
			sameFile ||= a.dev === b.dev && a.ino === b.ino;
		} catch (caughterror) {
			const error =
				caughterror instanceof Error
					? caughterror
					: new Error(String(caughterror));
			if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		}
		if (sameFile)
			throw new Error(
				`Protected output: ${output}. Native workspace configuration cannot be replaced by an export.`,
			);
	}
	const reserved =
		/^(?:claims\.json(?:\..+)?|compilation\.json|(?:evidence|grainulator)-manifest\.json|(?:evidence|grainulator)\.config\.json|agents\.md|claude\.md|package(?:-lock)?\.json|\.?mcp\.json|plugin\.json|build-info\.json|\.gitignore)$/i;
	for (const target of targets) {
		const parts = target.split(path.sep);
		if (
			reserved.test(path.basename(target)) ||
			parts.some(
				(part) =>
					[
						".git",
						".claude",
						".codex",
						".agents",
						".claude-plugin",
						".codex-plugin",
					].includes(part.toLowerCase()) ||
					/^\.(?:grainulator(?:-migrations)?|wheat|bean|silo|grainulation)$/i.test(
						part,
					),
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
		} catch (caughterror) {
			const error =
				caughterror instanceof Error
					? caughterror
					: new Error(String(caughterror));
			if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		}
	}
}
module.exports = { assertSafeOutput };
