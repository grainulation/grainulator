"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

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

function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    const clip = getClipboardCommand();
    if (!clip) {
      reject(new Error(`Clipboard not supported on ${process.platform}`));
      return;
    }

    const proc = execFile(clip.cmd, clip.args, (err) => {
      if (err) reject(new Error(`Clipboard copy failed: ${err.message}`));
      else resolve();
    });

    proc.stdin.write(text);
    proc.stdin.end();
  });
}

async function publishClipboard(inputPath) {
  const stat = fs.statSync(inputPath);

  let content;
  if (stat.isDirectory()) {
    // If directory, list the files
    const files = fs.readdirSync(inputPath).filter((f) => !f.startsWith("."));
    content = files
      .map((f) => {
        const full = path.join(inputPath, f);
        return fs.readFileSync(full, "utf-8");
      })
      .join("\n\n---\n\n");
  } else {
    content = fs.readFileSync(inputPath, "utf-8");
  }

  await copyToClipboard(content);

  const size = Buffer.byteLength(content, "utf-8");
  return {
    message: `Copied to clipboard (${size} bytes)`,
  };
}

module.exports = {
  name: "clipboard",
  description: "Copy formatted output to system clipboard",
  publish: publishClipboard,
};
