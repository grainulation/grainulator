import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
export function unpackBase(bytes, destination) {
	if (bytes.length > 5 * 1024 * 1024)
		throw Error("Base compressed size exceeds5MiB");
	const tar = zlib.gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }),
		seen = new Set();
	let offset = 0,
		count = 0;
	const text = (b) => b.toString("utf8").replace(/\0.*$/s, "");
	const number = (b) => {
		const value = text(b).trim();
		if (!/^[0-7]+$/.test(value)) throw Error("Invalid tar number");
		return parseInt(value, 8);
	};
	fs.mkdirSync(destination, { mode: 0o700 });
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((b) => b === 0)) {
			if (tar.subarray(offset).some((b) => b !== 0))
				throw Error("Data after archive terminator");
			return;
		}
		let checksum = 0;
		for (let i = 0; i < 512; i++)
			checksum += i >= 148 && i < 156 ? 32 : header[i];
		if (checksum !== number(header.subarray(148, 156)))
			throw Error("Bad base tar checksum");
		const prefix = text(header.subarray(345, 500)),
			name = (prefix ? prefix + "/" : "") + text(header.subarray(0, 100));
		if (
			!name.startsWith("package/") ||
			name.includes("\\") ||
			name.includes("\0")
		)
			throw Error("Unexpected base archive root");
		const relative = name.slice(8),
			parts = relative.split("/");
		if (
			!relative ||
			parts.some((p) => !p || p === "." || p === "..") ||
			path.isAbsolute(relative)
		)
			throw Error("Unsafe base archive path");
		const key = relative.normalize("NFC").toLowerCase();
		if (seen.has(key) || ++count > 5000)
			throw Error("Duplicate or excessive base entries");
		seen.add(key);
		if (![0, 48].includes(header[156]) || text(header.subarray(157, 257)))
			throw Error("Base archive accepts regular files only");
		const mode = number(header.subarray(100, 108));
		if (mode & 0o7000) throw Error("Unsafe base file mode");
		const size = number(header.subarray(124, 136));
		if (size > 32 * 1024 * 1024 || offset + 512 + size > tar.length)
			throw Error("Unsafe base file size");
		const file = path.join(destination, relative);
		fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
		fs.writeFileSync(file, tar.subarray(offset + 512, offset + 512 + size), {
			flag: "wx",
			mode: mode & 0o777,
		});
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	throw Error("Base archive lacks terminator");
}
