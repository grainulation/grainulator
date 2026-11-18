import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { buildReportPacket, writeReportPacket, checkReportPacket } from "../../lib/report-packet.js";
import { storePassage } from "../../packages/evidence/lib/passages.js";
import { loadClaims } from "../../packages/evidence/lib/load-claims.js";
import { addClaim } from "../../packages/evidence/lib/claims-ops.js";

const cli = fileURLToPath(new URL("../../bin/grainulator.js", import.meta.url));
function fixture(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-report-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const passage = "The experiment used 12 samples. Its small size limits generalization.";
	const passageDigest = storePassage(dir, passage);
	const source = { origin: "experiment", artifact: "results/study.json", revision: "r1", passage_sha256: passageDigest, quote: "The experiment used 12 samples." };
	const base = { type: "factual", topic: "study", content: "The study used 12 samples.", evidence: "documented", status: "active", timestamp: "2026-11-17T00:00:00Z", conflicts_with: [], resolved_by: null, tags: [] };
	const ledger = { schema_version: "1.0", meta: { question: "What does the study establish?", phase: "research" }, claims: [
		{ ...base, id: "r001", source },
		{ ...base, id: "r002", content: "The study has limited generalizability.", source: { ...source, quote: "Its small size limits generalization." } },
	] };
	const save = () => fs.writeFileSync(path.join(dir, "claims.json"), JSON.stringify(ledger, null, 2));
	save();
	return { dir, ledger, save, passageDigest };
}

test("packet is deterministic, deduplicates source identity and preserves every claim edge", (t) => {
	const { dir, ledger, save } = fixture(t);
	const first = buildReportPacket(dir);
	assert.deepEqual(first, buildReportPacket(dir));
	assert.equal(first.sources.length, 1);
	assert.equal(first.relations.length, 2);
	assert.equal(first.relations[0].source_id, first.relations[1].source_id);
	assert.notEqual(first.relations[0].quote, first.relations[1].quote);
	assert.equal(first.relations[0].semantic_support, "not_evaluated");
	assert.equal(first.gaps.length, 0);
	ledger.claims[1].source.revision = "r2"; save();
	assert.equal(buildReportPacket(dir).sources.length, 2, "different source revisions are retained");
});

test("independent check detects stale ledger, tampered packet and changed passage bytes", (t) => {
	const { dir, ledger, save, passageDigest } = fixture(t);
	writeReportPacket(dir, "output/packet.json");
	assert.equal(checkReportPacket(dir, "output/packet.json").passed, true);
	ledger.claims[0].content = "A changed claim"; save();
	assert.ok(checkReportPacket(dir, "output/packet.json").issues.some((x) => x.code === "packet_stale_or_changed"));
	writeReportPacket(dir, "output/current.json");
	const packet = JSON.parse(fs.readFileSync(path.join(dir, "output/current.json")));
	packet.claims[0].content = "A tampered claim";
	fs.writeFileSync(path.join(dir, "output/current.json"), JSON.stringify(packet));
	assert.ok(checkReportPacket(dir, "output/current.json").issues.some((x) => x.code === "packet_integrity_failed"));
	fs.writeFileSync(path.join(dir, "evidence/passages", passageDigest + ".txt"), "Changed source");
	assert.ok(buildReportPacket(dir).gaps.some((x) => x.code === "passage_hash_mismatch"));
	assert.equal(checkReportPacket(dir, "output/packet.json").passed, false);
});

test("draft references expose unknown claims and unresolved evidence without claiming semantic support", (t) => {
	const { dir, ledger, save } = fixture(t);
	delete ledger.claims[1].source; save();
	writeReportPacket(dir, "output/packet.json");
	fs.writeFileSync(path.join(dir, "output/draft.md"), "Known [[claim:r001]], unresolved [[claim:r002]], invented [[claim:r999]].");
	const checked = checkReportPacket(dir, "output/packet.json", "output/draft.md");
	assert.equal(checked.passed, false);
	assert.equal(checked.checked_references, 3);
	assert.equal(checked.semantic_support, "not_evaluated");
	assert.deepEqual(checked.issues.map((x) => x.code), ["reference_without_intact_evidence", "unknown_claim_reference"]);
	assert.ok(checked.gaps.some((x) => x.code === "source_locator_missing"));
	fs.writeFileSync(path.join(dir, "output/draft.md"), "A statement [[claim:r001]].");
	assert.equal(checkReportPacket(dir, "output/packet.json", "output/draft.md").passed, true);
	fs.writeFileSync(path.join(dir, "output/draft.md"), "An unreferenced statement.");
	assert.equal(checkReportPacket(dir, "output/packet.json", "output/draft.md").issues[0].code, "no_explicit_claim_references");
});

test("packet preserves conflicts and limitations but excludes inactive historical claims", (t) => {
	const { dir, ledger, save } = fixture(t);
	ledger.claims[0].conflicts_with = ["r002"];
	ledger.claims.push({ ...ledger.claims[0], id: "old", status: "superseded" }); save();
	const packet = buildReportPacket(dir);
	assert.deepEqual(packet.claims.map((c) => c.id), ["r001", "r002"]);
	assert.deepEqual(packet.historical_claims, [{ id: "old", status: "superseded", resolved_by: null }]);
	assert.deepEqual(packet.claims[0].conflicts_with, ["r002"]);
	assert.match(packet.passages[0].text, /limits generalization/);
});

test("empty or historical-only evidence cannot produce a report packet", (t) => {
	const { dir, ledger, save } = fixture(t);
	for (const claim of ledger.claims) claim.status = "superseded";
	save();
	assert.throws(() => writeReportPacket(dir, "output/empty.json"), /at least one active claim/);
	assert.equal(fs.existsSync(path.join(dir, "output/empty.json")), false);
});

test("outputs are exclusive, confined and cannot overwrite protected/source files", (t) => {
	const { dir, passageDigest } = fixture(t);
	const original = fs.readFileSync(path.join(dir, "claims.json"));
	for (const name of ["claims.json", "compilation.json", "AGENTS.md", "../escape.json", `.git/packet.json`, `evidence/passages/${passageDigest}.txt`])
		assert.throws(() => writeReportPacket(dir, name));
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), original);
	writeReportPacket(dir, "output/packet.json");
	const bytes = fs.readFileSync(path.join(dir, "output/packet.json"));
	assert.throws(() => writeReportPacket(dir, "output/packet.json"), /EEXIST/);
	assert.deepEqual(fs.readFileSync(path.join(dir, "output/packet.json")), bytes);
	const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-report-outside-"));
	t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
	fs.symlinkSync(elsewhere, path.join(dir, "linked"));
	assert.throws(() => writeReportPacket(dir, "linked/packet.json"), /symlinks/);
	assert.deepEqual(fs.readdirSync(elsewhere), []);
	assert.throws(() => checkReportPacket(dir, "linked/packet.json"), /symlinks/);
});

test("CLI packet/check is offline, requires explicit sprint and fails bad references", (t) => {
	const { dir } = fixture(t);
	const run = (...args) => spawnSync(process.execPath, [cli, "report", ...args], { encoding: "utf8" });
	assert.equal(run("packet", "--out", "output/no-dir.json").status, 1);
	assert.equal(run("packet", "--dir", dir, "--out", "output/packet.json").status, 0);
	fs.writeFileSync(path.join(dir, "output/draft.md"), "An invented source [[claim:unknown]].");
	const result = run("check", "--dir", dir, "--packet", "output/packet.json", "--draft", "output/draft.md", "--json");
	assert.equal(result.status, 2, result.stderr);
	assert.equal(JSON.parse(result.stdout).issues[0].code, "unknown_claim_reference");
	assert.match(run("--help").stdout, /semantic support/);
});

test("missing and unquoted passages stay explicit gaps; symlinked ledgers are rejected", (t) => {
	const { dir, ledger, save, passageDigest } = fixture(t);
	ledger.claims[0].source.quote = "A quotation that is not in the passage."; save();
	assert.ok(buildReportPacket(dir).gaps.some((x) => x.code === "quote_absent"));
	fs.unlinkSync(path.join(dir, "evidence/passages", passageDigest + ".txt"));
	assert.ok(buildReportPacket(dir).gaps.some((x) => x.code === "passage_missing"));
	fs.renameSync(path.join(dir, "claims.json"), path.join(dir, "actual.json"));
	fs.symlinkSync("actual.json", path.join(dir, "claims.json"));
	assert.throws(() => buildReportPacket(dir), /symlink/);
});

test("normal challenge findings share source identity and retain their distinct challenge targets", (t) => {
	const { dir, ledger } = fixture(t);
	for (const [id, target] of [["x001", "r001"], ["x002", "r002"]]) {
		const result = addClaim(dir, { id, type: "feedback", topic: "challenge", content: `Challenge ${target}`,
			evidence: "documented", source: { ...ledger.claims[0].source, challenged_claim: target, relationship: "contradicts" } });
		assert.equal(result.status, "ok", result.message);
	}
	const packet = buildReportPacket(dir);
	const challenges = packet.relations.filter((relation) => relation.claim_id.startsWith("x"));
	assert.equal(challenges.length, 2);
	assert.equal(challenges[0].source_id, challenges[1].source_id);
	assert.deepEqual(challenges.map((relation) => relation.challenged_claim), ["r001", "r002"]);
	assert.deepEqual(challenges.map((relation) => relation.recorded_relationship), ["contradicts", "contradicts"]);
	assert.equal(packet.sources.find((source) => source.id === challenges[0].source_id).metadata.challenged_claim, undefined);
});

test("different corrupt passage bytes invalidate a frozen observation while evidence remains unresolved", (t) => {
	const { dir, passageDigest } = fixture(t);
	const passageFile = path.join(dir, "evidence/passages", passageDigest + ".txt");
	fs.writeFileSync(passageFile, "Corrupt version one");
	writeReportPacket(dir, "output/corrupt.json");
	const frozen = JSON.parse(fs.readFileSync(path.join(dir, "output/corrupt.json")));
	assert.equal(frozen.passages[0].observed_sha256, createHash("sha256").update("Corrupt version one").digest("hex"));
	assert.equal(frozen.passages[0].integrity, "hash_mismatch");
	assert.equal(checkReportPacket(dir, "output/corrupt.json").passed, true, "same observed corruption remains a consistent unresolved snapshot");
	fs.writeFileSync(path.join(dir, "output/draft.md"), "A claim [[claim:r001]].");
	assert.ok(checkReportPacket(dir, "output/corrupt.json", "output/draft.md").issues.some((issue) => issue.code === "reference_without_intact_evidence"));
	fs.writeFileSync(passageFile, "Different corrupt bytes");
	const checked = checkReportPacket(dir, "output/corrupt.json", "output/draft.md");
	assert.equal(checked.passed, false);
	assert.ok(checked.issues.some((issue) => issue.code === "packet_stale_or_changed"));
	assert.ok(checked.issues.some((issue) => issue.code === "reference_without_intact_evidence"));
	assert.ok(checked.gaps.some((gap) => gap.code === "passage_hash_mismatch"));
});

test("ledger digest pins bounded disk bytes independently of BOM decoding and never rewrites the ledger", (t) => {
	const { dir } = fixture(t);
	const ledgerFile = path.join(dir, "claims.json");
	const original = fs.readFileSync(ledgerFile);
	writeReportPacket(dir, "output/plain.json");
	const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]);
	fs.writeFileSync(ledgerFile, withBom);
	const loaded = loadClaims(dir, { maxBytes: 1024 * 1024 });
	assert.equal(loaded.errors.length, 0);
	assert.deepEqual(loaded.raw_bytes, withBom);
	assert.equal(loaded.raw, original.toString("utf8"));
	const packet = buildReportPacket(dir);
	assert.equal(packet.ledger_sha256, createHash("sha256").update(withBom).digest("hex"));
	assert.notEqual(packet.ledger_sha256, createHash("sha256").update(original).digest("hex"));
	assert.deepEqual(fs.readFileSync(ledgerFile), withBom, "bounded reads must not strip the BOM on disk");
	assert.ok(checkReportPacket(dir, "output/plain.json").issues.some((issue) => issue.code === "packet_stale_or_changed"));
	writeReportPacket(dir, "output/bom.json");
	assert.equal(checkReportPacket(dir, "output/bom.json").passed, true);
	fs.writeFileSync(ledgerFile, original);
	assert.ok(checkReportPacket(dir, "output/bom.json").issues.some((issue) => issue.code === "packet_stale_or_changed"));
	assert.deepEqual(fs.readFileSync(ledgerFile), original);
});
