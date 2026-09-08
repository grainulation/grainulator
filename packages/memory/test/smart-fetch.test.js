/**
 * smart-fetch.test.js — Unit tests for smart-fetch extraction
 *
 * Tests the pure extraction/scoring logic without network I/O.
 * Network-backed integration tests live in a separate harness.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  _extractMeta,
  _extractBody,
  _assessQuality,
  _decodeEntities,
} from "../lib/smart-fetch.js";

describe("smart-fetch: decodeEntities", () => {
  it("decodes common HTML entities", () => {
    assert.equal(_decodeEntities("&amp;"), "&");
    assert.equal(_decodeEntities("&lt;tag&gt;"), "<tag>");
    assert.equal(_decodeEntities("&quot;hi&quot;"), '"hi"');
    assert.equal(_decodeEntities("&#39;it&#39;s"), "'it's");
    assert.equal(_decodeEntities("a&nbsp;b"), "a b");
    assert.equal(_decodeEntities("&#65;"), "A");
  });

  it("handles empty and null-ish input", () => {
    assert.equal(_decodeEntities(""), "");
    assert.equal(_decodeEntities(null), null);
    assert.equal(_decodeEntities(undefined), undefined);
  });
});

describe("smart-fetch: extractMeta", () => {
  it("extracts title", () => {
    const meta = _extractMeta("<html><head><title>Hello</title></head></html>");
    assert.equal(meta.title, "Hello");
  });

  it("falls back to og:title if no <title>", () => {
    const html = `<html><head><meta property="og:title" content="OGTitle"></head></html>`;
    const meta = _extractMeta(html);
    assert.equal(meta.title, "OGTitle");
  });

  it("extracts description and og:description", () => {
    const html = `<head>
			<meta name="description" content="A description">
			<meta property="og:description" content="An OG description">
		</head>`;
    const meta = _extractMeta(html);
    assert.equal(meta.description, "A description");
    assert.equal(meta.og.description, "An OG description");
  });

  it("extracts headings h1-h3 in order", () => {
    const html = `
			<h1>First</h1>
			<h2>Second</h2>
			<h3>Third</h3>
			<h4>Skipped</h4>
			<h2>Fourth</h2>
		`;
    const meta = _extractMeta(html);
    assert.equal(meta.headings.length, 4);
    assert.deepEqual(
      meta.headings.map((h) => h.text),
      ["First", "Second", "Third", "Fourth"],
    );
  });

  it("counts ld+json scripts", () => {
    const html = `
			<script type="application/ld+json">{}</script>
			<script type="application/ld+json">[]</script>
			<script>other</script>
		`;
    const meta = _extractMeta(html);
    assert.equal(meta.ldJsonCount, 2);
  });

  it("decodes entities in extracted text", () => {
    const html = `<title>A &amp; B</title>`;
    const meta = _extractMeta(html);
    assert.equal(meta.title, "A & B");
  });
});

describe("smart-fetch: extractBody", () => {
  it("prefers <main> over other content", () => {
    const html = `
			<body>
				<nav><p>nav content should be stripped completely</p></nav>
				<main><p>first main paragraph content</p><p>second main paragraph here</p></main>
				<footer><p>footer should be stripped</p></footer>
			</body>
		`;
    const pieces = _extractBody(html);
    assert.equal(pieces.length, 2);
    assert.equal(pieces[0], "first main paragraph content");
    assert.equal(pieces[1], "second main paragraph here");
  });

  it("falls back to <article> when no <main>", () => {
    const html = `<body><article><p>article text that is long enough</p></article></body>`;
    const pieces = _extractBody(html);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0], "article text that is long enough");
  });

  it("falls back to <p> tags anywhere when no semantic container", () => {
    const html = `<body><div><p>orphan paragraph content here</p></div></body>`;
    const pieces = _extractBody(html);
    assert.equal(pieces.length, 1);
  });

  it("skips short text (< 15 chars)", () => {
    const html = `<main><p>short</p><p>this is a longer paragraph</p></main>`;
    const pieces = _extractBody(html);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0], "this is a longer paragraph");
  });

  it("strips script, style, nav, footer, header, aside, iframe, form", () => {
    const html = `
			<header><h1>stripped header</h1></header>
			<nav><p>stripped nav that is long enough</p></nav>
			<main>
				<script>alert("xss")</script>
				<style>body { color: red }</style>
				<p>real content here preserved</p>
				<iframe src="evil.com"></iframe>
				<form><input></form>
			</main>
			<aside><p>stripped aside that is long</p></aside>
			<footer><p>stripped footer that is long</p></footer>
		`;
    const pieces = _extractBody(html);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0], "real content here preserved");
  });

  it("strips HTML comments", () => {
    const html = `<main><!-- hidden --><p>visible paragraph content</p></main>`;
    const pieces = _extractBody(html);
    assert.equal(pieces[0], "visible paragraph content");
  });

  it("handles nested tags inside paragraphs", () => {
    const html = `<main><p>text with <strong>emphasis</strong> and <em>more</em> words</p></main>`;
    const pieces = _extractBody(html);
    assert.equal(pieces[0], "text with emphasis and more words");
  });

  it("decodes entities in body text", () => {
    const html = `<main><p>&lt;script&gt; should appear as literal text in claim</p></main>`;
    const pieces = _extractBody(html);
    assert.equal(pieces[0], "<script> should appear as literal text in claim");
  });
});

describe("smart-fetch: assessQuality", () => {
  it("returns 'high' for substantial content", () => {
    const pieces = [
      "First paragraph with enough content to count here",
      "Second paragraph also with enough content to count",
    ];
    assert.equal(_assessQuality(pieces), "high");
  });

  it("returns 'degraded' for minimal content", () => {
    const pieces = ["Short piece of text here."];
    assert.equal(_assessQuality(pieces), "degraded");
  });

  it("returns 'failed' for empty", () => {
    assert.equal(_assessQuality([]), "failed");
  });

  it("returns 'failed' for near-empty", () => {
    assert.equal(_assessQuality([""]), "failed");
  });

  it("'degraded' if total >= 20 but fewer than 2 pieces", () => {
    const pieces = ["a fairly substantial single piece but alone"];
    assert.equal(_assessQuality(pieces), "degraded");
  });
});

describe("smart-fetch: edge cases", () => {
  it("handles empty HTML", () => {
    assert.deepEqual(_extractBody(""), []);
    assert.equal(_extractMeta("").title, "");
  });

  it("handles HTML with no body content at all", () => {
    const html =
      "<!DOCTYPE html><html><head><title>x</title></head><body></body></html>";
    assert.deepEqual(_extractBody(html), []);
  });

  it("extracts from sibling <p> tags when main has none", () => {
    const html = `
			<body>
				<div class="content">
					<p>First paragraph of sibling content.</p>
					<p>Second paragraph of sibling content.</p>
				</div>
			</body>
		`;
    const pieces = _extractBody(html);
    assert.equal(pieces.length, 2);
  });

  it("does not explode on malformed HTML", () => {
    const html = `<main><p>unclosed paragraph<p>another<main>nested main`;
    // Just make sure it doesn't throw
    assert.doesNotThrow(() => _extractBody(html));
  });
});
