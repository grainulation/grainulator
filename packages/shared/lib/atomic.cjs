/**
 * atomic.cjs — CommonJS mirror of lib/atomic.js.
 */

"use strict";

const fs = require("node:fs");

function atomicWrite(filePath, content, encoding = "utf-8") {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmp, content, encoding);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
}

function atomicWriteJSON(filePath, data, indent = 2) {
  atomicWrite(filePath, `${JSON.stringify(data, null, indent)}\n`);
}

module.exports = { atomicWrite, atomicWriteJSON };
