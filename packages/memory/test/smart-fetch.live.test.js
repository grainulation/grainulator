/**
 * smart-fetch.live.test.js — Regression fixtures against real websites.
 *
 * Opt-in via FETCH_LIVE=1 (skipped by default in CI to avoid network flakiness).
 * Validates that smart-fetch still produces high-quality extraction for the
 * benchmark URL set. Run pre-release:
 *
 *   FETCH_LIVE=1 node --test test/smart-fetch.live.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { smartFetch } from "../lib/smart-fetch.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIVE = process.env.FETCH_LIVE === "1";
const fixturePath = path.join(__dirname, "smart-fetch-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8")).fixtures;

describe("smart-fetch: live regression fixtures", () => {
  if (!LIVE) {
    it("skipped (set FETCH_LIVE=1 to run network fixtures)", () => {
      assert.ok(true);
    });
    return;
  }

  for (const fixture of fixtures) {
    it(`[${fixture.id}] ${fixture.url}`, async () => {
      const result = await smartFetch(fixture.url, {
        mode: fixture.mode || "auto",
        cache: false, // fixtures always hit the network
      });

      const exp = fixture.expect;

      assert.equal(
        result.quality,
        exp.quality,
        `quality mismatch for ${fixture.id}: got "${result.quality}", expected "${exp.quality}"${
          result.warnings && result.warnings.length
            ? `  (warnings: ${result.warnings.join(", ")})`
            : ""
        }`,
      );

      if (exp.title_present) {
        assert.ok(
          result.title && result.title.length > 0,
          `title missing for ${fixture.id}`,
        );
      }

      if (exp.min_content_chars != null) {
        assert.ok(
          (result.content || "").length >= exp.min_content_chars,
          `content too short for ${fixture.id}: got ${result.content?.length || 0}, expected ≥ ${exp.min_content_chars}`,
        );
      }

      if (exp.max_content_chars != null) {
        assert.ok(
          (result.content || "").length <= exp.max_content_chars,
          `content too long for ${fixture.id}: got ${result.content?.length || 0}, expected ≤ ${exp.max_content_chars}`,
        );
      }

      if (exp.must_contain_any && exp.must_contain_any.length > 0) {
        const lower = (result.content || "").toLowerCase();
        const matched = exp.must_contain_any.filter((k) =>
          lower.includes(k.toLowerCase()),
        );
        assert.ok(
          matched.length > 0,
          `none of ${JSON.stringify(exp.must_contain_any)} found in content for ${fixture.id}`,
        );
      }
    });
  }
});
