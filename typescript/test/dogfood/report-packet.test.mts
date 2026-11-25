import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	attestReportPacket,
	buildReportPacket,
	checkReportPacket,
	checkSourceProvenance,
	checkUncitedFactualAssertions,
	compareReportDrafts,
	normalizeSourceIdentifiers,
	verifyReportAttestation,
	verifyReportSemantics,
	writeReportPacket,
} from "../../lib/report-packet.js";
import { addClaim } from "../../packages/evidence/lib/claims-ops.js";
import { loadClaims } from "../../packages/evidence/lib/load-claims.js";
import { storePassage } from "../../packages/evidence/lib/passages.js";

const cli = fileURLToPath(new URL("../../bin/grainulator.js", import.meta.url));
interface FixtureSource {
	origin: string;
	artifact?: string;
	revision?: string;
	passage_sha256: string;
	quote: string;
	source_role?: "primary_evidence" | "secondary_citation";
	challenged_claim?: string;
	witnessed_claim?: string;
	relationship?: "contradicts" | "full_support";
	title?: string;
	doi?: string;
	aliases?: string[];
	venue?: string;
	url?: string;
}

interface FixtureClaim {
	id: string;
	type: "factual" | "risk" | "constraint" | "feedback";
	topic: string;
	content: string;
	evidence: "documented" | "tested" | "web";
	status: "active" | "superseded";
	timestamp: string;
	conflicts_with: string[];
	resolved_by: null;
	tags: string[];
	source?: FixtureSource;
}

function fixture(t: TestContext) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-report-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const passage =
		"The experiment used 12 samples. Its small size limits generalization.";
	const passageDigest = storePassage(dir, passage);
	const source = {
		origin: "experiment",
		artifact: "results/study.json",
		revision: "r1",
		passage_sha256: passageDigest,
		quote: "The experiment used 12 samples.",
	};
	const base: Omit<FixtureClaim, "id" | "source"> = {
		type: "factual",
		topic: "study",
		content: "The study used 12 samples.",
		evidence: "documented",
		status: "active",
		timestamp: "2026-11-17T00:00:00Z",
		conflicts_with: [],
		resolved_by: null,
		tags: [],
	};
	const ledger: {
		schema_version: "1.0";
		meta: { question: string; phase: string };
		claims: FixtureClaim[];
	} = {
		schema_version: "1.0",
		meta: { question: "What does the study establish?", phase: "research" },
		claims: [
			{ ...base, id: "r001", source },
			{
				...base,
				id: "r002",
				content: "The study has limited generalizability.",
				source: { ...source, quote: "Its small size limits generalization." },
			},
		],
	};
	const save = () =>
		fs.writeFileSync(
			path.join(dir, "claims.json"),
			JSON.stringify(ledger, null, 2),
		);
	save();
	return { dir, ledger, save, passageDigest };
}

test("packet is deterministic, deduplicates source identity and preserves every claim edge", (t) => {
	const { dir, ledger, save } = fixture(t);
	const first = buildReportPacket(dir);
	assert.deepEqual(first, buildReportPacket(dir));
	assert.equal(first.sources.length, 1);
	assert.equal(first.relations.length, 2);
	assert.equal(first.relations[0]!.source_id, first.relations[1]!.source_id);
	assert.notEqual(first.relations[0]!.quote, first.relations[1]!.quote);
	assert.equal(first.relations[0]!.semantic_support, "not_evaluated");
	assert.equal(first.gaps.length, 0);
	ledger.claims[1]!.source!.revision = "r2";
	save();
	assert.equal(
		buildReportPacket(dir).sources.length,
		2,
		"different source revisions are retained",
	);
});

test("independent check detects stale ledger, tampered packet and changed passage bytes", (t) => {
	const { dir, ledger, save, passageDigest } = fixture(t);
	writeReportPacket(dir, "output/packet.json");
	assert.equal(checkReportPacket(dir, "output/packet.json").passed, true);
	ledger.claims[0]!.content = "A changed claim";
	save();
	assert.ok(
		checkReportPacket(dir, "output/packet.json").issues.some(
			(x) => x.code === "packet_stale_or_changed",
		),
	);
	writeReportPacket(dir, "output/current.json");
	const packet: { claims: { content: string }[] } = JSON.parse(
		fs.readFileSync(path.join(dir, "output/current.json"), "utf8"),
	);
	packet.claims[0]!.content = "A tampered claim";
	fs.writeFileSync(
		path.join(dir, "output/current.json"),
		JSON.stringify(packet),
	);
	assert.ok(
		checkReportPacket(dir, "output/current.json").issues.some(
			(x) => x.code === "packet_integrity_failed",
		),
	);
	fs.writeFileSync(
		path.join(dir, "evidence/passages", `${passageDigest}.txt`),
		"Changed source",
	);
	assert.ok(
		buildReportPacket(dir).gaps.some((x) => x.code === "passage_hash_mismatch"),
	);
	assert.equal(checkReportPacket(dir, "output/packet.json").passed, false);
});

test("draft references expose unknown claims and unresolved evidence without claiming semantic support", (t) => {
	const { dir, ledger, save } = fixture(t);
	delete ledger.claims[1]!.source;
	save();
	writeReportPacket(dir, "output/packet.json");
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"Known [[claim:r001]], unresolved [[claim:r002]], invented [[claim:r999]].",
	);
	const checked = checkReportPacket(
		dir,
		"output/packet.json",
		"output/draft.md",
	);
	assert.equal(checked.passed, false);
	assert.equal(checked.checked_references, 3);
	assert.equal(checked.semantic_support, "not_evaluated");
	assert.deepEqual(
		checked.issues.map((x) => x.code),
		["reference_without_intact_evidence", "unknown_claim_reference"],
	);
	assert.ok(checked.gaps.some((x) => x.code === "source_locator_missing"));
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"A statement [[claim:r001]].",
	);
	assert.equal(
		checkReportPacket(dir, "output/packet.json", "output/draft.md").passed,
		true,
	);
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"An unreferenced statement.",
	);
	assert.equal(
		checkReportPacket(dir, "output/packet.json", "output/draft.md").issues[0]!
			.code,
		"no_explicit_claim_references",
	);
});

test("packet preserves conflicts and limitations but excludes inactive historical claims", (t) => {
	const { dir, ledger, save } = fixture(t);
	ledger.claims[0]!.conflicts_with = ["r002"];
	ledger.claims.push({ ...ledger.claims[0]!, id: "old", status: "superseded" });
	save();
	const packet = buildReportPacket(dir);
	assert.deepEqual(
		packet.claims.map((c: { id: string }) => c.id),
		["r001", "r002"],
	);
	assert.deepEqual(packet.historical_claims, [
		{ id: "old", status: "superseded", resolved_by: null },
	]);
	assert.deepEqual(packet.claims[0]!.conflicts_with, ["r002"]);
	assert.match(packet.passages[0]!.text!, /limits generalization/);
});

test("empty or historical-only evidence cannot produce a report packet", (t) => {
	const { dir, ledger, save } = fixture(t);
	for (const claim of ledger.claims) claim.status = "superseded";
	save();
	assert.throws(
		() => writeReportPacket(dir, "output/empty.json"),
		/at least one active claim/,
	);
	assert.equal(fs.existsSync(path.join(dir, "output/empty.json")), false);
});

test("outputs are exclusive, confined and cannot overwrite protected/source files", (t) => {
	const { dir, passageDigest } = fixture(t);
	const original = fs.readFileSync(path.join(dir, "claims.json"));
	for (const name of [
		"claims.json",
		"compilation.json",
		"AGENTS.md",
		"../escape.json",
		`.git/packet.json`,
		`evidence/passages/${passageDigest}.txt`,
	])
		assert.throws(() => writeReportPacket(dir, name));
	assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), original);
	writeReportPacket(dir, "output/packet.json");
	const bytes = fs.readFileSync(path.join(dir, "output/packet.json"));
	assert.throws(() => writeReportPacket(dir, "output/packet.json"), /EEXIST/);
	assert.deepEqual(
		fs.readFileSync(path.join(dir, "output/packet.json")),
		bytes,
	);
	const elsewhere = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-report-outside-"),
	);
	t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
	fs.symlinkSync(elsewhere, path.join(dir, "linked"));
	assert.throws(() => writeReportPacket(dir, "linked/packet.json"), /symlinks/);
	assert.deepEqual(fs.readdirSync(elsewhere), []);
	assert.throws(() => checkReportPacket(dir, "linked/packet.json"), /symlinks/);
});

test("CLI packet/check is offline, requires explicit sprint and fails bad references", (t) => {
	const { dir } = fixture(t);
	const run = (...args: string[]) =>
		spawnSync(process.execPath, [cli, "report", ...args], { encoding: "utf8" });
	assert.equal(run("packet", "--out", "output/no-dir.json").status, 1);
	assert.equal(
		run("packet", "--dir", dir, "--out", "output/packet.json").status,
		0,
	);
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"An invented source [[claim:unknown]].",
	);
	const result = run(
		"check",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--draft",
		"output/draft.md",
		"--json",
	);
	assert.equal(result.status, 2, result.stderr);
	assert.equal(
		JSON.parse(result.stdout).issues[0].code,
		"unknown_claim_reference",
	);
	assert.match(run("--help").stdout, /semantic support/);
});

test("missing and unquoted passages stay explicit gaps; symlinked ledgers are rejected", (t) => {
	const { dir, ledger, save, passageDigest } = fixture(t);
	ledger.claims[0]!.source!.quote = "A quotation that is not in the passage.";
	save();
	assert.ok(buildReportPacket(dir).gaps.some((x) => x.code === "quote_absent"));
	fs.unlinkSync(path.join(dir, "evidence/passages", `${passageDigest}.txt`));
	assert.ok(
		buildReportPacket(dir).gaps.some((x) => x.code === "passage_missing"),
	);
	fs.renameSync(path.join(dir, "claims.json"), path.join(dir, "actual.json"));
	fs.symlinkSync("actual.json", path.join(dir, "claims.json"));
	assert.throws(() => buildReportPacket(dir), /symlink/);
});

test("normal challenge findings share source identity and retain their distinct challenge targets", (t) => {
	const { dir, ledger } = fixture(t);
	for (const [id, target] of [
		["x001", "r001"],
		["x002", "r002"],
	] as const) {
		const result = addClaim(dir, {
			id,
			type: "feedback",
			topic: "challenge",
			content: `Challenge ${target}`,
			evidence: "documented",
			source: {
				...ledger.claims[0]!.source!,
				challenged_claim: target,
				relationship: "contradicts",
			},
		});
		assert.equal(result.status, "ok", result.message);
	}
	const packet = buildReportPacket(dir);
	const challenges = packet.relations.filter((relation) =>
		relation.claim_id.startsWith("x"),
	);
	assert.equal(challenges.length, 2);
	assert.equal(challenges[0]!.source_id, challenges[1]!.source_id);
	assert.deepEqual(
		challenges.map((relation) => relation.challenged_claim),
		["r001", "r002"],
	);
	assert.deepEqual(
		challenges.map((relation) => relation.recorded_relationship),
		["contradicts", "contradicts"],
	);
	assert.equal(
		packet.sources.find((source) => source.id === challenges[0]!.source_id)!
			.metadata.challenged_claim,
		undefined,
	);
});

test("different corrupt passage bytes invalidate a frozen observation while evidence remains unresolved", (t) => {
	const { dir, passageDigest } = fixture(t);
	const passageFile = path.join(
		dir,
		"evidence/passages",
		`${passageDigest}.txt`,
	);
	fs.writeFileSync(passageFile, "Corrupt version one");
	writeReportPacket(dir, "output/corrupt.json");
	const frozen: { passages: { observed_sha256: string; integrity: string }[] } =
		JSON.parse(fs.readFileSync(path.join(dir, "output/corrupt.json"), "utf8"));
	assert.equal(
		frozen.passages[0]!.observed_sha256,
		createHash("sha256").update("Corrupt version one").digest("hex"),
	);
	assert.equal(frozen.passages[0]!.integrity, "hash_mismatch");
	assert.equal(
		checkReportPacket(dir, "output/corrupt.json").passed,
		true,
		"same observed corruption remains a consistent unresolved snapshot",
	);
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"A claim [[claim:r001]].",
	);
	assert.ok(
		checkReportPacket(
			dir,
			"output/corrupt.json",
			"output/draft.md",
		).issues.some(
			(issue) => issue.code === "reference_without_intact_evidence",
		),
	);
	fs.writeFileSync(passageFile, "Different corrupt bytes");
	const checked = checkReportPacket(
		dir,
		"output/corrupt.json",
		"output/draft.md",
	);
	assert.equal(checked.passed, false);
	assert.ok(
		checked.issues.some((issue) => issue.code === "packet_stale_or_changed"),
	);
	assert.ok(
		checked.issues.some(
			(issue) => issue.code === "reference_without_intact_evidence",
		),
	);
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
	assert.ok("raw_bytes" in loaded && "raw" in loaded);
	assert.deepEqual(loaded.raw_bytes, withBom);
	assert.equal(loaded.raw, original.toString("utf8"));
	const packet = buildReportPacket(dir);
	assert.equal(
		packet.ledger_sha256,
		createHash("sha256").update(withBom).digest("hex"),
	);
	assert.notEqual(
		packet.ledger_sha256,
		createHash("sha256").update(original).digest("hex"),
	);
	assert.deepEqual(
		fs.readFileSync(ledgerFile),
		withBom,
		"bounded reads must not strip the BOM on disk",
	);
	assert.ok(
		checkReportPacket(dir, "output/plain.json").issues.some(
			(issue) => issue.code === "packet_stale_or_changed",
		),
	);
	writeReportPacket(dir, "output/bom.json");
	assert.equal(checkReportPacket(dir, "output/bom.json").passed, true);
	fs.writeFileSync(ledgerFile, original);
	assert.ok(
		checkReportPacket(dir, "output/bom.json").issues.some(
			(issue) => issue.code === "packet_stale_or_changed",
		),
	);
	assert.deepEqual(fs.readFileSync(ledgerFile), original);
});

test("CLI add supports --challenged-claim and --source-role while preserving shared source identity", (t) => {
	const { dir, passageDigest } = fixture(t);
	const add = (...args: string[]) =>
		spawnSync(process.execPath, [cli, "add", "--dir", dir, ...args], {
			encoding: "utf8",
		});

	const challengeRes = add(
		"--id",
		"x010",
		"--type",
		"feedback",
		"--topic",
		"study",
		"--content",
		"Small sample size challenges generalizability.",
		"--evidence",
		"documented",
		"--source-origin",
		"experiment",
		"--source-artifact",
		"results/study.json",
		"--challenged-claim",
		"r001",
		"--relationship",
		"contradicts",
		"--source-role",
		"primary_evidence",
		"--passage-sha256",
		passageDigest,
		"--quote",
		"Its small size limits generalization.",
		"--json",
	);
	assert.equal(challengeRes.status, 0, challengeRes.stderr);
	const parsed = JSON.parse(challengeRes.stdout);
	assert.equal(parsed.status, "ok");
	assert.equal(parsed.claim.source.challenged_claim, "r001");
	assert.equal(parsed.claim.source.relationship, "contradicts");
	assert.equal(parsed.claim.source.source_role, "primary_evidence");

	const invalidRole = add(
		"--id",
		"x011",
		"--type",
		"factual",
		"--topic",
		"study",
		"--content",
		"Invalid source role must fail.",
		"--source-origin",
		"experiment",
		"--source-role",
		"invented_role",
		"--json",
	);
	assert.equal(invalidRole.status, 1);
	assert.match(JSON.parse(invalidRole.stdout).message, /source\.source_role/);

	const packet = buildReportPacket(dir);
	const rel = packet.relations.find((r) => r.claim_id === "x010")!;
	assert.equal(rel.challenged_claim, "r001");
	assert.equal(rel.recorded_relationship, "contradicts");
	assert.equal(rel.source_role, "primary_evidence");
	assert.equal(
		packet.sources.find((s) => s.id === rel.source_id)!.metadata.source_role,
		undefined,
	);
});

test("grounding guard passes clean draft in strict mode and flags omitted risks, constraints, challenges, and conflicts", (t) => {
	const { dir, ledger, save } = fixture(t);
	const baseSource = ledger.claims[0]!.source!;
	ledger.claims[1]!.type = "risk";
	ledger.claims.push(
		{
			...ledger.claims[0]!,
			id: "r003",
			type: "constraint",
			content: "Study is constrained to 12 samples.",
			source: { ...baseSource, source_role: "primary_evidence" },
		},
		{
			...ledger.claims[0]!,
			id: "x001",
			type: "feedback",
			content: "Small sample size contradicts broad generalization.",
			source: {
				...baseSource,
				quote: "Its small size limits generalization.",
				challenged_claim: "r001",
				relationship: "contradicts",
				source_role: "primary_evidence",
			},
		},
		{
			...ledger.claims[0]!,
			id: "r004",
			type: "factual",
			content: "Alternative interpretation conflicts with r001.",
			conflicts_with: ["r001"],
		},
		{
			...ledger.claims[1]!,
			id: "old_risk",
			type: "risk",
			status: "superseded",
		},
	);
	ledger.claims[0]!.conflicts_with = ["r004"];
	save();
	writeReportPacket(dir, "output/packet.json");

	const cleanDraft = [
		"# Evaluation Summary (2026-11-17, 12 samples)",
		"",
		"The experiment used 12 samples [[claim:r001]], though an alternative interpretation conflicts with this [[claim:r004]] and small sample size challenges broad claims [[claim:x001]].",
		"",
		"## Limitations",
		"- Generalizability is limited [[claim:r002]].",
		"- The protocol is constrained to 12 samples [[claim:r003]].",
		"",
		"```sh",
		"# Ignored code fence: 99% benchmarks show 2026-11-17 improvement",
		"echo 100ms",
		"```",
		"",
		"Inline code like `85%` and links [the study](https://example.com/2026-11-17) remain quiet.",
	].join("\n");
	fs.writeFileSync(path.join(dir, "output/clean.md"), cleanDraft);

	const cleanCheck = checkReportPacket(
		dir,
		"output/packet.json",
		"output/clean.md",
		{ strict: true },
	);
	assert.equal(cleanCheck.passed, true, JSON.stringify(cleanCheck, null, 2));
	assert.equal(cleanCheck.warnings.length, 0);
	assert.equal(cleanCheck.issues.length, 0);

	fs.writeFileSync(
		path.join(dir, "output/partial.md"),
		"The experiment used 12 samples [[claim:r001]].\n",
	);
	const defaultCheck = checkReportPacket(
		dir,
		"output/packet.json",
		"output/partial.md",
	);
	assert.equal(
		defaultCheck.passed,
		true,
		"warnings do not break default structural check",
	);
	assert.equal(defaultCheck.issues.length, 0);
	const omittedIds = new Set(
		defaultCheck.warnings
			.filter((w) => w.code === "omitted_active_risk_or_conflict")
			.map((w) => (w as { claim_id?: string }).claim_id),
	);
	assert.deepEqual(omittedIds, new Set(["r002", "r003", "x001", "r004"]));
	assert.equal(omittedIds.has("old_risk"), false);

	const strictCheck = checkReportPacket(
		dir,
		"output/packet.json",
		"output/partial.md",
		{ strict: true },
	);
	assert.equal(strictCheck.passed, false);
	assert.equal(strictCheck.strict, true);
	assert.deepEqual(strictCheck.issues, strictCheck.warnings);
});

test("uncited factual assertion pre-check catches check-worthy prose while skipping headings, code, URLs, and cited sentences", () => {
	const draft = [
		"# 2026 Benchmarks Show 99% Gains",
		"",
		"| Metric | Value |",
		"| --- | --- |",
		"",
		"Our pipeline outperforms baselines and reduces latency by 42%.",
		"Measurements confirm this held on 2026-11-17 across 50 runs.",
		"The system uses `99%` memory efficiency, e.g. via streaming buffers at https://example.com/2026-11-17.",
		"Properly grounded claim achieved 94.2% working links. [[claim:r001]]",
		"- List item without citation proved 3x faster throughput.",
		"",
		"~~~python",
		"benchmarks_show = '100% pass in 2026'",
		"~~~",
	].join("\n");

	const issues = checkUncitedFactualAssertions(draft);
	assert.equal(issues.length, 3, JSON.stringify(issues, null, 2));
	assert.equal(issues[0]!.code, "uncited_checkworthy_sentence");
	assert.equal(issues[0]!.line, 6);
	assert.ok(issues[0]!.signals.includes("quantitative"));
	assert.ok(issues[0]!.signals.includes("empirical_claim_verb"));
	assert.equal(issues[1]!.line, 7);
	assert.ok(issues[1]!.signals.includes("temporal_or_date"));
	assert.equal(issues[2]!.line, 10);
});

test("source provenance check flags secondary_citation on documented/tested claims unless corroborated by primary witness", (t) => {
	const { dir, ledger, save, passageDigest } = fixture(t);
	const secondaryPassage =
		"As reviewed in Smith et al., the experiment used 12 samples.";
	const secondaryDigest = storePassage(dir, secondaryPassage);

	ledger.claims.push(
		{
			...ledger.claims[0]!,
			id: "r010",
			evidence: "documented",
			content: "Secondary review claims 12 samples.",
			source: {
				origin: "review",
				artifact: "papers/survey.pdf",
				revision: "v1",
				passage_sha256: secondaryDigest,
				quote: secondaryPassage,
				source_role: "secondary_citation",
			},
		},
		{
			...ledger.claims[0]!,
			id: "r011",
			evidence: "tested",
			content: "Tested claim backed by secondary review AND primary witness.",
			source: {
				origin: "review",
				artifact: "papers/survey.pdf",
				revision: "v1",
				passage_sha256: secondaryDigest,
				quote: secondaryPassage,
				source_role: "secondary_citation",
			},
		},
		{
			...ledger.claims[0]!,
			id: "w011",
			evidence: "tested",
			content: "Primary witness for r011.",
			source: {
				...ledger.claims[0]!.source!,
				passage_sha256: passageDigest,
				witnessed_claim: "r011",
				relationship: "full_support",
				source_role: "primary_evidence",
			},
		},
		{
			...ledger.claims[0]!,
			id: "r012",
			evidence: "web",
			content:
				"Web-tier secondary citation is allowed without strong-tier warning.",
			source: {
				origin: "blog",
				artifact: "https://example.com/post",
				passage_sha256: secondaryDigest,
				quote: secondaryPassage,
				source_role: "secondary_citation",
			},
		},
	);
	save();
	writeReportPacket(dir, "output/packet.json");

	const packet = buildReportPacket(dir);
	const provenanceWarnings = checkSourceProvenance(packet);
	assert.equal(
		provenanceWarnings.length,
		1,
		JSON.stringify(provenanceWarnings, null, 2),
	);
	assert.equal(
		provenanceWarnings[0]!.code,
		"secondary_citation_for_strong_tier",
	);
	assert.equal(provenanceWarnings[0]!.claim_id, "r010");

	const run = (...args: string[]) =>
		spawnSync(process.execPath, [cli, "report", ...args], { encoding: "utf8" });
	const nonStrict = run(
		"check",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--json",
	);
	assert.equal(nonStrict.status, 0, nonStrict.stderr);
	const nonStrictParsed = JSON.parse(nonStrict.stdout);
	assert.equal(nonStrictParsed.passed, true);
	assert.equal(nonStrictParsed.warnings.length, 1);
	assert.equal(
		nonStrictParsed.warnings[0].code,
		"secondary_citation_for_strong_tier",
	);

	const strictRun = run(
		"check",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--strict",
		"--json",
	);
	assert.equal(strictRun.status, 2, strictRun.stderr);
	const strictParsed = JSON.parse(strictRun.stdout);
	assert.equal(strictParsed.passed, false);
	assert.equal(strictParsed.strict, true);
	assert.equal(
		strictParsed.issues[0].code,
		"secondary_citation_for_strong_tier",
	);
});

test("canonical DOI/arXiv normalization and source aliases merge matching sources while preserving pinned versions", (t) => {
	const { dir, ledger, save, passageDigest } = fixture(t);
	const normDoiUrl = normalizeSourceIdentifiers({
		origin: "web",
		artifact: "https://doi.org/10.1234/ABC.5",
	});
	assert.deepEqual(normDoiUrl.canonicalIds, ["doi:10.1234/abc.5"]);
	const normArxiv = normalizeSourceIdentifiers({
		origin: "preprint",
		url: "https://arxiv.org/abs/2502.10855v2",
	});
	assert.deepEqual(normArxiv.canonicalIds, ["arxiv:2502.10855"]);
	const normPinned = normalizeSourceIdentifiers({
		origin: "preprint",
		url: "https://arxiv.org/abs/2502.10855v2",
		revision: "v2",
	});
	assert.deepEqual(normPinned.canonicalIds, ["arxiv:2502.10855v2"]);

	ledger.claims = [
		{
			...ledger.claims[0]!,
			id: "c001",
			source: {
				origin: "journal",
				artifact: "https://doi.org/10.1234/ABC.5",
				title: "Canonical Paper",
				passage_sha256: passageDigest,
				quote: "The experiment used 12 samples.",
			},
		},
		{
			...ledger.claims[0]!,
			id: "c002",
			source: {
				origin: "crossref",
				doi: "doi:10.1234/abc.5",
				aliases: ["arXiv:2502.10855"],
				venue: "NeurIPS",
				passage_sha256: passageDigest,
				quote: "The experiment used 12 samples.",
			},
		},
		{
			...ledger.claims[0]!,
			id: "c003",
			source: {
				origin: "preprint",
				url: "https://arxiv.org/abs/2502.10855",
				passage_sha256: passageDigest,
				quote: "Its small size limits generalization.",
			},
		},
		{
			...ledger.claims[0]!,
			id: "c004",
			source: {
				origin: "preprint",
				artifact: "https://arxiv.org/abs/2502.10855v1",
				revision: "v1",
				passage_sha256: passageDigest,
				quote: "The experiment used 12 samples.",
			},
		},
		{
			...ledger.claims[0]!,
			id: "c005",
			source: {
				origin: "preprint",
				artifact: "https://arxiv.org/abs/2502.10855v2",
				revision: "v2",
				passage_sha256: passageDigest,
				quote: "The experiment used 12 samples.",
			},
		},
	];
	save();

	const packet = buildReportPacket(dir);
	assert.equal(
		packet.sources.length,
		3,
		"unpinned DOI/arXiv aliases merge into 1 source while v1 and v2 stay distinct",
	);
	const relMap = new Map(packet.relations.map((r) => [r.claim_id, r]));
	assert.equal(relMap.get("c001")!.source_id, relMap.get("c002")!.source_id);
	assert.equal(relMap.get("c002")!.source_id, relMap.get("c003")!.source_id);
	assert.notEqual(relMap.get("c004")!.source_id, relMap.get("c005")!.source_id);
	assert.notEqual(relMap.get("c001")!.source_id, relMap.get("c004")!.source_id);

	const mergedSource = packet.sources.find(
		(s) => s.id === relMap.get("c001")!.source_id,
	)!;
	assert.deepEqual(mergedSource.canonical_ids, [
		"arxiv:2502.10855",
		"doi:10.1234/abc.5",
	]);
	assert.equal(mergedSource.merged_metadata!.length, 3);
	assert.equal(mergedSource.metadata.title, "Canonical Paper");
	assert.equal(mergedSource.metadata.venue, "NeurIPS");
});

test("sidecar verify-semantics preserves packet boundary, classifies verdicts, supports custom evaluator, and enforces --semantics", async (t) => {
	const { dir, ledger, save, passageDigest } = fixture(t);
	const negPassage =
		"Contrary to early hopes, the treatment did not reduce mortality across 50 patients.";
	const negDigest = storePassage(dir, negPassage);
	const extraPassage = "The benchmark achieved 94% accuracy on 200 items.";
	const extraDigest = storePassage(dir, extraPassage);

	ledger.claims = [
		{
			...ledger.claims[0]!,
			id: "s001",
			content: "The experiment used 12 samples.",
			source: {
				...ledger.claims[0]!.source!,
				passage_sha256: passageDigest,
				quote: "The experiment used 12 samples.",
			},
		},
		{
			...ledger.claims[0]!,
			id: "s002",
			content: "The benchmark achieved 94% accuracy on 200 items in 2026.",
			source: {
				origin: "review",
				artifact: "papers/survey.pdf",
				passage_sha256: extraDigest,
				quote: extraPassage,
				source_role: "secondary_citation",
			},
		},
		{
			...ledger.claims[0]!,
			id: "s003",
			content: "The treatment reduced mortality across 50 patients.",
			source: {
				origin: "trial",
				artifact: "trials/t1.json",
				passage_sha256: negDigest,
				quote: negPassage,
			},
		},
		{
			...ledger.claims[0]!,
			id: "s004",
			content: "Missing passage claim.",
			source: {
				origin: "trial",
				artifact: "trials/missing.json",
				passage_sha256: "0".repeat(64),
				quote: "Absent quote",
			},
		},
	];
	save();
	writeReportPacket(dir, "output/packet.json");

	const packetOnDisk: {
		packet_sha256: string;
		ledger_sha256: string;
		relations: { semantic_support: string }[];
	} = JSON.parse(fs.readFileSync(path.join(dir, "output/packet.json"), "utf8"));
	assert.ok(
		packetOnDisk.relations.every((r) => r.semantic_support === "not_evaluated"),
	);

	const run = (...args: string[]) =>
		spawnSync(process.execPath, [cli, "report", ...args], { encoding: "utf8" });
	const semCli = run(
		"verify-semantics",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--out",
		"output/semantic-eval.json",
		"--json",
	);
	assert.equal(semCli.status, 0, semCli.stderr);
	const semDoc: {
		schema: string;
		packet_sha256: string;
		ledger_sha256: string;
		evaluations: { claim_id: string; verdict: string }[];
	} = JSON.parse(
		fs.readFileSync(path.join(dir, "output/semantic-eval.json"), "utf8"),
	);
	assert.equal(semDoc.schema, "grainulator.semantic-eval/v1");
	assert.equal(semDoc.packet_sha256, packetOnDisk.packet_sha256);
	assert.equal(semDoc.ledger_sha256, packetOnDisk.ledger_sha256);
	const verdicts = new Map(
		semDoc.evaluations.map((e) => [e.claim_id, e.verdict]),
	);
	assert.equal(verdicts.get("s001"), "supported");
	assert.equal(verdicts.get("s002"), "partial");
	assert.equal(verdicts.get("s003"), "contradicted");
	assert.equal(verdicts.get("s004"), "unresolvable");

	// Custom async evaluator adapter can override resolvable verdicts while unresolvable stays enforced
	const customSem = await verifyReportSemantics(
		dir,
		"output/packet.json",
		"output/custom-sem.json",
		{
			evaluator: async ({ claim }) => ({
				verdict: claim?.id === "s002" ? "supported" : "partial",
				reason: "custom model adapter",
			}),
		},
	);
	const customVerdicts = new Map(
		customSem.evaluations.map((e: { claim_id: string; verdict: string }) => [
			e.claim_id,
			e.verdict,
		]),
	);
	assert.equal(customVerdicts.get("s002"), "supported");
	assert.equal(customVerdicts.get("s004"), "unresolvable");

	fs.writeFileSync(
		path.join(dir, "output/good-draft.md"),
		"Samples totaled 12 [[claim:s001]] and accuracy reached 94% [[claim:s002]].\n",
	);
	const checkOk = run(
		"check",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--draft",
		"output/good-draft.md",
		"--semantics",
		"output/semantic-eval.json",
		"--json",
	);
	assert.equal(checkOk.status, 0, checkOk.stderr);
	assert.equal(
		JSON.parse(checkOk.stdout).semantic_support,
		"sidecar_evaluated",
	);

	fs.writeFileSync(
		path.join(dir, "output/bad-draft.md"),
		"Mortality fell [[claim:s003]].\n",
	);
	const checkContradicted = run(
		"check",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--draft",
		"output/bad-draft.md",
		"--semantics",
		"output/semantic-eval.json",
		"--json",
	);
	assert.equal(checkContradicted.status, 2);
	const parsedBad: { issues: { code: string; claim_id?: string }[] } =
		JSON.parse(checkContradicted.stdout);
	assert.ok(
		parsedBad.issues.some(
			(i) => i.code === "semantic_support_failed" && i.claim_id === "s003",
		),
	);

	// Stale semantic-eval fails when packet.json changes
	ledger.claims[0]!.content = "The experiment used 12 samples (updated).";
	save();
	writeReportPacket(dir, "output/packet-v2.json");
	const staleCheck = checkReportPacket(
		dir,
		"output/packet-v2.json",
		"output/good-draft.md",
		{ semanticFile: "output/semantic-eval.json" },
	);
	assert.equal(staleCheck.passed, false);
	assert.ok(
		staleCheck.issues.some((i) => i.code === "semantic_eval_stale_or_invalid"),
	);
});

test("blind order-swapped report compare evaluates A_then_B and B_then_A and detects judge order disagreement", async (t) => {
	const { dir, ledger, save } = fixture(t);
	const secondaryPassage = "Survey notes 12 samples in passing.";
	const secondaryDigest = storePassage(dir, secondaryPassage);
	ledger.claims.push({
		...ledger.claims[0]!,
		id: "r003",
		content: "Survey reference.",
		source: {
			origin: "review",
			artifact: "papers/survey.pdf",
			passage_sha256: secondaryDigest,
			quote: secondaryPassage,
			source_role: "secondary_citation",
		},
	});
	save();
	writeReportPacket(dir, "output/packet.json");

	fs.writeFileSync(
		path.join(dir, "output/draft-a.md"),
		"The experiment used 12 samples [[claim:r001]], though its small size limits generalization [[claim:r002]].\n",
	);
	fs.writeFileSync(
		path.join(dir, "output/draft-b.md"),
		"A survey notes 12 samples [[claim:r003]], and measurements confirm 99% gains in 2026.\n",
	);

	const run = (...args: string[]) =>
		spawnSync(process.execPath, [cli, "report", ...args], { encoding: "utf8" });
	const cliCmp = run(
		"compare",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--draft-a",
		"output/draft-a.md",
		"--draft-b",
		"output/draft-b.md",
		"--json",
	);
	assert.equal(cliCmp.status, 0, cliCmp.stderr);
	const compared = JSON.parse(cliCmp.stdout);
	assert.equal(compared.schema, "grainulator.blind-compare/v1");
	assert.equal(compared.order_consistent, true);
	assert.equal(compared.order_disagreement, false);
	assert.equal(compared.winner, "A");
	assert.equal(compared.draft_a.effective_grounded_claims, 2);
	assert.equal(compared.draft_a.primary_evidence_claims, 2);
	assert.equal(compared.draft_b.effective_grounded_claims, 1);
	assert.equal(compared.draft_b.primary_evidence_claims, 0);
	assert.ok(compared.draft_b.grounding_warnings_count >= 1);

	// Biased judge that always picks candidate_1 regardless of content must trigger order_disagreement
	const seenLabels: [string, string][] = [];
	const biased = await compareReportDrafts(
		dir,
		"output/packet.json",
		"output/draft-a.md",
		"output/draft-b.md",
		{
			judge: (first: { label: string }, second: { label: string }) => {
				seenLabels.push([first.label, second.label]);
				assert.equal(
					"file" in first,
					false,
					"blinded candidate must not expose filename",
				);
				return { winner: "candidate_1", reason: "position bias" };
			},
		},
	);
	assert.deepEqual(seenLabels, [
		["candidate_1", "candidate_2"],
		["candidate_1", "candidate_2"],
	]);
	assert.equal(biased.order_consistent, false);
	assert.equal(biased.order_disagreement, true);
	assert.equal(biased.winner, "inconclusive");
});

test("DSSE in-toto attestation supports unsigned and Ed25519 signed envelopes and rejects tampering", (t) => {
	const { dir } = fixture(t);
	writeReportPacket(dir, "output/packet.json");
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"The experiment used 12 samples [[claim:r001]].\n",
	);

	// Unsigned attestation + verification
	const unsignedRes = attestReportPacket(
		dir,
		"output/packet.json",
		"output/unsigned.dsse.json",
		{ draftFile: "output/draft.md" },
	);
	assert.equal(unsignedRes.signed, false);
	const unsignedCheck = verifyReportAttestation(
		dir,
		"output/unsigned.dsse.json",
	);
	assert.equal(unsignedCheck.passed, true);
	assert.equal(unsignedCheck.signed, false);
	assert.equal(unsignedCheck.signature_verified, null);
	assert.deepEqual(unsignedCheck.subjects_verified, [
		"output/packet.json",
		"output/draft.md",
	]);

	// Ed25519 keypair outside sprint directory for CLI --key / --pubkey
	const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-keys-"));
	t.after(() => fs.rmSync(keyDir, { recursive: true, force: true }));
	const { privateKey, publicKey } = generateKeyPairSync("ed25519");
	const privPem = privateKey.export({ type: "pkcs8", format: "pem" });
	const pubPem = publicKey.export({ type: "spki", format: "pem" });
	const privPath = path.join(keyDir, "signing.key.pem");
	const pubPath = path.join(keyDir, "signing.pub.pem");
	fs.writeFileSync(privPath, privPem);
	fs.writeFileSync(pubPath, pubPem);

	const run = (...args: string[]) =>
		spawnSync(process.execPath, [cli, "report", ...args], { encoding: "utf8" });
	const attestCli = run(
		"attest",
		"--dir",
		dir,
		"--packet",
		"output/packet.json",
		"--draft",
		"output/draft.md",
		"--out",
		"output/packet.dsse.json",
		"--key",
		privPath,
		"--json",
	);
	assert.equal(attestCli.status, 0, attestCli.stderr);
	const envelope = JSON.parse(
		fs.readFileSync(path.join(dir, "output/packet.dsse.json"), "utf8"),
	);
	assert.equal(envelope.payloadType, "application/vnd.in-toto+json");
	assert.equal(envelope.signatures.length, 1);
	const stmt = JSON.parse(
		Buffer.from(envelope.payload, "base64").toString("utf8"),
	);
	assert.equal(stmt._type, "https://in-toto.io/Statement/v1");
	assert.equal(
		stmt.predicateType,
		"https://grainulation.com/attestation/report-packet/v1",
	);
	assert.equal(stmt.predicate.active_claims, 2);
	assert.equal(stmt.predicate.intact_passages, 1);

	const verifyCli = run(
		"verify-attestation",
		"--dir",
		dir,
		"--attestation",
		"output/packet.dsse.json",
		"--pubkey",
		pubPath,
		"--json",
	);
	assert.equal(verifyCli.status, 0, verifyCli.stderr);
	const verified = JSON.parse(verifyCli.stdout);
	assert.equal(verified.passed, true);
	assert.equal(verified.signed, true);
	assert.equal(verified.signature_verified, true);

	// Wrong public key must fail verification
	const otherPair = generateKeyPairSync("ed25519");
	const wrongVerify = verifyReportAttestation(dir, "output/packet.dsse.json", {
		publicKeyPem: otherPair.publicKey.export({ type: "spki", format: "pem" }),
	});
	assert.equal(wrongVerify.passed, false);
	assert.ok(
		wrongVerify.issues.some((i) => i.code === "attestation_signature_invalid"),
	);

	// Tampering draft.md must fail subject digest verification
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"Tampered draft [[claim:r001]].\n",
	);
	const tamperedDraftVerify = run(
		"verify-attestation",
		"--dir",
		dir,
		"--attestation",
		"output/packet.dsse.json",
		"--pubkey",
		pubPath,
		"--json",
	);
	assert.equal(tamperedDraftVerify.status, 2);
	const tamperedDraftResult: { issues: { code: string }[] } = JSON.parse(
		tamperedDraftVerify.stdout,
	);
	assert.ok(
		tamperedDraftResult.issues.some(
			(i) => i.code === "attestation_subject_digest_mismatch",
		),
	);

	// Tampering packet.json must fail subject digest and packet verification
	fs.writeFileSync(
		path.join(dir, "output/draft.md"),
		"The experiment used 12 samples [[claim:r001]].\n",
	);
	const pkt: { claims: { content: string }[] } = JSON.parse(
		fs.readFileSync(path.join(dir, "output/packet.json"), "utf8"),
	);
	pkt.claims[0]!.content = "Tampered claim";
	fs.writeFileSync(path.join(dir, "output/packet.json"), JSON.stringify(pkt));
	const tamperedPktVerify = verifyReportAttestation(
		dir,
		"output/packet.dsse.json",
		{ publicKeyPem: pubPem },
	);
	assert.equal(tamperedPktVerify.passed, false);
	assert.ok(
		tamperedPktVerify.issues.some(
			(i) => i.code === "attestation_subject_digest_mismatch",
		),
	);
});
