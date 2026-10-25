/**
 * passages — content-addressed source passages for witness claims
 *
 * A witness can record the exact sentence it relies on (`source.quote`) and
 * the passage that contains it. The passage is stored once under
 * `<sprint>/evidence/passages/<sha256>.txt` and the claim keeps only its
 * digest (`source.passage_sha256`), so a compiled result names the exact
 * bytes it relied on and any later edit to them is detectable.
 *
 * Integrity is not support: a quote found in an intact passage shows what the
 * witness cited, not that the passage proves the claim.
 *
 * Threat model: the sprint directory belongs to the local user. Passage text
 * is untrusted content from the web. Concurrent hostile writers inside the
 * sprint directory are out of scope, as they are for claims.json itself; the
 * checks below reject symlinks, special files and oversized files so a
 * mistaken or copied-in ledger cannot read outside the sprint or hang.
 *
 * Zero npm dependencies.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PASSAGE_MAX_BYTES = 262_144;
export const QUOTE_MAX_BYTES = 2_048;
// Per compilation: bounds the work for ledgers that reference many passages.
export const MAX_PASSAGES_PER_COMPILE = 2_000;
export const MAX_PASSAGE_BYTES_PER_COMPILE = 64 * 1024 * 1024;

const DIGEST = /^[0-9a-f]{64}$/;
const { O_RDONLY, O_NOFOLLOW = 0, O_NONBLOCK = 0 } = fs.constants;

export const isDigest = (value) =>
	typeof value === "string" && DIGEST.test(value);

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Stored form: NFC, with CRLF and lone CR turned into LF. */
export function normalizeStored(text) {
	return text.normalize("NFC").replace(/\r\n?/g, "\n");
}

/** Matching form: NFC, every whitespace run collapsed to one space, trimmed. */
export function normalizeMatch(text) {
	return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Returns an error code for an unusable quote, or null. */
export function quoteProblem(quote) {
	if (typeof quote !== "string") return "quote_not_string";
	if (Buffer.byteLength(quote, "utf8") > QUOTE_MAX_BYTES) return "quote_too_large";
	if (!normalizeMatch(quote)) return "quote_empty";
	return null;
}

export function quoteInPassage(quote, text) {
	return normalizeMatch(text).includes(normalizeMatch(quote));
}

function passageDir(root) {
	return path.join(root, "evidence", "passages");
}

// Each directory between the sprint root and the passage file must be a real
// directory (not a symlink) that resolves inside the root.
function checkDirs(root, create) {
	const rootReal = fs.realpathSync(root);
	let current = root;
	for (const part of ["evidence", "passages"]) {
		current = path.join(current, part);
		let st;
		try {
			st = fs.lstatSync(current);
		} catch (err) {
			if (err.code !== "ENOENT" || !create) return "missing";
			fs.mkdirSync(current);
			st = fs.lstatSync(current);
		}
		if (st.isSymbolicLink() || !st.isDirectory()) return "unsafe_directory";
		const real = fs.realpathSync(current);
		if (!real.startsWith(rootReal + path.sep)) return "unsafe_directory";
	}
	return null;
}

/**
 * Read a stored passage without following symlinks or blocking on special
 * files. Returns { ok: true, text, actual, bytes } or { ok: false, code,
 * actual?, bytes }. `actual` is the sha256 of the bytes read, when they could
 * be read; `bytes` is how many bytes were read, for the caller's budget.
 * `budget` caps the bytes this call may read; a passage larger than the budget
 * is reported as `limit_exceeded` without being read. Filesystem errors become
 * codes, never exceptions.
 */
export function readPassage(root, digest, budget = PASSAGE_MAX_BYTES) {
	if (!isDigest(digest)) return { ok: false, code: "invalid_digest", bytes: 0 };
	let dirProblem;
	try {
		dirProblem = checkDirs(root, false);
	} catch {
		dirProblem = "unreadable";
	}
	if (dirProblem) return { ok: false, code: dirProblem, bytes: 0 };
	const file = path.join(passageDir(root), `${digest}.txt`);
	const limit = Math.min(PASSAGE_MAX_BYTES, Math.max(0, budget));
	const read = readBoundedRegularFile(file, limit);
	if (!read.ok)
		return {
			ok: false,
			code:
				read.code === "too_large" && limit < PASSAGE_MAX_BYTES
					? "limit_exceeded"
					: read.code,
			bytes: read.bytes,
		};
	const actual = sha256(read.data);
	if (actual !== digest)
		return { ok: false, code: "hash_mismatch", actual, bytes: read.bytes };
	let text;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(read.data);
	} catch {
		return { ok: false, code: "invalid_utf8", actual, bytes: read.bytes };
	}
	return { ok: true, text, actual, bytes: read.bytes };
}

/**
 * Read a regular file of at most `limit` bytes. The file is opened first and
 * every check runs on the open descriptor, so the checks and the read always
 * concern the same file. Symlinks are refused (O_NOFOLLOW; where the platform
 * lacks it, by checking the path after opening), special files are refused
 * without blocking (O_NONBLOCK), and a file that grows past the limit while
 * being read is refused. Returns { ok: true, data, bytes } or
 * { ok: false, code, bytes }; filesystem errors become codes.
 */
export function readBoundedRegularFile(file, limit) {
	let fd;
	try {
		fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
	} catch (err) {
		const code =
			err.code === "ENOENT"
				? "missing"
				: err.code === "ELOOP" || err.code === "EMLINK"
					? "symlink"
					: "unreadable";
		return { ok: false, code, bytes: 0 };
	}
	let n = 0;
	try {
		const st = fs.fstatSync(fd);
		if (!st.isFile()) return { ok: false, code: "not_regular", bytes: 0 };
		if (!O_NOFOLLOW && fs.lstatSync(file).isSymbolicLink())
			return { ok: false, code: "symlink", bytes: 0 };
		if (st.size > limit) return { ok: false, code: "too_large", bytes: 0 };
		// Read at most one byte past the limit, so a file that grew is rejected.
		const buf = Buffer.alloc(limit + 1);
		for (;;) {
			const r = fs.readSync(fd, buf, n, buf.length - n, n);
			if (r === 0) break;
			n += r;
			if (n > limit) return { ok: false, code: "too_large", bytes: n };
		}
		return { ok: true, data: buf.subarray(0, n), bytes: n };
	} catch {
		return { ok: false, code: "unreadable", bytes: n };
	} finally {
		try {
			fs.closeSync(fd);
		} catch {
			// The bytes were already read or the read already failed; a close
			// error does not change that observation.
		}
	}
}

/**
 * Store a passage and return its digest. Publication is atomic: the bytes are
 * written to a temporary file and hard-linked to the final name, so readers
 * never see a partial passage. An existing file with the same name is reused
 * only if its bytes hash to that name.
 */
export function storePassage(root, passage) {
	if (typeof passage !== "string")
		throw new Error("source.passage must be a string.");
	const bytes = Buffer.from(normalizeStored(passage), "utf8");
	if (bytes.length > PASSAGE_MAX_BYTES)
		throw new Error(
			`source.passage is ${bytes.length} bytes; the limit is ${PASSAGE_MAX_BYTES}.`,
		);
	if (!bytes.length) throw new Error("source.passage is empty.");
	if (checkDirs(root, true))
		throw new Error(
			"evidence/passages must be a real directory inside the sprint.",
		);
	const digest = sha256(bytes);
	const dir = passageDir(root);
	const final = path.join(dir, `${digest}.txt`);
	const tmp = path.join(
		dir,
		`.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`,
	);
	try {
		const fd = fs.openSync(tmp, "wx", 0o644);
		try {
			// writeSync may write fewer bytes than asked; loop until all are out.
			let written = 0;
			while (written < bytes.length) {
				const n = fs.writeSync(fd, bytes, written, bytes.length - written);
				if (!(n > 0)) throw new Error("passage write made no progress");
				written += n;
			}
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}
		try {
			fs.linkSync(tmp, final);
		} catch (err) {
			if (err.code !== "EEXIST") throw err;
			const existing = readPassage(root, digest);
			if (!existing.ok)
				throw new Error(
					`A stored passage named ${digest} exists but is unusable (${existing.code}).`,
				);
		}
	} finally {
		fs.rmSync(tmp, { force: true });
	}
	return digest;
}
