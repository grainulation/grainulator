#!/usr/bin/env node
// Generated from typescript/examples/grounded-report-sprint/build.mts; edit that source and run npm run build:types.
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	attestReportPacket,
	buildReportPacket,
	checkReportPacket,
	verifyReportAttestation,
	verifyReportSemantics,
	writeReportPacket,
} from "../../lib/report-packet.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(here, "keys");
const outDir = path.join(here, "output");
fs.mkdirSync(keysDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
// 1. Manage Ed25519 signing keys
const privKeyPath = path.join(keysDir, "ed25519_private.pem");
const pubKeyPath = path.join(keysDir, "ed25519_public.pem");
let privKeyPem;
let pubKeyPem;
try {
	privKeyPem = fs.readFileSync(privKeyPath, "utf8");
	pubKeyPem = fs.readFileSync(pubKeyPath, "utf8");
} catch {
	const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
		publicKeyEncoding: { type: "spki", format: "pem" },
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
	});
	privKeyPem = privateKey;
	pubKeyPem = publicKey;
	fs.writeFileSync(privKeyPath, privKeyPem, { mode: 0o600 });
	fs.writeFileSync(pubKeyPath, pubKeyPem, { mode: 0o644 });
	console.log("Generated fresh Ed25519 keypair in keys/");
}
// Clean old outputs because writeConfinedJSON refuses to overwrite
for (const f of ["packet.json", "semantic-eval.json", "packet.dsse.json"]) {
	fs.rmSync(path.join(outDir, f), { force: true });
}
// 2. Build and write canonical report packet
const packetPath = "output/packet.json";
const writtenPacket = writeReportPacket(here, packetPath);
console.log(
	`Wrote canonical packet: ${writtenPacket.path} (SHA: ${writtenPacket.packet_sha256.slice(0, 16)}...)`,
);
// 3. Sidecar semantic evaluation
const semPath = "output/semantic-eval.json";
const sem = await verifyReportSemantics(here, packetPath, semPath);
console.log(
	`Wrote semantic sidecar: ${sem.path} (Evaluations: ${sem.summary.total}, Supported: ${sem.summary.supported})`,
);
// 4. DSSE in-toto Statement v1 Attestation
const dssePath = "output/packet.dsse.json";
const attestation = attestReportPacket(here, packetPath, dssePath, {
	privateKeyPem: privKeyPem,
	draftFile: "draft.md",
});
console.log(`Wrote DSSE attestation: ${attestation.path}`);
// 5. Verify attestation independently with public key
const attCheck = verifyReportAttestation(here, dssePath, {
	publicKeyPem: pubKeyPem,
});
if (!attCheck.passed || !attCheck.signature_verified) {
	console.error("Attestation verification failed:", attCheck);
	process.exit(1);
}
console.log("Attestation signature verified successfully against public key.");
// 6. Strict check including Grounding Guard and semantic evaluation
const check = checkReportPacket(here, packetPath, "draft.md", {
	strict: true,
	semanticFile: semPath,
});
if (!check.passed) {
	console.error("Strict report check failed:", check);
	process.exit(1);
}
console.log(
	`Strict check passed! (Claims cited: ${check.checked_references}, Warnings: ${check.warnings.length}, Issues: 0)`,
);
