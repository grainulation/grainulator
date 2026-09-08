/**
 * Atomic file writes — tmp + rename pattern.
 *
 * On POSIX filesystems, rename() is atomic within the same filesystem. Writing
 * to a tmp path and then renaming ensures readers never see a partial file.
 *
 * Tmp filename includes PID + timestamp so concurrent writers don't collide.
 * On any failure (ENOSPC, EACCES, EIO), the tmp file is unlinked so we don't
 * leak `.tmp.*` files.
 *
 * Usage (ESM):
 *   import { atomicWrite, atomicWriteJSON } from "./atomic.js";
 */

import { writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";

/**
 * Atomically write a string to `filePath`.
 * @param {string} filePath
 * @param {string|Buffer} content
 * @param {string} [encoding="utf-8"]
 */
export function atomicWrite(filePath, content, encoding = "utf-8") {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmp, content, encoding);
    renameSync(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup so we don't leak tmp files on ENOSPC etc.
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // Cleanup failures are not worth surfacing
    }
    throw err;
  }
}

/**
 * Atomically write a JSON value to `filePath`. Adds a trailing newline.
 * @param {string} filePath
 * @param {unknown} data
 * @param {number} [indent=2] — JSON.stringify indent
 */
export function atomicWriteJSON(filePath, data, indent = 2) {
  atomicWrite(filePath, `${JSON.stringify(data, null, indent)}\n`);
}
