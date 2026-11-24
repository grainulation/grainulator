import fs = require("node:fs");
import crypto = require("node:crypto");
const { randomUUID } = crypto;

// Exclusive creation owns the temporary inode; rename replaces the destination
// entry, never follows a destination symlink. Parent directories remain trusted.
function atomicWrite(
	filePath: fs.PathLike,
	content: string | NodeJS.ArrayBufferView,
	encoding: BufferEncoding = "utf-8",
) {
	const tmp = `${filePath}.tmp.${randomUUID()}`;
	let fd: number | undefined;
	let owned = false;
	try {
		fd = fs.openSync(tmp, "wx", 0o600);
		owned = true;
		fs.writeFileSync(fd, content, encoding);
		fs.closeSync(fd);
		fd = undefined;
		fs.renameSync(tmp, filePath);
		owned = false;
	} finally {
		if (fd !== undefined) fs.closeSync(fd);
		if (owned) {
			try {
				fs.unlinkSync(tmp);
			} catch {
				/* Preserve the original error. */
			}
		}
	}
}
function atomicWriteJSON(filePath: fs.PathLike, data: unknown, indent = 2) {
	atomicWrite(filePath, `${JSON.stringify(data, null, indent)}\n`);
}
export = { atomicWrite, atomicWriteJSON };
