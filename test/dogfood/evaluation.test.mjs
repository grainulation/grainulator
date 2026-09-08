import assert from "node:assert/strict";
import { test } from "node:test";
import { score, semanticScore, tasks } from "../../evals/tasks.mjs";

test("primary scoring distinguishes format failures from the post-hoc semantic diagnostic", () => {
	const task = tasks[0],
		correct = JSON.stringify(task.expected);
	assert.equal(score(task, correct).passed, true);
	assert.equal(score(task, `Explanation\n${correct}`).passed, false);
	assert.equal(semanticScore(task, `Explanation\n${correct}`).passed, true);
	for (const answer of [
		"null",
		"[]",
		"{}",
		'{"ids":["B"]}',
		`${correct}\n{"ids":["B"]}`,
	]) {
		assert.equal(score(task, answer).passed, false);
		assert.equal(semanticScore(task, answer).passed, false);
	}
});
