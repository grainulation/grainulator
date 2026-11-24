import assert from "node:assert/strict";
import test from "node:test";
import { withStructuredResult } from "../../lib/mcp-contracts.js";
import { claimsDocument, readLedger } from "../../lib/research/evidence.js";

test("checked research boundary rejects malformed external JSON and keeps model claims stated", () => {
	for (const claims of [null, 1, [], {}, { claims: null }])
		assert.throws(() => readLedger(JSON.stringify(claims)), /1–24 claims/);
	const claim = {
		id: "r001",
		type: "factual",
		topic: "boundary",
		content: "Recorded by a model",
		sources: ["https://example.com/source", "file:///etc/passwd", {}],
		conflicts_with: [],
	};
	assert.throws(
		() =>
			readLedger(
				JSON.stringify({ claims: [{ ...claim, conflicts_with: [1] }] }),
			),
		/source and conflict lists/,
	);
	const document = claimsDocument({
		question: "What is supported?",
		config: { provider: "openai" },
		steps: [{ pass: "ledger", text: JSON.stringify({ claims: [claim] }) }],
	});
	assert.equal(document.claims[0].evidence, "stated");
	assert.deepEqual(document.claims[0].source.urls, [
		"https://example.com/source",
	]);
	assert.deepEqual(document.claims[0].tags, ["needs-verification"]);
});

test("checked MCP boundary rejects malformed content before advertising structured results", () => {
	for (const content of [
		{},
		[{ type: "text", text: 1 }],
		[{ type: "text", text: "[]" }],
	])
		assert.throws(
			() => withStructuredResult(JSON.stringify({ result: { content } })),
			/Expected (?:one JSON|an object) tool result/,
		);
	const error = JSON.stringify({
		error: { code: -32602, message: "Invalid params" },
	});
	assert.equal(withStructuredResult(error), error);
});
