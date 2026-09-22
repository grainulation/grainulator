"use strict";
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");

// Exclusive creation owns the temporary inode; rename replaces the destination
// entry, never follows a destination symlink. Parent directories remain trusted.
function atomicWrite(filePath, content, encoding = "utf-8") {
  const tmp = `${filePath}.tmp.${randomUUID()}`;
  let fd;
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
      try { fs.unlinkSync(tmp); } catch { /* Preserve the original error. */ }
    }
  }
}
function atomicWriteJSON(filePath, data, indent = 2) {
  atomicWrite(filePath, `${JSON.stringify(data, null, indent)}\n`);
}
module.exports = { atomicWrite, atomicWriteJSON };
