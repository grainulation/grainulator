/**
 * fetch-cache.js — Bounded, self-cleaning cache for smart-fetch
 *
 * Storage layout (under SILO_HOME/cache/smart-fetch/):
 *   index.json        { hash → { url, etag, fetched_at, size, key } }
 *   {hash}.json       payload (smart-fetch Response shape)
 *
 * Caps: 100 entries OR 10MB, whichever first. 7-day TTL on read.
 * Eviction: LRU on write when caps exceeded.
 * Atomic writes: tmp + rename (same pattern as silo/lib/store.js).
 *
 * Concurrency: two processes writing the same URL — last-writer-wins,
 * both files remain internally consistent because every write is atomic.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

export const DEFAULT_CACHE_DIR = path.join(
  os.homedir(),
  ".silo",
  "cache",
  "smart-fetch",
);
const MAX_ENTRIES = 100;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class FetchCache {
  constructor(options = {}) {
    this.dir = options.dir || process.env.SILO_CACHE_DIR || DEFAULT_CACHE_DIR;
    // Guard against 0 or negative caps — fall back to defaults
    this.maxEntries =
      options.maxEntries && options.maxEntries > 0
        ? options.maxEntries
        : MAX_ENTRIES;
    this.maxBytes =
      options.maxBytes && options.maxBytes > 0 ? options.maxBytes : MAX_BYTES;
    this.ttlMs =
      options.ttlMs && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;
    this.indexPath = path.join(this.dir, "index.json");
  }

  /** Ensure the cache directory exists. */
  init() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.indexPath)) {
      this._writeJSON(this.indexPath, { entries: {}, seq: 0 });
    }
  }

  /** Get a cached entry by URL. Returns payload or null. */
  get(url, modeKey = "auto") {
    this.init();
    const key = this._key(url, modeKey);
    const index = this._readIndex();
    const entry = index.entries[key];
    if (!entry) return null;
    // TTL check
    if (Date.now() - entry.fetched_at > this.ttlMs) {
      return null;
    }
    const filePath = path.join(this.dir, `${key}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const payload = this._readJSON(filePath);
      // Update access sequence for LRU (monotonic — avoids ms precision collisions)
      index.seq = (index.seq || 0) + 1;
      entry.last_access_seq = index.seq;
      entry.last_access = Date.now();
      this._writeJSON(this.indexPath, index);
      return payload;
    } catch {
      return null;
    }
  }

  /** Store a payload for a URL. Evicts LRU if caps exceeded. */
  set(url, modeKey, payload) {
    this.init();
    const key = this._key(url, modeKey);
    const filePath = path.join(this.dir, `${key}.json`);
    const serialized = JSON.stringify(payload);
    const size = Buffer.byteLength(serialized, "utf8");

    // Write payload first (atomic)
    this._writeFile(filePath, serialized);

    // Cross-process-safe index update: hold a lockfile over read-modify-write.
    // Best-effort — if lock fails (EEXIST or lock stuck), we fall back to
    // the non-locked path and accept the rare last-writer-wins race.
    this._withLock(() => {
      const index = this._readIndex();
      index.seq = (index.seq || 0) + 1;
      const now = Date.now();
      index.entries[key] = {
        url,
        mode_key: modeKey,
        etag: payload.etag || null,
        fetched_at: now,
        last_access: now,
        last_access_seq: index.seq,
        size,
        key,
      };
      this._evictIfNeeded(index);
      this._writeJSON(this.indexPath, index);
    });
  }

  /** Purge all entries matching a domain. */
  purgeDomain(domain) {
    this.init();
    const index = this._readIndex();
    let removed = 0;
    for (const [key, entry] of Object.entries(index.entries)) {
      try {
        const u = new URL(entry.url);
        if (u.hostname === domain || u.hostname.endsWith("." + domain)) {
          this._removeFile(key);
          delete index.entries[key];
          removed++;
        }
      } catch {
        // Skip entries with invalid URLs
      }
    }
    this._writeJSON(this.indexPath, index);
    return removed;
  }

  /** Clear all cache entries. */
  clear() {
    if (!fs.existsSync(this.dir)) return 0;
    const files = fs.readdirSync(this.dir);
    let removed = 0;
    for (const f of files) {
      if (f.endsWith(".json") || f.endsWith(".tmp")) {
        fs.unlinkSync(path.join(this.dir, f));
        removed++;
      }
    }
    this.init();
    return removed;
  }

  /** Return stats about the cache. Excludes expired entries from counts. */
  stats() {
    if (!fs.existsSync(this.indexPath)) {
      return {
        entries: 0,
        expired: 0,
        total_bytes: 0,
        oldest_ms: null,
        newest_ms: null,
        max_entries: this.maxEntries,
        max_bytes: this.maxBytes,
        ttl_ms: this.ttlMs,
      };
    }
    const index = this._readIndex();
    const all = Object.values(index.entries);
    const now = Date.now();
    const live = all.filter((e) => now - (e.fetched_at || 0) <= this.ttlMs);
    const expired = all.length - live.length;
    const total_bytes = live.reduce((s, e) => s + (e.size || 0), 0);
    const timestamps = live.map((e) => e.fetched_at).filter(Boolean);
    return {
      entries: live.length,
      expired,
      total_bytes,
      oldest_ms: timestamps.length ? Math.min(...timestamps) : null,
      newest_ms: timestamps.length ? Math.max(...timestamps) : null,
      max_entries: this.maxEntries,
      max_bytes: this.maxBytes,
      ttl_ms: this.ttlMs,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  _key(url, modeKey) {
    return crypto
      .createHash("sha256")
      .update(`${modeKey}|${url}`)
      .digest("hex")
      .slice(0, 32);
  }

  _readIndex() {
    try {
      return this._readJSON(this.indexPath);
    } catch {
      // Corrupted index — reset
      return { entries: {} };
    }
  }

  _readJSON(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  _writeJSON(filePath, data) {
    this._writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
  }

  _writeFile(filePath, content) {
    const tmp = filePath + ".tmp." + process.pid + "." + Date.now();
    try {
      fs.writeFileSync(tmp, content, "utf-8");
      fs.renameSync(tmp, filePath);
    } catch (err) {
      // Clean up the tmp file on any failure so we don't leak
      try {
        fs.unlinkSync(tmp);
      } catch {
        // tmp file may not have been created yet
      }
      throw err;
    }
  }

  // Serialize read-modify-write on index.json via a lockfile.
  // Best-effort with bounded retries; falls through on timeout.
  _withLock(fn) {
    const lockPath = this.indexPath + ".lock";
    const maxWaitMs = 2000;
    const pollMs = 20;
    const started = Date.now();
    let acquired = false;
    while (!acquired && Date.now() - started < maxWaitMs) {
      try {
        fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
        acquired = true;
      } catch {
        // Another process holds the lock. Check for stale locks (>10s).
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 10000) {
            fs.unlinkSync(lockPath);
          }
        } catch {
          // Lock vanished — next iteration will retry
        }
        // Busy-wait briefly
        const target = Date.now() + pollMs;
        while (Date.now() < target) {}
      }
    }
    try {
      fn();
    } finally {
      if (acquired) {
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }
    }
  }

  _removeFile(key) {
    const filePath = path.join(this.dir, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Concurrent delete is fine
      }
    }
  }

  _evictIfNeeded(index) {
    const entries = Object.entries(index.entries);
    const total = entries.reduce((s, [, e]) => s + (e.size || 0), 0);

    if (entries.length <= this.maxEntries && total <= this.maxBytes) {
      return;
    }

    // If a single entry is larger than maxBytes, don't try to evict below —
    // that would wipe the cache on every write. Pin the newest entry and
    // evict the rest down to its size.
    const newestEntry = entries.reduce((newest, cur) => {
      const seq = cur[1].last_access_seq || cur[1].fetched_at || 0;
      const nseq =
        newest && (newest[1].last_access_seq || newest[1].fetched_at || 0);
      return !newest || seq > nseq ? cur : newest;
    }, null);

    // Sort by last_access_seq ascending (oldest first). Fallback to timestamps.
    entries.sort((a, b) => {
      const aSeq = a[1].last_access_seq;
      const bSeq = b[1].last_access_seq;
      if (aSeq != null && bSeq != null) return aSeq - bSeq;
      return (
        (a[1].last_access || a[1].fetched_at) -
        (b[1].last_access || b[1].fetched_at)
      );
    });

    let remainingTotal = total;
    let remainingCount = entries.length;
    for (const [key, entry] of entries) {
      if (
        remainingCount <= this.maxEntries &&
        remainingTotal <= this.maxBytes
      ) {
        break;
      }
      // Pin the newest entry — don't evict a just-written oversized entry.
      // This prevents pathological cache-wipe when a single entry > maxBytes.
      if (newestEntry && key === newestEntry[0] && remainingCount === 1) {
        break;
      }
      this._removeFile(key);
      delete index.entries[key];
      remainingTotal -= entry.size || 0;
      remainingCount--;
    }
  }
}
