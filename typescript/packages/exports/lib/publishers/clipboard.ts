import importedModule1 = require("../../../shared/lib/fs-safe.cjs");
const { readRegularFile } = importedModule1;

import fs = require("node:fs");
import path = require("node:path");
import importedModule2 = require("node:child_process");
const { execFile } = importedModule2;

/**
 * Copy formatted output to system clipboard.
 * Uses pbcopy (macOS), xclip (Linux), or clip (Windows).
 */

function getClipboardCommand() {
	switch (process.platform) {
		case "darwin":
			return { cmd: "pbcopy", args: [] };
		case "linux":
			return { cmd: "xclip", args: ["-selection", "clipboard"] };
		case "win32":
			return { cmd: "clip", args: [] };
		default:
			return null;
	}
}

function copyToClipboard(text: string) {
	return new Promise<void>((resolve, reject) => {
		const clip = getClipboardCommand();
		if (!clip) {
			reject(new Error(`Clipboard not supported on ${process.platform}`));
			return;
		}

		const proc = execFile(clip.cmd, clip.args, (err) => {
			if (err) reject(new Error(`Clipboard copy failed: ${err.message}`));
			else resolve();
		});

		if (!proc.stdin) {
			reject(new Error("Clipboard input stream unavailable"));
			return;
		}
		proc.stdin.write(text);
		proc.stdin.end();
	});
}

async function publishClipboard(
	inputPath: string,
	_outputPath?: string | null,
) {
	const stat = fs.statSync(inputPath);

	let content: string;
	if (stat.isDirectory()) {
		// If directory, list the files
		const files = fs.readdirSync(inputPath).filter((f) => !f.startsWith("."));
		content = files
			.map((f) => {
				const full = path.join(inputPath, f);
				return readRegularFile(full, "utf-8");
			})
			.join("\n\n---\n\n");
	} else {
		content = readRegularFile(inputPath, "utf-8");
	}

	await copyToClipboard(content);

	const size = Buffer.byteLength(content, "utf-8");
	return {
		message: `Copied to clipboard (${size} bytes)`,
	};
}

export = {
	name: "clipboard",
	description: "Copy formatted output to system clipboard",
	publish: publishClipboard,
};
