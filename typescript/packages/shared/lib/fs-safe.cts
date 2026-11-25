import fs = require("node:fs");
// Pin the opened inode for type/size checks and the read. No final symlink or
// FIFO is followed. Concurrent replacement of parent directories needs OS isolation.
function readRegularFile(
	file: fs.PathLike,
	encoding: BufferEncoding,
	maxBytes?: number,
): string;
function readRegularFile(
	file: fs.PathLike,
	encoding?: undefined,
	maxBytes?: number,
): Buffer;
function readRegularFile(
	file: fs.PathLike,
	encoding?: BufferEncoding,
	maxBytes = 64 * 1024 * 1024,
): string | Buffer {
	const fd = fs.openSync(
		file,
		fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
	);
	try {
		const stat = fs.fstatSync(fd);
		if (!stat.isFile())
			throw Object.assign(new Error("Not a regular file"), { code: "EISDIR" });
		if (stat.size > maxBytes)
			throw Object.assign(new Error("File exceeds the supported size"), {
				code: "EFBIG",
			});
		const chunks: Buffer[] = [];
		let total = 0;
		for (;;) {
			const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - total + 1));
			const count = fs.readSync(fd, chunk, 0, chunk.length, null);
			if (!count) break;
			total += count;
			if (total > maxBytes)
				throw Object.assign(new Error("File exceeds the supported size"), {
					code: "EFBIG",
				});
			chunks.push(chunk.subarray(0, count));
		}
		const result = Buffer.concat(chunks, total);
		return encoding ? result.toString(encoding) : result;
	} finally {
		fs.closeSync(fd);
	}
}
function writeNewFile(
	file: fs.PathLike,
	data: string | NodeJS.ArrayBufferView,
	encoding: BufferEncoding = "utf8",
) {
	const fd = fs.openSync(file, "wx", 0o600);
	try {
		fs.writeFileSync(fd, data, encoding);
	} finally {
		fs.closeSync(fd);
	}
}
function appendRegularFile(
	file: fs.PathLike,
	data: string | NodeJS.ArrayBufferView,
) {
	const fd = fs.openSync(
		file,
		fs.constants.O_WRONLY |
			fs.constants.O_APPEND |
			fs.constants.O_NOFOLLOW |
			fs.constants.O_NONBLOCK,
	);
	try {
		if (!fs.fstatSync(fd).isFile()) throw new Error("Not a regular file");
		fs.writeFileSync(fd, data);
	} finally {
		fs.closeSync(fd);
	}
}
export = { readRegularFile, writeNewFile, appendRegularFile };
