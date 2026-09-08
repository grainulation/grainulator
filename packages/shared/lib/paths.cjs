/**
 * paths.cjs — CommonJS mirror of lib/paths.js.
 */

"use strict";

const {
	resolve,
	relative,
	sep,
	dirname,
	basename,
	join,
} = require("node:path");
const { realpathSync, lstatSync, readlinkSync } = require("node:fs");

// Resolve-and-realpath, so a symlink inside baseDir pointing at /etc
// does not silently pass containment checks. Falls back to logical
// resolve when the path doesn't exist yet.
function resolveReal(p, depth = 0) {
	if (depth > 40) throw new Error("Too many symbolic links");
	const abs = resolve(p);
	try {
		return realpathSync(abs);
	} catch (error) {
		if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		try {
			if (lstatSync(abs).isSymbolicLink())
				return resolveReal(resolve(dirname(abs), readlinkSync(abs)), depth + 1);
		} catch (linkError) {
			if (linkError.code !== "ENOENT" && linkError.code !== "ENOTDIR")
				throw linkError;
		}
		const parent = dirname(abs);
		if (parent === abs) throw error;
		return join(resolveReal(parent, depth), basename(abs));
	}
}

function isInsideDir(target, baseDir) {
	const base = resolveReal(baseDir);
	const t = resolveReal(target);
	if (t === base) return true;
	return t.startsWith(base + sep);
}

function resolveSafe(baseDir, target) {
	const base = resolve(baseDir);
	const resolved = resolve(base, target);
	if (!isInsideDir(resolved, base)) {
		throw new Error(
			`Path escapes workspace: ${target} → ${resolved} (base: ${base})`,
		);
	}
	return resolved;
}

function assertInsideDir(target, baseDir) {
	if (!isInsideDir(target, baseDir)) {
		throw new Error(
			`Path outside workspace: ${target} (base: ${resolve(baseDir)})`,
		);
	}
}

function relativeInside(baseDir, target) {
	if (!isInsideDir(target, baseDir)) return null;
	return relative(resolve(baseDir), resolve(target));
}

module.exports = {
	isInsideDir,
	resolveSafe,
	assertInsideDir,
	relativeInside,
};
