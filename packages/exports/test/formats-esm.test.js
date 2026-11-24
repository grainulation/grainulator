// Generated from typescript/packages/exports/test/formats-esm.test.ts; edit that source and run npm run build:types.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const importedModule1 = require("node:url");
const { fileURLToPath } = importedModule1;
const importedModule2 = require("node:path");
const { dirname } = importedModule2;
const FORMATS_DIR = path.join(__dirname, "..", "lib", "formats");
// Every format module in lib/formats/ must export: name, extension, convert
const REQUIRED_EXPORTS = ["name", "extension", "convert"];
// Optional but expected exports
const OPTIONAL_EXPORTS = ["mimeType", "description"];
async function run() {
	console.log("formats ESM loading tests\n");
	// Underscore-prefixed modules are shared utilities, not format converters.
	const files = fs
		.readdirSync(FORMATS_DIR)
		.filter((f) => f.endsWith(".mjs") && !f.startsWith("_"));
	assert.ok(
		files.length > 0,
		"Expected at least one format module in lib/formats/",
	);
	for (const retired of [
		"html-report",
		"executive-summary",
		"slide-deck",
		"static-site",
	]) {
		assert.ok(
			!files.includes(`${retired}.mjs`),
			`${retired} must not be discoverable`,
		);
	}
	const evidence = {
		meta: { question: "Keep source identity" },
		claims: [
			{
				id: "r001",
				type: "factual",
				status: "active",
				content: "Verified result",
				evidence: { tier: "tested", source: "https://example.com/source" },
				sources: ["https://example.com/source"],
				provenance: { revision: "abc123" },
				verified_by: "command-verifier",
				verification: { verdict: "passed" },
			},
		],
		certificate: { sha256: "a".repeat(64) },
	};
	const json = await import("../lib/formats/json.mjs");
	assert.deepStrictEqual(
		JSON.parse(json.convert(evidence)),
		evidence,
		"JSON must preserve complete evidence",
	);
	const markdown = await import("../lib/formats/markdown.mjs");
	const rendered = markdown.convert(evidence);
	for (const expected of [
		"r001",
		"https://example.com/source",
		"abc123",
		"command-verifier",
		"passed",
	]) {
		assert.ok(
			rendered.includes(expected),
			`Markdown lost evidence reference: ${expected}`,
		);
	}
	const reference = {
		url: "https://example.com/source?a=1&b=2",
		excerpt: '<script>alert("x")</script>\n```\n# forged heading & exact bytes',
	};
	const tricky = {
		claims: [
			{
				id: "r002",
				type: "factual",
				content: "<script>prose</script> & text",
				evidence: { tier: "documented", source: reference.url },
				sources: [reference],
				provenance: reference,
			},
		],
	};
	const literalMarkdown = markdown.convert(tricky);
	const referenceBlocks = [...literalMarkdown.matchAll(/(?:^ {8}.*\n)+/gm)].map(
		(match) =>
			JSON.parse(
				match[0]
					.split("\n")
					.filter(Boolean)
					.map((line) => line.slice(8))
					.join("\n"),
			),
	);
	assert.deepStrictEqual(
		referenceBlocks,
		[reference.url, [reference], reference],
		"Indented reference JSON must roundtrip without entity encoding",
	);
	assert.ok(
		literalMarkdown.includes("&lt;script&gt;prose&lt;/script&gt; &amp; text"),
		"Prose must still escape raw HTML",
	);
	assert.ok(
		!literalMarkdown
			.split("\n")
			.some((line) => /^(?:<script>|```|# forged)/i.test(line)),
		"References cannot escape their code blocks",
	);
	const statuses = [
		"active",
		"rejected",
		"resolved",
		"conflicted",
		"refuted",
		"superseded",
		"reverted",
	];
	const lifecycle = {
		claims: statuses.map((status, index) => ({
			id: `s${index}`,
			type: "factual",
			content: `Evidence ${status}`,
			status,
		})),
	};
	const lifecycleSnapshot = JSON.stringify(lifecycle);
	const lifecycleMarkdown = markdown.convert(lifecycle);
	for (const status of statuses.filter((status) => status !== "active")) {
		const line = lifecycleMarkdown
			.split("\n")
			.find((line) => line.startsWith(`- **s${statuses.indexOf(status)}**`));
		assert.ok(
			line?.includes(`[status: ${status}]`),
			`Nonactive claim status must remain visible: ${status}`,
		);
	}
	assert.strictEqual(
		JSON.stringify(lifecycle),
		lifecycleSnapshot,
		"Rendering lifecycle must not change evidence",
	);
	for (const type of ["__proto__", "constructor", "toString"]) {
		const output = markdown.convert({
			claims: [{ id: "custom", type, content: "Custom source type" }],
		});
		assert.ok(
			output.includes("Custom source type"),
			`Arbitrary source type ${type} must not access object prototypes`,
		);
	}
	const { normalizeSource } = (await import("../lib/source-data.js")).default;
	const conflicts = [{ ids: ["A", "B"], reason: "different measurements" }];
	const mixed = normalizeSource({
		claims: [
			{
				id: "A",
				type: "factual",
				content: "   ",
				text: "Measured 42 units",
				status: "reverted",
				source: "interview",
				evidence: { tier: "documented", source: "transcript" },
			},
			{ id: "A", type: "factual", content: "Second account", status: "active" },
			{
				id: "B",
				type: "factual",
				content: "Other measurement",
				status: "active",
			},
		],
		conflicts: [],
		conflict_graph: conflicts,
	});
	const mixedMarkdown = markdown.convert(mixed);
	assert.deepStrictEqual(
		mixed.conflicts,
		conflicts,
		"Empty conflicts alias must not hide a populated graph",
	);
	assert.match(mixedMarkdown, /different measurements/);
	for (const expected of [
		"Measured 42 units",
		"interview",
		"transcript",
		"evidence.source",
		"[status: reverted]",
		"Second account",
		"Duplicate claim IDs",
		"ambiguous",
	]) {
		assert.ok(
			mixedMarkdown.includes(expected),
			`Markdown must preserve meaningful evidence: ${expected}`,
		);
	}
	assert.ok(
		!mixedMarkdown.includes(":    "),
		"Whitespace content must not hide the nonblank text alias",
	);
	assert.deepStrictEqual(
		JSON.parse(json.convert(mixed)).claims[0].evidence.source,
		"transcript",
	);
	for (const invalid of [
		{ conflicts: {} },
		{ conflict_graph: "bad" },
		{ conflict_graph: { unresolved: "bad" } },
	]) {
		assert.throws(
			() =>
				normalizeSource(JSON.parse(JSON.stringify({ claims: [], ...invalid }))),
			/must be an array/,
		);
	}
	const compilerGraph = {
		unresolved: [{ claimA: "A", claimB: "B", reason: "same evidence tier" }],
		resolved: [{ winner: "B", loser: "C", reason: "stronger evidence" }],
	};
	const compilerData = normalizeSource({
		resolved_claims: mixed.claims,
		conflict_graph: compilerGraph,
	});
	const compilerMarkdown = markdown.convert(compilerData);
	assert.match(compilerMarkdown, /A vs B.*same evidence tier/);
	assert.match(compilerMarkdown, /B vs C.*resolved.*stronger evidence/);
	assert.deepStrictEqual(
		compilerData.conflict_graph,
		compilerGraph,
		"Raw compiler graph must stay intact",
	);
	let passed = 0;
	let failed = 0;
	for (const file of files) {
		const modulePath = path.join(FORMATS_DIR, file);
		const formatName = file.replace(".mjs", "");
		try {
			const mod = await import(`file://${modulePath}`);
			// Check required exports
			for (const key of REQUIRED_EXPORTS) {
				assert.ok(
					key in mod,
					`Format "${formatName}" missing required export: ${key}`,
				);
			}
			// Validate export types
			assert.strictEqual(
				typeof mod.name,
				"string",
				`${formatName}.name should be a string`,
			);
			assert.ok(mod.name.length > 0, `${formatName}.name should not be empty`);
			assert.strictEqual(
				typeof mod.extension,
				"string",
				`${formatName}.extension should be a string`,
			);
			assert.ok(
				mod.extension.startsWith("."),
				`${formatName}.extension should start with "."`,
			);
			assert.strictEqual(
				typeof mod.convert,
				"function",
				`${formatName}.convert should be a function`,
			);
			// Check optional exports if present
			if (mod.mimeType) {
				assert.strictEqual(
					typeof mod.mimeType,
					"string",
					`${formatName}.mimeType should be a string`,
				);
			}
			if (mod.description) {
				assert.strictEqual(
					typeof mod.description,
					"string",
					`${formatName}.description should be a string`,
				);
			}
			console.log(
				`  PASS  ${formatName}: name="${mod.name}", ext="${mod.extension}"`,
			);
			passed++;
		} catch (caughterr) {
			const err =
				caughterr instanceof Error ? caughterr : new Error(String(caughterr));
			console.log(`  FAIL  ${formatName}: ${err.message}`);
			failed++;
			process.exitCode = 1;
		}
	}
	console.log(
		`\n${passed} passed, ${failed} failed, ${files.length} total format modules`,
	);
}
run().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
