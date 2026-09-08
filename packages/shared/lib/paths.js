/**
 * Path-safety helpers — shared across tools that accept user-supplied paths.
 *
 * Prevents path-traversal attacks where a tool accepts a relative path
 * and the attacker supplies "../../../etc/passwd" or an absolute path
 * that escapes the intended workspace.
 *
 * Usage (ESM):
 *   import { isInsideDir, resolveSafe, assertInsideDir } from "./paths.js";
 */

import { resolve, relative, sep, dirname, basename, join } from "node:path";
import { realpathSync, lstatSync, readlinkSync } from "node:fs";

/**
 * Resolve `p` to an absolute path AND, when the path (or a prefix of it)
 * exists on disk, resolve symlinks so `foo/bar` that contains a symlink
 * to `/etc` is compared as `/etc/...`. If the path doesn't exist yet
 * (e.g. a file about to be written), resolve the nearest existing ancestor before appending missing path segments.
 */
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

/**
 * Returns true if `target` is the same as `baseDir` or nested inside it.
 * Both paths are resolved via `fs.realpathSync` (when available) so that a
 * symlink inside `baseDir` pointing at e.g. `/etc` does NOT silently pass
 * the containment check. Resolves existing ancestors when the path
 * doesn't exist yet (e.g. a file being created).
 *
 * Uses path separator + prefix check to avoid the classic "/foo" matching
 * "/foobar" bug: /foo + sep → /foo/ which does not prefix /foobar.
 *
 * @param {string} target
 * @param {string} baseDir
 * @returns {boolean}
 */
export function isInsideDir(target, baseDir) {
	const base = resolveReal(baseDir);
	const t = resolveReal(target);
	if (t === base) return true;
	return t.startsWith(base + sep);
}

/**
 * Resolve a user-supplied path relative to a base, but reject escape.
 * Returns the resolved absolute path, or throws if the result would
 * fall outside baseDir.
 *
 * @param {string} baseDir — the trusted root (absolute path)
 * @param {string} target  — user-supplied path (relative or absolute)
 * @returns {string}       — resolved absolute path inside baseDir
 * @throws {Error}         — if target escapes baseDir
 */
export function resolveSafe(baseDir, target) {
	const base = resolve(baseDir);
	const resolved = resolve(base, target);
	if (!isInsideDir(resolved, base)) {
		throw new Error(
			`Path escapes workspace: ${target} → ${resolved} (base: ${base})`,
		);
	}
	return resolved;
}

/**
 * Assert that a path lives inside baseDir. Throws otherwise. Use this at
 * MCP tool entrypoints that accept file paths.
 *
 * @param {string} target
 * @param {string} baseDir
 * @throws {Error}
 */
export function assertInsideDir(target, baseDir) {
	if (!isInsideDir(target, baseDir)) {
		throw new Error(
			`Path outside workspace: ${target} (base: ${resolve(baseDir)})`,
		);
	}
}

/**
 * Return the posix-style relative path from base to target, or null if
 * target is outside base. Useful for producing user-facing path strings.
 */
export function relativeInside(baseDir, target) {
	if (!isInsideDir(target, baseDir)) return null;
	return relative(resolve(baseDir), resolve(target));
}
