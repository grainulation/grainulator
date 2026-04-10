/**
 * Tests for lib/tips-analyze.cjs -- the pure analysis logic extracted
 * from tips-hook.cjs.
 *
 * Validates conflict counting, weak topic detection, monoculture detection,
 * echo chamber warnings, tips markdown generation, and summary truncation.
 *
 * Uses node:test + node:assert -- zero dependencies.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const {
	findWeakTopics,
	findMonocultureTopics,
	buildTipsSections,
	buildTipsMarkdown,
	buildSummary,
} = require("../lib/tips-analyze.cjs");

// ── Test fixtures ───────────────────────────────────────────────────────────

/** Clean compilation -- no issues at all. */
const CLEAN_COMPILATION = {
	status: "ready",
	compiler_version: "1.0.0",
	claims_hash: "abc123",
	conflict_graph: { unresolved: [] },
	coverage: {
		"test-infra": {
			claims: 4,
			max_evidence: "documented",
			status: "strong",
			types: ["factual", "recommendation"],
			claim_ids: ["r001", "r002", "r003", "r004"],
		},
	},
	warnings: [],
};

/** Compilation with 2 unresolved conflicts. */
const CONFLICTED_COMPILATION = {
	status: "blocked",
	compiler_version: "1.0.0",
	claims_hash: "def456",
	conflict_graph: {
		unresolved: [
			{
				claim_ids: ["r001", "r002"],
				description: "r001 says X, r002 says not-X",
			},
			{
				claim_ids: ["r003", "r004"],
				description: "Evidence tier disagreement",
			},
		],
	},
	coverage: {},
	warnings: [],
};

/** Compilation with weak-evidence topics. */
const WEAK_EVIDENCE_COMPILATION = {
	status: "ready",
	compiler_version: "1.0.0",
	claims_hash: "ghi789",
	conflict_graph: { unresolved: [] },
	coverage: {
		"topic-stated": {
			claims: 2,
			max_evidence: "stated",
			status: "weak",
			types: ["factual", "risk"],
			claim_ids: ["r010", "r011"],
		},
		"topic-web": {
			claims: 3,
			max_evidence: "web",
			status: "moderate",
			types: ["factual", "estimate", "risk"],
			claim_ids: ["r020", "r021", "r022"],
		},
		"topic-documented": {
			claims: 5,
			max_evidence: "documented",
			status: "strong",
			types: ["factual", "recommendation"],
			claim_ids: ["r030", "r031", "r032", "r033", "r034"],
		},
	},
	warnings: [],
};

/** Compilation with type monoculture topics. */
const MONOCULTURE_COMPILATION = {
	status: "ready",
	compiler_version: "1.0.0",
	claims_hash: "jkl012",
	conflict_graph: { unresolved: [] },
	coverage: {
		"all-factual": {
			claims: 4,
			max_evidence: "documented",
			status: "strong",
			types: ["factual"],
			claim_ids: ["r040", "r041", "r042", "r043"],
		},
		"single-claim": {
			claims: 1,
			max_evidence: "stated",
			status: "weak",
			types: ["factual"],
			claim_ids: ["r050"],
		},
		"mixed-types": {
			claims: 3,
			max_evidence: "tested",
			status: "strong",
			types: ["factual", "risk", "recommendation"],
			claim_ids: ["r060", "r061", "r062"],
		},
	},
	warnings: [],
};

/** Compilation with echo chamber warnings. */
const ECHO_COMPILATION = {
	status: "ready",
	compiler_version: "1.0.0",
	claims_hash: "mno345",
	conflict_graph: { unresolved: [] },
	coverage: {},
	warnings: [
		{
			code: "W_ECHO_CHAMBER",
			message: "Topic 'security' has claims from a single source",
			claims: ["r070", "r071"],
		},
		{
			code: "W_ECHO_CHAMBER",
			message: "Topic 'deployment' has claims from a single source",
			claims: ["r080", "r081"],
		},
		{
			code: "W_LOW_DIVERSITY",
			message: "Some other warning",
			claims: ["r090"],
		},
	],
};

/** Compilation with ALL issue types for combined testing. */
const EVERYTHING_WRONG_COMPILATION = {
	status: "blocked",
	compiler_version: "1.0.0",
	claims_hash: "pqr678",
	conflict_graph: {
		unresolved: [
			{
				claim_ids: ["r001", "x001"],
				description: "Contradictory findings",
			},
		],
	},
	coverage: {
		"weak-topic": {
			claims: 2,
			max_evidence: "stated",
			status: "weak",
			types: ["factual"],
			claim_ids: ["r100", "r101"],
		},
	},
	warnings: [
		{
			code: "W_ECHO_CHAMBER",
			message: "Topic 'weak-topic' has claims from a single source",
			claims: ["r100", "r101"],
		},
	],
};

// ── findWeakTopics ──────────────────────────────────────────────────────────

describe("findWeakTopics", () => {
	it("returns empty array for clean compilation", () => {
		const result = findWeakTopics(CLEAN_COMPILATION.coverage);
		assert.equal(result.length, 0);
	});

	it("detects topics with stated evidence", () => {
		const result = findWeakTopics(WEAK_EVIDENCE_COMPILATION.coverage);
		const stated = result.find((t) => t.topic === "topic-stated");
		assert.ok(stated, "should find topic-stated");
		assert.equal(stated.claims, 2);
		assert.equal(stated.maxEvidence, "stated");
	});

	it("detects topics with web evidence", () => {
		const result = findWeakTopics(WEAK_EVIDENCE_COMPILATION.coverage);
		const web = result.find((t) => t.topic === "topic-web");
		assert.ok(web, "should find topic-web");
		assert.equal(web.claims, 3);
		assert.equal(web.maxEvidence, "web");
	});

	it("excludes topics with documented or higher evidence", () => {
		const result = findWeakTopics(WEAK_EVIDENCE_COMPILATION.coverage);
		const documented = result.find((t) => t.topic === "topic-documented");
		assert.equal(documented, undefined, "should not include documented topic");
	});

	it("detects topics with explicit weak status", () => {
		const coverage = {
			explicit: {
				claims: 1,
				max_evidence: "documented",
				status: "weak",
				types: ["factual"],
			},
		};
		const result = findWeakTopics(coverage);
		assert.equal(result.length, 1);
		assert.equal(result[0].topic, "explicit");
	});

	it("handles empty coverage object", () => {
		const result = findWeakTopics({});
		assert.equal(result.length, 0);
	});

	it("defaults claims to 0 when missing", () => {
		const coverage = {
			missing: { max_evidence: "stated", status: "weak", types: [] },
		};
		const result = findWeakTopics(coverage);
		assert.equal(result[0].claims, 0);
	});

	it("defaults maxEvidence to unknown when missing", () => {
		const coverage = {
			missing: { claims: 1, status: "weak", types: [] },
		};
		const result = findWeakTopics(coverage);
		assert.equal(result[0].maxEvidence, "unknown");
	});
});

// ── findMonocultureTopics ───────────────────────────────────────────────────

describe("findMonocultureTopics", () => {
	it("returns empty array for clean compilation", () => {
		const result = findMonocultureTopics(CLEAN_COMPILATION.coverage);
		assert.equal(result.length, 0);
	});

	it("detects topics with single type and 2+ claims", () => {
		const result = findMonocultureTopics(MONOCULTURE_COMPILATION.coverage);
		const mono = result.find((t) => t.topic === "all-factual");
		assert.ok(mono, "should find all-factual");
		assert.equal(mono.type, "factual");
		assert.equal(mono.count, 4);
	});

	it("excludes single-claim topics even if single type", () => {
		const result = findMonocultureTopics(MONOCULTURE_COMPILATION.coverage);
		const single = result.find((t) => t.topic === "single-claim");
		assert.equal(single, undefined, "should not flag single-claim topics");
	});

	it("excludes multi-type topics", () => {
		const result = findMonocultureTopics(MONOCULTURE_COMPILATION.coverage);
		const mixed = result.find((t) => t.topic === "mixed-types");
		assert.equal(mixed, undefined, "should not flag mixed-type topics");
	});

	it("handles empty coverage object", () => {
		const result = findMonocultureTopics({});
		assert.equal(result.length, 0);
	});

	it("handles missing types array", () => {
		const coverage = { noTypes: { claims: 5, max_evidence: "documented" } };
		const result = findMonocultureTopics(coverage);
		assert.equal(result.length, 0);
	});
});

// ── buildTipsSections ───────────────────────────────────────────────────────

describe("buildTipsSections", () => {
	it("returns no issues for clean compilation", () => {
		const { issues, mdSections } = buildTipsSections(CLEAN_COMPILATION, "on");
		assert.equal(issues.length, 0);
		assert.equal(mdSections.length, 0);
	});

	it("counts conflicts in quiet mode", () => {
		const { issues, mdSections } = buildTipsSections(
			CONFLICTED_COMPILATION,
			"quiet",
		);
		assert.equal(issues.length, 1);
		assert.ok(issues[0].includes("2 conflicts"));
		assert.ok(mdSections.some((s) => s.includes("Unresolved Conflicts")));
	});

	it("includes conflict claim IDs in markdown", () => {
		const { mdSections } = buildTipsSections(CONFLICTED_COMPILATION, "on");
		assert.ok(mdSections.some((s) => s.includes("r001, r002")));
		assert.ok(mdSections.some((s) => s.includes("r003, r004")));
	});

	it("includes conflict descriptions in markdown", () => {
		const { mdSections } = buildTipsSections(CONFLICTED_COMPILATION, "on");
		assert.ok(mdSections.some((s) => s.includes("r001 says X")));
		assert.ok(mdSections.some((s) => s.includes("Evidence tier")));
	});

	it("detects weak evidence in on mode", () => {
		const { issues } = buildTipsSections(WEAK_EVIDENCE_COMPILATION, "on");
		assert.ok(issues.some((i) => i.includes("weak evidence")));
	});

	it("skips weak evidence in quiet mode", () => {
		const { issues } = buildTipsSections(WEAK_EVIDENCE_COMPILATION, "quiet");
		assert.equal(
			issues.length,
			0,
			"quiet mode should skip weak evidence topics",
		);
	});

	it("detects type monoculture in on mode", () => {
		const { issues } = buildTipsSections(MONOCULTURE_COMPILATION, "on");
		assert.ok(issues.some((i) => i.includes("type monoculture")));
	});

	it("skips monoculture in quiet mode", () => {
		const { issues } = buildTipsSections(MONOCULTURE_COMPILATION, "quiet");
		assert.equal(issues.length, 0, "quiet mode should skip monoculture topics");
	});

	it("detects echo chamber warnings in on mode", () => {
		const { issues } = buildTipsSections(ECHO_COMPILATION, "on");
		assert.ok(issues.some((i) => i.includes("echo chamber")));
	});

	it("filters only W_ECHO_CHAMBER warnings", () => {
		const { issues } = buildTipsSections(ECHO_COMPILATION, "on");
		// Should report 2 echo warnings, not the W_LOW_DIVERSITY one
		const echoIssue = issues.find((i) => i.includes("echo chamber"));
		assert.ok(echoIssue.includes("2"), "should find exactly 2 echo warnings");
	});

	it("skips echo chamber warnings in quiet mode", () => {
		const { issues } = buildTipsSections(ECHO_COMPILATION, "quiet");
		assert.equal(
			issues.length,
			0,
			"quiet mode should skip echo chamber warnings",
		);
	});

	it("reports all issue types for combined problems", () => {
		const { issues } = buildTipsSections(EVERYTHING_WRONG_COMPILATION, "on");
		assert.ok(issues.some((i) => i.includes("conflict")));
		assert.ok(issues.some((i) => i.includes("weak evidence")));
		assert.ok(issues.some((i) => i.includes("type monoculture")));
		assert.ok(issues.some((i) => i.includes("echo chamber")));
		assert.equal(issues.length, 4, "should have 4 distinct issue categories");
	});

	it("uses singular for 1 conflict", () => {
		const compilation = {
			conflict_graph: {
				unresolved: [{ claim_ids: ["r001"], description: "Issue" }],
			},
			coverage: {},
			warnings: [],
		};
		const { issues } = buildTipsSections(compilation, "on");
		assert.ok(issues[0].includes("1 conflict"));
		assert.ok(!issues[0].includes("conflicts"));
	});

	it("uses plural for multiple conflicts", () => {
		const { issues } = buildTipsSections(CONFLICTED_COMPILATION, "on");
		assert.ok(issues[0].includes("conflicts"));
	});

	it("handles conflict with claimIds (camelCase) property", () => {
		const compilation = {
			conflict_graph: {
				unresolved: [{ claimIds: ["x001", "x002"], message: "Disagreement" }],
			},
			coverage: {},
			warnings: [],
		};
		const { mdSections } = buildTipsSections(compilation, "on");
		assert.ok(mdSections.some((s) => s.includes("x001, x002")));
	});

	it("handles conflict with single id property", () => {
		const compilation = {
			conflict_graph: {
				unresolved: [{ id: "C001", description: "Legacy conflict" }],
			},
			coverage: {},
			warnings: [],
		};
		const { mdSections } = buildTipsSections(compilation, "on");
		assert.ok(mdSections.some((s) => s.includes("C001")));
	});

	it("falls back to unknown for missing conflict identifiers", () => {
		const compilation = {
			conflict_graph: {
				unresolved: [{ description: "No IDs at all" }],
			},
			coverage: {},
			warnings: [],
		};
		const { mdSections } = buildTipsSections(compilation, "on");
		assert.ok(mdSections.some((s) => s.includes("unknown")));
	});

	it("handles missing conflict_graph gracefully", () => {
		const compilation = { coverage: {}, warnings: [] };
		const { issues } = buildTipsSections(compilation, "on");
		assert.ok(!issues.some((i) => i.includes("conflict")));
	});

	it("handles missing coverage gracefully", () => {
		const compilation = {
			conflict_graph: { unresolved: [] },
			warnings: [],
		};
		const { issues } = buildTipsSections(compilation, "on");
		assert.equal(issues.length, 0);
	});

	it("handles missing warnings gracefully", () => {
		const compilation = {
			conflict_graph: { unresolved: [] },
			coverage: {},
		};
		const { issues } = buildTipsSections(compilation, "on");
		assert.equal(issues.length, 0);
	});

	it("caps weak topics at 10 in markdown", () => {
		const coverage = {};
		for (let i = 0; i < 15; i++) {
			coverage[`weak-${i}`] = {
				claims: 2,
				max_evidence: "stated",
				status: "weak",
				types: ["factual", "risk"],
			};
		}
		const compilation = {
			conflict_graph: { unresolved: [] },
			coverage,
			warnings: [],
		};
		const { mdSections } = buildTipsSections(compilation, "on");
		const weakLines = mdSections.filter((s) => s.startsWith("- **weak-"));
		assert.equal(weakLines.length, 10, "should cap at 10 weak topics shown");
		assert.ok(
			mdSections.some((s) => s.includes("showing 10 of 15")),
			"should indicate truncation",
		);
	});

	it("caps monoculture topics at 10 in markdown", () => {
		const coverage = {};
		for (let i = 0; i < 12; i++) {
			coverage[`mono-${i}`] = {
				claims: 3,
				max_evidence: "documented",
				status: "strong",
				types: ["factual"],
			};
		}
		const compilation = {
			conflict_graph: { unresolved: [] },
			coverage,
			warnings: [],
		};
		const { mdSections } = buildTipsSections(compilation, "on");
		const monoLines = mdSections.filter((s) => s.startsWith("- **mono-"));
		assert.equal(
			monoLines.length,
			10,
			"should cap at 10 monoculture topics shown",
		);
		assert.ok(
			mdSections.some((s) => s.includes("showing 10 of 12")),
			"should indicate truncation",
		);
	});

	it("caps echo chamber warnings at 5 in markdown", () => {
		const echoWarnings = [];
		for (let i = 0; i < 8; i++) {
			echoWarnings.push({
				code: "W_ECHO_CHAMBER",
				message: `Topic 'topic-${i}' has claims from a single source`,
				claims: [`r${i}0`],
			});
		}
		const compilation = {
			conflict_graph: { unresolved: [] },
			coverage: {},
			warnings: echoWarnings,
		};
		const { mdSections } = buildTipsSections(compilation, "on");
		const echoLines = mdSections.filter((s) => s.startsWith("- Topic"));
		assert.equal(echoLines.length, 5, "should cap at 5 echo warnings shown");
		assert.ok(
			mdSections.some((s) => s.includes("showing 5 of 8")),
			"should indicate truncation",
		);
	});
});

// ── buildTipsMarkdown ───────────────────────────────────────────────────────

describe("buildTipsMarkdown", () => {
	it("includes Sprint Health Tips header", () => {
		const md = buildTipsMarkdown(CLEAN_COMPILATION, "on", ["1 issue"], []);
		assert.ok(md.includes("# Sprint Health Tips"));
	});

	it("includes level and timestamp", () => {
		const md = buildTipsMarkdown(CLEAN_COMPILATION, "quiet", ["1 issue"], []);
		assert.ok(md.includes("Level: quiet"));
		assert.ok(md.includes("Generated"));
	});

	it("includes compilation status metadata", () => {
		const md = buildTipsMarkdown(
			CLEAN_COMPILATION,
			"on",
			["test"],
			["## Test Section\n"],
		);
		assert.ok(md.includes("**Status**: ready"));
		assert.ok(md.includes("**Compiler**: 1.0.0"));
		assert.ok(md.includes("**Claims hash**: abc123"));
	});

	it("includes markdown sections", () => {
		const sections = ["## Conflicts\n", "- **r001, r002**: Something wrong"];
		const md = buildTipsMarkdown(
			CLEAN_COMPILATION,
			"on",
			["1 conflict"],
			sections,
		);
		assert.ok(md.includes("## Conflicts"));
		assert.ok(md.includes("r001, r002"));
	});

	it("includes actionable command hints in footer", () => {
		const md = buildTipsMarkdown(CLEAN_COMPILATION, "on", ["test"], []);
		assert.ok(md.includes("/resolve"));
		assert.ok(md.includes("/research"));
		assert.ok(md.includes("/challenge"));
		assert.ok(md.includes("/witness"));
	});

	it("defaults status fields when missing", () => {
		const bare = {};
		const md = buildTipsMarkdown(bare, "on", ["test"], []);
		assert.ok(md.includes("**Status**: unknown"));
		assert.ok(md.includes("**Compiler**: unknown"));
		assert.ok(md.includes("**Claims hash**: unknown"));
	});
});

// ── buildSummary ────────────────────────────────────────────────────────────

describe("buildSummary", () => {
	it("joins issues into readable summary", () => {
		const summary = buildSummary(
			["2 conflicts", "3 topics with weak evidence"],
			".wheat-tips.md",
			180,
		);
		assert.ok(summary.includes("2 conflicts"));
		assert.ok(summary.includes("3 topics with weak evidence"));
		assert.ok(summary.includes(".wheat-tips.md"));
	});

	it("truncates at maxLength with ellipsis", () => {
		const longIssues = [
			"15 topics with extremely verbose weak evidence descriptions that go on and on",
			"12 topics with type monoculture across many categories",
		];
		const summary = buildSummary(longIssues, ".wheat-tips.md", 80);
		assert.ok(summary.length <= 80, `summary too long: ${summary.length}`);
		assert.ok(summary.endsWith("..."));
	});

	it("does not truncate short summaries", () => {
		const summary = buildSummary(["1 conflict"], ".wheat-tips.md", 180);
		assert.ok(!summary.endsWith("..."));
		assert.ok(summary.length < 180);
	});

	it("handles empty issues array", () => {
		const summary = buildSummary([], ".wheat-tips.md", 180);
		assert.ok(summary.includes("Sprint health:"));
	});
});
