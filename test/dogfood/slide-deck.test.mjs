import assert from "node:assert/strict";
import { test } from "node:test";
import { convert } from "../../packages/exports/lib/formats/slide-deck.mjs";

test("slide deck consumes canonical compilation and escapes all supplied content", () => {
	const html = convert({
		sprint_meta: { question: 'Review <script>alert("title")</script>' },
		compiled_at: "2026-09-07T00:00:00Z",
		compilation_certificate: { input_hash: "sha256:fixture" },
		resolved_claims: [
			{
				id: 'r"01',
				type: '<img src=x onerror="alert(1)">',
				content: '<script>alert("body")</script>',
				status: "active",
			},
			{
				id: "retired",
				type: "risk",
				content: "SHOULD_NOT_APPEAR",
				status: "superseded",
			},
		],
		conflict_graph: {
			unresolved: [
				{ claimA: "r001", claimB: "r002", reason: "Different results" },
			],
		},
	});
	assert.match(html, /sha256:fixture/);
	assert.match(html, /r001 vs r002/);
	assert.match(html, /2026-09-07T00:00:00Z/);
	assert.match(html, /&lt;script&gt;/);
	assert.match(html, /&lt;img/);
	assert.doesNotMatch(html, /<img|SHOULD_NOT_APPEAR|<script>alert/);
});

test("large decks paginate without dropping claims or using nested scrolling and key traps", () => {
	const claims = Array.from({ length: 19 }, (_, i) => ({
		id: `r${i}`,
		type: "factual",
		status: "active",
		content: `Unique finding ${i}.`,
	}));
	const html = convert({ meta: { question: "Large deck" }, claims });
	const sections = html.match(/<section\b[^>]*>/g);
	assert.equal(sections.length, 8); // Title, summary, five content pages, certificate.
	assert.ok(sections.every((section) => section.includes('tabindex="0"')));
	for (const claim of claims)
		assert.equal(html.split(claim.content).length - 1, 1);
	assert.ok(
		[...html.matchAll(/<ul class="claim-list">([\s\S]*?)<\/ul>/g)].every(
			(match) => (match[1].match(/<li>/g) || []).length <= 4,
		),
	);
	assert.match(
		html,
		/<main id="main-content" role="main" aria-roledescription="carousel"/,
	);
	assert.match(html, /<a href="#main-content" class="skip-nav">/);
	assert.match(html, /<footer role="contentinfo">/);
	assert.match(html, /id="slide-announcer" role="status" aria-live="polite"/);
	assert.match(html, /:focus-visible/);
	assert.match(html, /IntersectionObserver/);
	assert.doesNotMatch(
		html,
		/preventDefault|keydown|max-height:70vh|overflow-y:auto|(?<!min-)height:100vh/,
	);
});
