import assert from "node:assert/strict";
import { test } from "node:test";
import { score, tasks } from "../../evals/semantic-tasks.mjs";
import {
	canStartCall,
	usageTotals,
} from "../../scripts/lib/evaluation-usage.mjs";

test("semantic evaluation scores ordered results and formatting independently", () => {
	const task = tasks.find((t) => t.id === "allocation-2");
	assert.deepEqual(task.expected, { accepted: ["B", "D", "E"], remaining: 1 });
	const correct = JSON.stringify(task.expected);
	assert.equal(score(task, `Reasoning\n${correct}`).semantic, true);
	assert.equal(score(task, `Reasoning\n${correct}`).format, false);
	assert.equal(
		score(task, '{"accepted":["D","B","E"],"remaining":1}').semantic,
		false,
	);
	for (const invalid of [
		"null",
		"[]",
		"{}",
		'{"accepted":["B","D","E"],"remaining":2}',
		`${correct}\n{"remaining":0}`,
	])
		assert.equal(score(task, invalid).semantic, false);
	assert.doesNotMatch(score(task, "{}").feedback, /"B"|"D"|"E"|remaining.*1/);
});
test("usage accounting includes Claude cache tokens without double-counting Codex cached input", () => {
	const codex = {
		usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10 },
		costUsd: null,
	};
	const claude = {
		usage: {
			input_tokens: 20,
			cache_read_input_tokens: 70,
			cache_creation_input_tokens: 10,
			output_tokens: 10,
		},
		costUsd: 0.1,
	};
	assert.equal(usageTotals([codex]).inputTokens, 100);
	assert.equal(usageTotals([claude]).inputTokens, 100);
	assert.equal(usageTotals([codex]).reportedCostUsd, null);
	assert.equal(canStartCall([codex], 110), false);
	assert.equal(canStartCall([codex], 111), true);
	assert.equal(canStartCall([{ usage: null }], 1000), false);
	assert.equal(canStartCall([], 1000), true);
});
