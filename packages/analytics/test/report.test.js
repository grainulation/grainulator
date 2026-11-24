// Generated from typescript/packages/analytics/test/report.test.ts; edit that source and run npm run build:types.
/** Markdown retrospectives preserve analysis data without a browser renderer. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyze } from "../lib/analyzer.js";
import { calibrate } from "../lib/calibration.js";
import { checkDecay } from "../lib/decay.js";
import { detectPatterns } from "../lib/patterns.js";
import { generateReport } from "../lib/report.js";
import { analyzeTokens } from "../lib/tokens.js";
import { measureVelocity } from "../lib/velocity.js";
import { generateWrapped } from "../lib/wrapped.js";
const NOW = new Date().toISOString();
function makeSprint(name, claims, gitLog) {
	return {
		name,
		dir: `/tmp/${name}`,
		claims,
		compilation: null,
		gitLog: gitLog || [],
	};
}
const SAMPLE_CLAIMS = [
	{
		id: "r001",
		type: "factual",
		evidence: "documented",
		status: "active",
		text: "Node fs.watch works",
		created: NOW,
	},
	{
		id: "p001",
		type: "recommendation",
		evidence: "tested",
		status: "active",
		text: "Use SSE",
		created: NOW,
	},
];
const ALL_FNS = {
	analyzeFn: analyze,
	calibrateFn: calibrate,
	patternsFn: detectPatterns,
	decayFn: checkDecay,
	velocityFn: measureVelocity,
	tokensFn: analyzeTokens,
	wrappedFn: generateWrapped,
};
describe("report: generateReport (happy path)", () => {
	it("returns Markdown with analysis data and counts", () => {
		const sprint = makeSprint("test-sprint", SAMPLE_CLAIMS);
		const html = generateReport([sprint], ALL_FNS);
		assert.equal(typeof html, "string");
		assert.ok(html.length > 100, "report should be non-trivial in size");
		assert.match(html, /^# Grainulator analytics retrospective/);
		assert.match(html, /## Analysis/);
		// Counts injected
		assert.ok(html.includes("2"), "should include the claim count");
		// Date placeholder replaced
		assert.ok(!html.includes("{{GENERATED_DATE}}"));
		assert.ok(!html.includes("{{CLAIM_COUNT}}"));
		assert.ok(!html.includes("{{SPRINT_COUNT}}"));
	});
	it("renders without tokensFn / wrappedFn (optional deps)", () => {
		const sprint = makeSprint("noopt", SAMPLE_CLAIMS);
		const html = generateReport([sprint], {
			analyzeFn: analyze,
			calibrateFn: calibrate,
			patternsFn: detectPatterns,
			decayFn: checkDecay,
			velocityFn: measureVelocity,
		});
		assert.equal(typeof html, "string");
		// The token and wrapped sections should be empty strings (not {{...}}).
		assert.ok(!html.includes("{{TOKEN_COST_SECTION}}"));
		assert.ok(!html.includes("{{WRAPPED_SECTION}}"));
	});
});
describe("report: generateReport (boundary / edge cases)", () => {
	it("handles an empty sprints array without throwing", () => {
		const html = generateReport([], ALL_FNS);
		assert.equal(typeof html, "string");
		// Zero sprints / zero claims should still produce a document.
		assert.match(html, /^# Grainulator analytics retrospective/);
		assert.ok(!html.includes("{{SPRINT_COUNT}}"));
	});
	it("renders a sprint with no claims", () => {
		const empty = makeSprint("empty", []);
		const html = generateReport([empty], ALL_FNS);
		assert.equal(typeof html, "string");
		assert.ok(html.length > 100);
	});
});
describe("report: generateReport (literal evidence data)", () => {
	it("roundtrips JSON with ampersand URLs, script text and Markdown fences", () => {
		const payload = {
			summary: { totalSprints: 1, totalClaims: 1 },
			source: "https://example.com/source?a=1&b=2",
			content:
				'<script>alert("x")</script>\n```\n# forged heading & exact bytes',
		};
		const report = generateReport([], {
			analyzeFn: () => payload,
			calibrateFn: () => null,
			patternsFn: () => null,
			decayFn: () => null,
			velocityFn: () => null,
		});
		const blocks = [...report.matchAll(/(?:^ {4}.*\n)+/gm)];
		assert.equal(blocks.length, 1);
		const restored = JSON.parse(
			blocks[0][0]
				.split("\n")
				.filter(Boolean)
				.map((line) => line.slice(4))
				.join("\n"),
		);
		assert.deepEqual(restored, payload);
		assert.ok(
			!report
				.split("\n")
				.some((line) => /^(?:<script>|```|# forged)/i.test(line)),
		);
	});
	it("escapes user-authored summary prose while preserving the code payload", () => {
		const payload = {
			summary: { totalSprints: "<script>prose</script> &", totalClaims: 0 },
		};
		const report = generateReport([], {
			analyzeFn: () => payload,
			calibrateFn: () => null,
			patternsFn: () => null,
			decayFn: () => null,
			velocityFn: () => null,
		});
		assert.ok(
			report.includes("Sprints: &lt;script&gt;prose&lt;/script&gt; &amp;"),
		);
		const matched = report.match(/(?:^ {4}.*\n)+/m);
		assert.ok(matched);
		const block = matched[0];
		assert.deepEqual(
			JSON.parse(
				block
					.split("\n")
					.filter(Boolean)
					.map((line) => line.slice(4))
					.join("\n"),
			),
			payload,
		);
	});
});
