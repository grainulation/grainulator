/**
 * paths.cjs — CommonJS mirror of lib/paths.js.
 */

import path = require("node:path");
import fs = require("node:fs");
import errors = require("./errors.cjs");
const { resolve, relative, sep, dirname, basename, join } = path;
const { realpathSync, lstatSync, readlinkSync } = fs;

// Resolve-and-realpath, so a symlink inside baseDir pointing at /etc
// does not silently pass containment checks. Falls back to logical
// resolve when the path doesn't exist yet.
function resolveReal(p: string, depth = 0): string {
	if (depth > 40) throw new Error("Too many symbolic links");
	const abs = resolve(p);
	try {
		return realpathSync(abs);
	} catch (error) {
		if (
			errors.errorCode(error) !== "ENOENT" &&
			errors.errorCode(error) !== "ENOTDIR"
		)
			throw error;
		try {
			if (lstatSync(abs).isSymbolicLink())
				return resolveReal(resolve(dirname(abs), readlinkSync(abs)), depth + 1);
		} catch (linkError) {
			if (
				errors.errorCode(linkError) !== "ENOENT" &&
				errors.errorCode(linkError) !== "ENOTDIR"
			)
				throw linkError;
		}
		const parent = dirname(abs);
		if (parent === abs) throw error;
		return join(resolveReal(parent, depth), basename(abs));
	}
}

function isInsideDir(target: string, baseDir: string) {
	const base = resolveReal(baseDir);
	const t = resolveReal(target);
	if (t === base) return true;
	return t.startsWith(base + sep);
}

function resolveSafe(baseDir: string, target: string) {
	const base = resolve(baseDir);
	const resolved = resolve(base, target);
	if (!isInsideDir(resolved, base)) {
		throw new Error(
			`Path escapes workspace: ${target} → ${resolved} (base: ${base})`,
		);
	}
	return resolved;
}

function assertInsideDir(target: string, baseDir: string) {
	if (!isInsideDir(target, baseDir)) {
		throw new Error(
			`Path outside workspace: ${target} (base: ${resolve(baseDir)})`,
		);
	}
}

function relativeInside(baseDir: string, target: string) {
	if (!isInsideDir(target, baseDir)) return null;
	return relative(resolve(baseDir), resolve(target));
}

export = {
	isInsideDir,
	resolveSafe,
	assertInsideDir,
	relativeInside,
};
