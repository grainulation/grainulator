import assert from "node:assert/strict";
import test from "node:test";
import { checkSessionRecovery } from "../../scripts/session-recovery-check.mjs";

test("SIGINT preserves completed passes and CLI continuation never overwrites or repeats them", {
	timeout: 30000,
}, async () => {
	const report = await checkSessionRecovery();
	assert.equal(report.passed, true);
});
