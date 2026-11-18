import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
	buildReportPacket,
	checkReportPacket,
	verifyReportSemantics,
	attestReportPacket,
	verifyReportAttestation,
} from "../../lib/report-packet.js";

const exampleDir = fileURLToPath(new URL("../../examples/grounded-report-sprint", import.meta.url));

test("grounded-report-sprint example builds and satisfies strict grounding checks", () => {
	assert.ok(fs.existsSync(path.join(exampleDir, "claims.json")));
	assert.ok(fs.existsSync(path.join(exampleDir, "draft.md")));

	// 1. Build packet
	const packet = buildReportPacket(exampleDir);
	assert.equal(packet.schema, "grainulator.report-packet/v1");
	assert.equal(packet.claims.length, 4);
	assert.equal(packet.passages.length, 2);
	assert.equal(packet.relations.length, 4);
	assert.equal(packet.gaps.length, 0);

	// Verify all passages are intact
	for (const p of packet.passages) {
		assert.equal(p.integrity, "intact");
	}

	// 2. Verify strict check on draft.md
	const check = checkReportPacket(exampleDir, "output/packet.json", "draft.md", {
		strict: true,
		semanticFile: "output/semantic-eval.json",
	});
	assert.equal(check.passed, true);
	assert.equal(check.checked_references, 4);
	assert.equal(check.issues.length, 0);
	assert.equal(check.warnings.length, 0);
	assert.equal(check.semantic_support, "sidecar_evaluated");

	// 3. Verify DSSE attestation against public key
	const pubKeyPem = fs.readFileSync(path.join(exampleDir, "keys", "ed25519_public.pem"), "utf8");
	const attCheck = verifyReportAttestation(exampleDir, "output/packet.dsse.json", {
		publicKeyPem: pubKeyPem,
	});
	assert.equal(attCheck.passed, true);
	assert.equal(attCheck.signed, true);
	assert.equal(attCheck.signature_verified, true);
	assert.equal(attCheck.issues.length, 0);
	assert.deepEqual(attCheck.subjects_verified, ["output/packet.json", "draft.md"]);
});
