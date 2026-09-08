/**
 * fetch-cache.test.js — Unit tests for the bounded LRU fetch cache.
 *
 * All tests use a scratch directory under /tmp, never touch real ~/.silo.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { FetchCache } from "../lib/fetch-cache.js";

const TEST_DIR = path.join(os.tmpdir(), `silo-cache-test-${Date.now()}`);

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe("fetch-cache", () => {
  before(() => cleanup());
  after(() => cleanup());

  beforeEach(() => {
    cleanup();
  });

  it("writes and reads a payload", () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    const payload = { title: "Test", content: "Hello" };
    cache.set("https://example.com/a", "concise", payload);
    const got = cache.get("https://example.com/a", "concise");
    assert.deepEqual(got, payload);
  });

  it("returns null for missing entries", () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    assert.equal(cache.get("https://notcached.com", "concise"), null);
  });

  it("separates entries by mode", () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    cache.set("https://example.com", "concise", { mode: "concise" });
    cache.set("https://example.com", "full", { mode: "full" });
    assert.equal(cache.get("https://example.com", "concise").mode, "concise");
    assert.equal(cache.get("https://example.com", "full").mode, "full");
  });

  it("expires entries past TTL", () => {
    const cache = new FetchCache({ dir: TEST_DIR, ttlMs: 10 });
    cache.set("https://example.com/stale", "concise", { x: 1 });
    // Force index to be old
    const index = JSON.parse(fs.readFileSync(cache.indexPath, "utf8"));
    const key = Object.keys(index.entries)[0];
    index.entries[key].fetched_at = Date.now() - 1000;
    fs.writeFileSync(cache.indexPath, JSON.stringify(index));
    assert.equal(cache.get("https://example.com/stale", "concise"), null);
  });

  it("evicts LRU when entry cap exceeded", () => {
    const cache = new FetchCache({ dir: TEST_DIR, maxEntries: 3 });
    cache.set("https://a.com", "concise", { x: 1 });
    cache.set("https://b.com", "concise", { x: 2 });
    cache.set("https://c.com", "concise", { x: 3 });
    // Access a.com to make it recent
    cache.get("https://a.com", "concise");
    // d.com forces eviction — b.com should be oldest now
    cache.set("https://d.com", "concise", { x: 4 });
    const stats = cache.stats();
    assert.equal(stats.entries, 3);
    assert.equal(cache.get("https://b.com", "concise"), null);
    assert.ok(cache.get("https://a.com", "concise"));
    assert.ok(cache.get("https://d.com", "concise"));
  });

  it("evicts when byte cap exceeded", () => {
    const cache = new FetchCache({ dir: TEST_DIR, maxBytes: 500 });
    // Each payload ~100 bytes
    cache.set("https://a.com", "concise", { x: "a".repeat(80) });
    cache.set("https://b.com", "concise", { x: "b".repeat(80) });
    cache.set("https://c.com", "concise", { x: "c".repeat(80) });
    cache.set("https://d.com", "concise", { x: "d".repeat(80) });
    cache.set("https://e.com", "concise", { x: "e".repeat(80) });
    const stats = cache.stats();
    assert.ok(
      stats.total_bytes <= 500,
      `expected ≤ 500 bytes, got ${stats.total_bytes}`,
    );
  });

  it("purges entries by domain", () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    cache.set("https://example.com/a", "concise", { x: 1 });
    cache.set("https://example.com/b", "concise", { x: 2 });
    cache.set("https://other.com/c", "concise", { x: 3 });
    const removed = cache.purgeDomain("example.com");
    assert.equal(removed, 2);
    assert.equal(cache.get("https://example.com/a", "concise"), null);
    assert.equal(cache.get("https://example.com/b", "concise"), null);
    assert.ok(cache.get("https://other.com/c", "concise"));
  });

  it("clears all entries", () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    cache.set("https://a.com", "concise", { x: 1 });
    cache.set("https://b.com", "concise", { x: 2 });
    cache.clear();
    assert.equal(cache.stats().entries, 0);
  });

  it("handles corrupted index gracefully", () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    cache.init();
    fs.writeFileSync(cache.indexPath, "NOT JSON");
    assert.equal(cache.get("https://a.com", "concise"), null);
    // A subsequent set should still work (rebuilding index)
    assert.doesNotThrow(() => cache.set("https://a.com", "concise", { x: 1 }));
  });

  it("handles concurrent writes without corrupting the index", async () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    // Two "concurrent" writes — we can't actually fork processes in a unit test,
    // but we can interleave operations to exercise the rename-swap pattern.
    await Promise.all([
      Promise.resolve().then(() =>
        cache.set("https://a.com", "concise", { x: 1 }),
      ),
      Promise.resolve().then(() =>
        cache.set("https://b.com", "concise", { x: 2 }),
      ),
      Promise.resolve().then(() =>
        cache.set("https://c.com", "concise", { x: 3 }),
      ),
    ]);
    const stats = cache.stats();
    // All 3 should be written; index should be readable
    assert.equal(stats.entries, 3);
  });

  it("stats reports entry count, bytes, and timestamps", () => {
    const cache = new FetchCache({ dir: TEST_DIR });
    cache.set("https://a.com", "concise", { x: "hello world" });
    const stats = cache.stats();
    assert.equal(stats.entries, 1);
    assert.ok(stats.total_bytes > 0);
    assert.ok(stats.oldest_ms > 0);
    assert.ok(stats.newest_ms > 0);
    assert.equal(stats.max_entries, 100);
  });
});
