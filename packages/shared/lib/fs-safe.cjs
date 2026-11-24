// Generated from typescript/packages/shared/lib/fs-safe.cts; edit that source and run npm run build:types.
"use strict";
const fs = require("node:fs");
function readRegularFile(file, encoding, maxBytes = 64 * 1024 * 1024) {
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
		const chunks = [];
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
function writeNewFile(file, data, encoding = "utf8") {
	const fd = fs.openSync(file, "wx", 0o600);
	try {
		fs.writeFileSync(fd, data, encoding);
	} finally {
		fs.closeSync(fd);
	}
}
function appendRegularFile(file, data) {
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
module.exports = { readRegularFile, writeNewFile, appendRegularFile };
