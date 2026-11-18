import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateClaim, validateRun } from "../lib/runtime-enrollment.js";
import {
	inspectMigration,
	applyMigration,
	verifyMigration,
	resumeMigration,
	rollbackMigration,
} from "./converter.mjs";

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
function fixture(t) {
	const root = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-migration-")),
	);
	// Only disposable fixtures are removed; no application cleanup command exists.
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const project = path.join(root, "project # café");
	fs.mkdirSync(project);
	const put = (name, value) => {
		const file = path.join(project, name);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(
			file,
			typeof value === "string" ? value : JSON.stringify(value),
		);
		return file;
	};
	return { root, project, put };
}
test("config section merge preserves source bytes, custom paths, unknown fields and signed evidence", (t) => {
	const { project, put } = fixture(t);
	const evidence = {
		dirs: { evidence: "custom evidence" },
		compiler: { claims: "ledger.json" },
		custom: { keep: true },
	};
	put("wheat.config.json", evidence);
	put("orchard.json", {
		sprints: [{ id: "a", path: "sprints/a" }],
		settings: {},
		unknown: 42,
	});
	const original = Buffer.from(
		'{"claims":[{"content":"Wheat and Barn are literal quoted user content"}]}\n',
	);
	put(".wheat/sprints/a/claims.json", original.toString());
	put(".wheat/sprints/a/report.dsse.json", '{"payload":"signed bytes"}\n');
	const before = fs.readFileSync(
		path.join(project, ".wheat/sprints/a/claims.json"),
	);
	const plan = inspectMigration({ project });
	assert.equal(
		fs.existsSync(path.join(project, ".grainulator")),
		false,
		"inspect must not create state",
	);
	assert.doesNotMatch(
		JSON.stringify(plan),
		/literal quoted user content/,
		"plan reports hashes, never source contents",
	);
	assert.throws(() => applyMigration(plan), /quiesced/);
	const result = applyMigration(plan, { quiesced: true });
	assert.equal(result.status, "complete");
	const config = JSON.parse(
		fs.readFileSync(path.join(project, "grainulator.config.json")),
	);
	assert.deepEqual(config.evidence, evidence);
	assert.equal(config.orchestration.unknown, 42);
	assert.deepEqual(
		fs.readFileSync(
			path.join(project, ".grainulator/evidence/sprints/a/claims.json"),
		),
		before,
	);
	assert.deepEqual(
		fs.readFileSync(path.join(project, ".wheat/sprints/a/claims.json")),
		before,
	);
	assert.equal(
		verifyMigration(result.transaction_directory).status,
		"verified",
	);
	assert.equal(applyMigration(plan, { quiesced: true }).idempotent, true);
	assert.equal(
		rollbackMigration(result.transaction_directory, { quiesced: true }).status,
		"rolled-back",
	);
	assert.equal(
		fs.existsSync(path.join(project, "grainulator.config.json")),
		false,
	);
	assert.equal(
		fs.existsSync(path.join(project, ".grainulator/evidence")),
		false,
	);
	assert.deepEqual(
		fs.readFileSync(path.join(project, ".wheat/sprints/a/claims.json")),
		before,
	);
});
test("refuses source races, canonical collisions, unsafe links, hardlinks, writer locks and malicious plan edits", (t) => {
	const { project, put } = fixture(t);
	const source = put("wheat.config.json", { dirs: {} });
	let plan = inspectMigration({ project });
	fs.appendFileSync(source, " ");
	assert.throws(
		() => applyMigration(plan, { quiesced: true }),
		/source changed/,
	);
	put("grainulator.config.json", {
		schema_version: 1,
		evidence: { different: true },
	});
	assert.throws(() => inspectMigration({ project }), /Contradictory/);
	fs.unlinkSync(path.join(project, "grainulator.config.json"));
	put(".wheat/data.txt", "source");
	const outside = put("outside.txt", "do not follow");
	fs.symlinkSync(outside, path.join(project, ".wheat/link"));
	assert.throws(() => inspectMigration({ project }), /symbolic/i);
	fs.unlinkSync(path.join(project, ".wheat/link"));
	fs.linkSync(outside, path.join(project, ".wheat/hardlink"));
	assert.throws(() => inspectMigration({ project }), /hard links/);
	fs.unlinkSync(path.join(project, ".wheat/hardlink"));
	fs.mkdirSync(path.join(project, ".wheat/claims.json.lock"));
	assert.throws(() => inspectMigration({ project }), /locks/);
	fs.rmdirSync(path.join(project, ".wheat/claims.json.lock"));
	plan = inspectMigration({ project });
	plan.operations[0].destination = outside;
	assert.throws(() => applyMigration(plan, { quiesced: true }), /Plan changed/);
	assert.equal(fs.readFileSync(outside, "utf8"), "do not follow");
});
test("staged interruption resumes without reexecution, and changed destination prevents rollback", (t) => {
	const { project, put } = fixture(t);
	put(".wheat/claims.json", '{"claims":[]}');
	const result = applyMigration(inspectMigration({ project }), {
		quiesced: true,
		interruptAfterStage: true,
	});
	assert.equal(result.status, "staged");
	assert.equal(
		JSON.parse(
			fs.readFileSync(path.join(project, ".grainulator/migration.json")),
		).state,
		"in-progress",
	);
	assert.equal(
		fs.existsSync(path.join(project, ".grainulator/evidence")),
		false,
	);
	assert.equal(
		resumeMigration(result.transaction_directory, { quiesced: true }).status,
		"complete",
	);
	fs.writeFileSync(
		path.join(project, ".grainulator/evidence/new-research.txt"),
		"valuable new work",
	);
	assert.throws(
		() => rollbackMigration(result.transaction_directory, { quiesced: true }),
		/changed/,
	);
	assert.equal(
		fs.readFileSync(
			path.join(project, ".grainulator/evidence/new-research.txt"),
			"utf8",
		),
		"valuable new work",
	);
});
test("preexisting unrelated canonical sections survive conversion and rollback", (t) => {
	const { project, put } = fixture(t);
	const canonical =
		'{"schema_version":1,"runtime":{"policy":"explicit"},"extension":{"v":2}}\n';
	put("grainulator.config.json", canonical);
	put("wheat.config.json", { compiler: { claims: "claims.json" } });
	const result = applyMigration(inspectMigration({ project }), {
		quiesced: true,
	});
	assert.deepEqual(
		JSON.parse(fs.readFileSync(path.join(project, "grainulator.config.json")))
			.extension,
		{ v: 2 },
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
	assert.equal(
		fs.readFileSync(path.join(project, "grainulator.config.json"), "utf8"),
		canonical,
	);
});
test("runtime conversion archives oracle receipts and exact source history without executing commands or promoting passes", (t) => {
	const { project, put } = fixture(t);
	const sentinel = path.join(project, "oracle-ran");
	const run = {
		verification: { mode: "strict" },
		budget: { max_rounds: 7 },
		oracles: {
			v: {
				cmd: ["sh", "-c", "touch " + sentinel],
				inputs: [".bean/claims.json"],
			},
		},
	};
	put(".bean/run.json", run);
	put(".bean/claims.json", {
		claims: [
			{
				id: "c",
				type: "factual",
				topic: "x",
				content: "unchanged Bean quotation",
				evidence: "tested",
			},
		],
	});
	put(".bean/state.json", {
		round: 4,
		dry_rounds: 2,
		history: [{ budget: 3 }],
	});
	const verdict =
		'{"schema":"bean.verdict/2","verdict":"pass","claim_binding":"original-binding"}\n';
	put(".bean/verdicts/c.v.json", verdict);
	const before = hash(fs.readFileSync(path.join(project, ".bean/state.json")));
	const result = applyMigration(inspectMigration({ project }), {
		quiesced: true,
	});
	const native = path.join(project, ".grainulator/runtime");
	assert.doesNotThrow(() =>
		validateRun(JSON.parse(fs.readFileSync(path.join(native, "run.json")))),
	);
	JSON.parse(fs.readFileSync(path.join(native, "claims.json"))).claims.forEach(
		(claim) => assert.doesNotThrow(() => validateClaim(claim)),
	);
	assert.equal(fs.existsSync(sentinel), false);
	assert.equal(
		fs.existsSync(path.join(native, "verdicts")),
		false,
		"legacy passes cannot become active canonical verdicts",
	);
	assert.equal(
		JSON.parse(fs.readFileSync(path.join(native, "state.json"))).round,
		4,
	);
	assert.equal(
		hash(fs.readFileSync(path.join(project, ".bean/state.json"))),
		before,
	);
	const history = fs
		.readdirSync(native)
		.find((x) => x.startsWith("migration-history-"));
	assert.equal(
		fs.readFileSync(path.join(native, history, "verdicts/c.v.json"), "utf8"),
		verdict,
	);
	const stale = JSON.parse(
		fs.readFileSync(path.join(native, "migration-required.json")),
	);
	assert.equal(stale.state, "verification-required");
	assert.deepEqual(stale.oracle_bindings_requiring_review, ["v"]);
	assert.equal(result.enrollment, "not-performed");
	assert.equal(result.remote, "not-performed");
});
test("explicit memory selection validates hashes and never silently merges two stores", (t) => {
	const { root, project, put } = fixture(t);
	put("wheat.config.json", {});
	const source = path.join(root, "old-memory"),
		destination = path.join(root, "new-memory");
	fs.mkdirSync(path.join(source, "claims"), { recursive: true });
	const claims = [{ id: "c", content: "preserved" }],
		digest = hash(JSON.stringify(claims));
	fs.writeFileSync(
		path.join(source, "index.json"),
		JSON.stringify({
			version: 1,
			collections: [{ id: "one", type: "claims" }],
		}),
	);
	fs.writeFileSync(
		path.join(source, "claims/one.json"),
		JSON.stringify({ meta: { hash: digest.slice(0, 12) }, claims }),
	);
	let plan = inspectMigration({
		project,
		memorySource: source,
		memoryDestination: destination,
	});
	fs.mkdirSync(destination);
	assert.throws(
		() => applyMigration(plan, { quiesced: true }),
		/Destination appeared/,
	);
	fs.rmdirSync(destination);
	const result = applyMigration(plan, { quiesced: true });
	assert.deepEqual(
		fs.readFileSync(path.join(source, "claims/one.json")),
		fs.readFileSync(path.join(destination, "claims/one.json")),
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
	fs.writeFileSync(
		path.join(source, "claims/one.json"),
		JSON.stringify({ meta: { hash: "0".repeat(64) }, claims }),
	);
	assert.throws(
		() =>
			inspectMigration({
				project,
				memorySource: source,
				memoryDestination: destination,
			}),
		/integrity mismatch/,
	);
});

const converter = fileURLToPath(new URL("./converter.mjs", import.meta.url));
function child(args, crash) {
	return spawnSync(process.execPath, [converter, ...args], {
		encoding: "utf8",
		env: { ...process.env, GRAINULATOR_MIGRATION_TEST_CRASH: crash || "" },
		timeout: 30000,
	});
}
function transaction(project) {
	const dir = path.join(project, ".grainulator-migrations");
	const names = fs.readdirSync(dir);
	assert.equal(names.length, 1);
	return path.join(dir, names[0]);
}
function savePlan(root, plan) {
	const file = path.join(root, "plan.json");
	fs.writeFileSync(file, JSON.stringify(plan));
	return file;
}
for (const boundary of [
	"marker-in-progress:before",
	"marker-in-progress:after-intent",
	"marker-in-progress:after-install",
	"marker-in-progress:after",
	"after-stage",
	"promotion-0:before",
	"promotion-0:reserved",
	"promotion-0:after",
	"marker-complete:before",
	"marker-complete:after-intent",
	"marker-complete:after-retire",
	"marker-complete:after-install",
	"marker-complete:after",
]) {
	test(
		"actual abrupt exit and explicit dead-owner recovery at " + boundary,
		(t) => {
			const { root, project, put } = fixture(t);
			put(".wheat/data.txt", "irreplaceable source");
			const plan = savePlan(root, inspectMigration({ project })),
				stopped = child(["apply", "--plan", plan, "--quiesced"], boundary);
			assert.equal(stopped.signal, "SIGKILL", stopped.stderr);
			const dir = transaction(project);
			assert.throws(
				() => resumeMigration(dir, { quiesced: true }),
				/lock/i,
				"a dead lock still needs deliberate recovery",
			);
			const resumed = child([
				"resume",
				"--transaction",
				dir,
				"--quiesced",
				"--recover-locks",
			]);
			assert.equal(resumed.status, 0, resumed.stderr);
			assert.equal(verifyMigration(dir).status, "verified");
			assert.equal(
				fs.readFileSync(
					path.join(project, ".grainulator/evidence/data.txt"),
					"utf8",
				),
				"irreplaceable source",
			);
			rollbackMigration(dir, { quiesced: true });
			assert.equal(
				fs.existsSync(path.join(project, ".grainulator/evidence")),
				false,
			);
		},
	);
}
for (const boundary of [
	"config-0:after-intent",
	"config-0:after-retire",
	"config-0:after-install",
])
	test(
		"config replacement recovers its durable preimage at " + boundary,
		(t) => {
			const { root, project, put } = fixture(t);
			const original = '{"schema_version":1,"private":{"keep":7}}\n';
			put("grainulator.config.json", original);
			put("wheat.config.json", { compiler: { claims: "custom.json" } });
			const stopped = child(
				[
					"apply",
					"--plan",
					savePlan(root, inspectMigration({ project })),
					"--quiesced",
				],
				boundary,
			);
			assert.equal(stopped.signal, "SIGKILL", stopped.stderr);
			const dir = transaction(project);
			const resumed = child([
				"resume",
				"--transaction",
				dir,
				"--quiesced",
				"--recover-locks",
			]);
			assert.equal(resumed.status, 0, resumed.stderr);
			rollbackMigration(dir, { quiesced: true });
			assert.equal(
				fs.readFileSync(path.join(project, "grainulator.config.json"), "utf8"),
				original,
			);
		},
	);
for (const boundary of ["rollback-0:after-retire", "rollback-0:after-restore"])
	test("actual rollback crash is retryable at " + boundary, (t) => {
		const { project, put } = fixture(t);
		const original = '{"schema_version":1,"extension":{"preserve":true}}\n';
		put("grainulator.config.json", original);
		put("wheat.config.json", {});
		const applied = applyMigration(inspectMigration({ project }), {
			quiesced: true,
		});
		const stopped = child(
			[
				"rollback",
				"--transaction",
				applied.transaction_directory,
				"--quiesced",
			],
			boundary,
		);
		assert.equal(stopped.signal, "SIGKILL", stopped.stderr);
		const recovered = child([
			"rollback",
			"--transaction",
			applied.transaction_directory,
			"--quiesced",
			"--recover-locks",
		]);
		assert.equal(recovered.status, 0, recovered.stderr);
		assert.equal(
			fs.readFileSync(path.join(project, "grainulator.config.json"), "utf8"),
			original,
		);
		assert.equal(
			rollbackMigration(applied.transaction_directory, { quiesced: true })
				.idempotent,
			true,
		);
	});
test("rollback refuses externally missing destinations and corrupt or mode-changed backups before moving any target", (t) => {
	const { root, project, put } = fixture(t);
	put("grainulator.config.json", { schema_version: 1, extension: "preimage" });
	put("wheat.config.json", {});
	put(".wheat/source.txt", "preserved");
	const result = applyMigration(inspectMigration({ project }), {
		quiesced: true,
	});
	const config = path.join(project, "grainulator.config.json"),
		away = path.join(root, "external-move");
	fs.renameSync(config, away);
	assert.throws(
		() => rollbackMigration(result.transaction_directory, { quiesced: true }),
		/changed/,
	);
	assert.equal(
		fs.existsSync(path.join(project, ".grainulator/evidence/source.txt")),
		true,
	);
	fs.renameSync(away, config);
	const backup = path.join(result.transaction_directory, "backups/0"),
		original = fs.readFileSync(backup),
		mode = fs.statSync(backup).mode & 0o777;
	fs.writeFileSync(backup, "tampered");
	assert.throws(
		() => rollbackMigration(result.transaction_directory, { quiesced: true }),
		/changed/,
	);
	assert.equal(fs.existsSync(config), true);
	fs.writeFileSync(backup, original);
	fs.chmodSync(backup, mode ^ 0o040);
	assert.throws(
		() => rollbackMigration(result.transaction_directory, { quiesced: true }),
		/changed/,
	);
	fs.chmodSync(backup, mode);
	rollbackMigration(result.transaction_directory, { quiesced: true });
});
test("a destination appearing after staging is never overwritten, including an empty directory", (t) => {
	const { project, put } = fixture(t);
	put(".wheat/source.txt", "old source");
	const result = applyMigration(inspectMigration({ project }), {
			quiesced: true,
			interruptAfterStage: true,
		}),
		dest = path.join(project, ".grainulator/evidence");
	fs.mkdirSync(dest);
	assert.throws(
		() => resumeMigration(result.transaction_directory, { quiesced: true }),
		/appeared/,
	);
	assert.deepEqual(fs.readdirSync(dest), []);
	fs.writeFileSync(path.join(dest, "winner.txt"), "other writer");
	assert.throws(
		() => resumeMigration(result.transaction_directory, { quiesced: true }),
		/appeared/,
	);
	assert.equal(
		fs.readFileSync(path.join(dest, "winner.txt"), "utf8"),
		"other writer",
	);
});
test("runtime control files and real lessons stay inert; supported array ledger and counters survive exactly", (t) => {
	const { project, put } = fixture(t);
	const claims = [
		{
			id: "keep-id",
			type: "factual",
			topic: "work",
			content: "literal .bean reference",
			evidence: "tested",
			custom: 42,
		},
	];
	put(".bean/claims.json", claims);
	put(".bean/run.json", {
		oracles: {
			first: { cmd: ["false"] },
			second: { cmd: ["bean-check"], inputs: [".bean/claims.json"] },
		},
		verification: { mode: "strict" },
		budget: { max_rounds: 9, max_usd: 1.5 },
	});
	const state = {
		round: 8,
		dry_rounds: 3,
		seen_ids: ["keep-id"],
		superseded_hashes: ["old"],
		claims_hash: "sealed",
		custom: { keep: true },
	};
	put(".bean/state.json", state);
	for (const name of [
		"enrollment.json",
		"origin.json",
		"host-backups/receipt.json",
		"lessons.json",
		"lessons.md",
		"unknown-control.json",
	])
		put(".bean/" + name, '{"forged":"never active"}');
	const result = applyMigration(inspectMigration({ project }), {
			quiesced: true,
		}),
		dest = path.join(project, ".grainulator/runtime"),
		history = fs
			.readdirSync(dest)
			.find((n) => n.startsWith("migration-history-"));
	for (const name of [
		"enrollment.json",
		"origin.json",
		"host-backups",
		"lessons.json",
		"lessons.md",
		"unknown-control.json",
	]) {
		assert.equal(fs.existsSync(path.join(dest, name)), false);
		assert.equal(fs.existsSync(path.join(dest, history, name)), true);
	}
	assert.deepEqual(
		JSON.parse(fs.readFileSync(path.join(dest, "claims.json"))),
		claims,
	);
	assert.deepEqual(
		JSON.parse(fs.readFileSync(path.join(dest, "state.json"))),
		state,
	);
	const marker = JSON.parse(
		fs.readFileSync(path.join(dest, "migration-required.json")),
	);
	assert.deepEqual(marker.oracle_bindings_requiring_review, [
		"first",
		"second",
	]);
	assert.deepEqual(marker.legacy_path_oracles, ["second"]);
	assert.equal(result.enrollment, "not-performed");
});
test("malformed runtime envelopes, schemas, counters and oracle contracts fail during read-only inspection", (t) => {
	const { project, put } = fixture(t);
	const valid = {
		claims: [
			{
				id: "id",
				type: "factual",
				topic: "x",
				content: "c",
				evidence: "stated",
			},
		],
	};
	put(".bean/claims.json", valid);
	for (const state of [
		[],
		null,
		3,
		{ round: -1 },
		{ round: 1.2 },
		{ seen_ids: [3] },
		{ schema: "future.v999" },
	]) {
		put(".bean/state.json", JSON.stringify(state));
		assert.throws(() => inspectMigration({ project }));
	}
	fs.unlinkSync(path.join(project, ".bean/state.json"));
	for (const claims of [
		{ claims: [{}, {}] },
		{ claims: [...valid.claims, ...valid.claims] },
		{ schema: "claims/999", claims: [] },
	]) {
		put(".bean/claims.json", claims);
		assert.throws(() => inspectMigration({ project }));
	}
	put(".bean/claims.json", valid);
	for (const run of [
		{ oracles: [] },
		{ oracles: { o: { cmd: "sh" } } },
		{ budget: { max_rounds: 0 } },
		{ verification: { mode: "anything" } },
	]) {
		put(".bean/run.json", run);
		assert.throws(() => inspectMigration({ project }));
	}
	assert.equal(fs.existsSync(path.join(project, ".grainulator")), false);
});
test("root derived manifest alone or with evidence reaches canonical consumer without rewriting original bytes", (t) => {
	const { project, put } = fixture(t);
	const original = JSON.stringify({
		schema_version: "1.0",
		topics: {
			x: { claims: [], files: [], sprint: "current", evidence_level: "stated" },
		},
		sprints: {},
		files: {},
		generator: "@grainulation/wheat-shared generate-manifest",
		custom: "historical",
	});
	put("wheat-manifest.json", original);
	let plan = inspectMigration({ project });
	let result = applyMigration(plan, { quiesced: true });
	assert.equal(
		fs.readFileSync(
			path.join(project, ".grainulator/evidence/manifest.json"),
			"utf8",
		),
		original,
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
	assert.equal(
		fs.readFileSync(path.join(project, "wheat-manifest.json"), "utf8"),
		original,
	);
	put(".wheat/notes.json", { custom: "research" });
	plan = inspectMigration({ project });
	result = applyMigration(plan, { quiesced: true });
	assert.equal(
		fs.existsSync(path.join(project, ".grainulator/evidence/notes.json")),
		true,
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
	put(".wheat/manifest.json", original);
	assert.throws(() => inspectMigration({ project }), /collides/);
});
test("every historical sync is blocked, including empty pages and missing maps; scope and opaque identities survive", (t) => {
	const { project, put } = fixture(t);
	const sync = {
		sprintA: {
			site: "https://one.invalid",
			spaceKey: "R",
			pages: { parent: { pageId: "1", version: 4 } },
		},
		sprintB: {
			site: "https://two.invalid",
			spaceKey: "S",
			pages: { claims: { pageId: "1", version: 8 } },
		},
		empty: { pages: {}, lastHash: "known-sync" },
	};
	put(".wheat/sync-state.json", sync);
	let result = applyMigration(inspectMigration({ project }), {
		quiesced: true,
	});
	let marker = JSON.parse(
		fs.readFileSync(
			path.join(project, ".grainulator/evidence/remote-migration.json"),
		),
	);
	assert.equal(marker.state, "pending");
	assert.equal(marker.ambiguity, true);
	assert.equal(marker.pages.length, 2);
	assert.deepEqual(marker.sync_sources[0].state, sync);
	assert.notDeepEqual(marker.pages[0].scope, marker.pages[1].scope);
	assert.equal(marker.pages[1].version, 8);
	rollbackMigration(result.transaction_directory, { quiesced: true });
	fs.unlinkSync(path.join(project, ".wheat/sync-state.json"));
	put("wheat.config.json", {
		confluence: { site: "https://one.invalid", spaceKey: "R" },
	});
	result = applyMigration(inspectMigration({ project }), { quiesced: true });
	marker = JSON.parse(
		fs.readFileSync(
			path.join(project, ".grainulator/evidence/remote-migration.json"),
		),
	);
	assert.equal(marker.missing_sync_map, true);
	assert.equal(marker.ambiguity, true);
	assert.deepEqual(marker.pages, []);
});
test("real v1 mixed memory records retain short/full hashes, counts and separate default nested cache bytes/modes", (t) => {
	const { root, project } = fixture(t),
		source = path.join(root, "old-store"),
		dest = path.join(root, "new-store"),
		cache = path.join(source, "cache/smart-fetch"),
		cacheDest = path.join(root, "new-cache");
	fs.mkdirSync(path.join(source, "claims"), { recursive: true });
	fs.mkdirSync(path.join(source, "templates"));
	fs.mkdirSync(cache, { recursive: true });
	const claims = [{ id: "exact-ID", content: "keep" }],
		digest = hash(JSON.stringify(claims));
	const entry = {
			id: "one",
			type: "claims",
			hash: digest.slice(0, 12),
			claimCount: 1,
		},
		template = { id: "seed", type: "template", claimCount: 1 };
	fs.writeFileSync(
		path.join(source, "index.json"),
		JSON.stringify({ version: 1, collections: [entry, template] }),
	);
	fs.writeFileSync(
		path.join(source, "claims/one.json"),
		JSON.stringify({ meta: { ...entry, hash: digest }, claims }),
	);
	fs.writeFileSync(
		path.join(source, "templates/seed.json"),
		JSON.stringify({
			id: "seed",
			question: "why?",
			seedClaims: [{ content: "seed" }],
			custom: "preserved",
		}),
	);
	const cacheBytes =
		'{"entries":{"key":{"fetched_at":1,"mode_key":"reader","size":7}},"seq":8}';
	fs.writeFileSync(path.join(cache, "index.json"), cacheBytes, { mode: 0o600 });
	fs.writeFileSync(path.join(cache, "payload.json"), "private cache");
	let result = applyMigration(
		inspectMigration({
			project,
			memorySource: source,
			memoryDestination: dest,
		}),
		{ quiesced: true },
	);
	assert.equal(fs.existsSync(path.join(dest, "cache")), false);
	assert.equal(
		fs.readFileSync(path.join(cache, "index.json"), "utf8"),
		cacheBytes,
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
	result = applyMigration(
		inspectMigration({
			project,
			memorySource: source,
			memoryDestination: dest,
			cacheSource: cache,
			cacheDestination: cacheDest,
		}),
		{ quiesced: true },
	);
	assert.equal(fs.existsSync(path.join(dest, "cache")), false);
	assert.equal(
		fs.readFileSync(path.join(cacheDest, "index.json"), "utf8"),
		cacheBytes,
	);
	assert.equal(
		fs.statSync(path.join(cacheDest, "index.json")).mode & 0o777,
		0o600,
	);
	assert.equal(
		fs.readFileSync(path.join(dest, "claims/one.json"), "utf8"),
		fs.readFileSync(path.join(source, "claims/one.json"), "utf8"),
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
	for (const index of [
		{ version: 999, collections: [] },
		{ version: 1, collections: [{ type: "claims" }] },
		{ version: 1, collections: [{ ...entry, hash: "0".repeat(64) }] },
		{ version: 1, collections: [{ ...entry, claimCount: 9 }] },
	]) {
		fs.writeFileSync(path.join(source, "index.json"), JSON.stringify(index));
		assert.throws(() =>
			inspectMigration({
				project,
				memorySource: source,
				memoryDestination: dest,
			}),
		);
	}
});
test("depth bounds apply to directories before decoding an invalid memory index", (t) => {
	const { root, project } = fixture(t),
		source = path.join(root, "deep"),
		dest = path.join(root, "target");
	fs.mkdirSync(source);
	fs.writeFileSync(path.join(source, "index.json"), "invalid json");
	fs.mkdirSync(path.join(source, ...Array(66).fill("a")), { recursive: true });
	assert.throws(
		() =>
			inspectMigration({
				project,
				memorySource: source,
				memoryDestination: dest,
			}),
		/limits/,
	);
	assert.equal(fs.existsSync(dest), false);
});
test("two projects targeting one store are fenced; a live lock is never stolen and the winner survives", (t) => {
	const { root, project } = fixture(t),
		second = path.join(root, "second-project"),
		source = path.join(root, "shared-old"),
		destination = path.join(root, "shared-new");
	fs.mkdirSync(second);
	fs.mkdirSync(source);
	fs.writeFileSync(
		path.join(source, "index.json"),
		JSON.stringify({ version: 1, collections: [] }),
	);
	const first = inspectMigration({
			project,
			memorySource: source,
			memoryDestination: destination,
		}),
		other = inspectMigration({
			project: second,
			memorySource: source,
			memoryDestination: destination,
		});
	const stopped = child(
		["apply", "--plan", savePlan(root, first), "--quiesced"],
		"after-stage",
	);
	assert.equal(stopped.signal, "SIGKILL");
	const dir = transaction(project);
	assert.throws(() => applyMigration(other, { quiesced: true }), /lock/i);
	assert.equal(fs.existsSync(destination), false);
	const ownerFile = path.join(project, ".grainulator-migration.lock"),
		old = fs.readFileSync(ownerFile),
		owner = JSON.parse(old);
	fs.writeFileSync(ownerFile, JSON.stringify({ ...owner, pid: process.pid }));
	assert.throws(
		() => resumeMigration(dir, { quiesced: true, recoverLocks: true }),
		/lock/i,
	);
	assert.equal(JSON.parse(fs.readFileSync(ownerFile)).pid, process.pid);
	fs.writeFileSync(ownerFile, old);
	const resumed = child([
		"resume",
		"--transaction",
		dir,
		"--quiesced",
		"--recover-locks",
	]);
	assert.equal(resumed.status, 0, resumed.stderr);
	const winner = fs.readFileSync(path.join(destination, "index.json"));
	assert.throws(() => applyMigration(other, { quiesced: true }), /appeared/);
	assert.deepEqual(
		fs.readFileSync(path.join(destination, "index.json")),
		winner,
	);
	rollbackMigration(dir, { quiesced: true });
});
test("cross-device targets refuse at inspection before locks or canonical activation", (t) => {
	const { root, project } = fixture(t),
		source = path.join(root, "memory");
	fs.mkdirSync(source);
	fs.writeFileSync(
		path.join(source, "index.json"),
		JSON.stringify({ version: 1, collections: [] }),
	);
	const foreign = ["/dev", "/proc"].find(
		(dir) =>
			fs.existsSync(dir) && fs.statSync(dir).dev !== fs.statSync(project).dev,
	);
	assert.ok(
		foreign,
		"fixture needs an existing distinct device (metadata only)",
	);
	assert.throws(
		() =>
			inspectMigration({
				project,
				memorySource: source,
				memoryDestination: path.join(
					foreign,
					"grainulator-never-written-" + crypto.randomUUID(),
				),
			}),
		/Cross-device/,
	);
	assert.equal(fs.existsSync(path.join(project, ".grainulator")), false);
	assert.equal(
		fs.existsSync(path.join(project, ".grainulator-migration.lock")),
		false,
	);
});
test("entry bounds count empty directories before decoding any selected memory JSON", (t) => {
	const { root, project } = fixture(t),
		source = path.join(root, "many"),
		destination = path.join(root, "new");
	fs.mkdirSync(source);
	fs.writeFileSync(path.join(source, "index.json"), "invalid json");
	for (let i = 0; i < 20001; i++) fs.mkdirSync(path.join(source, String(i)));
	assert.throws(
		() =>
			inspectMigration({
				project,
				memorySource: source,
				memoryDestination: destination,
			}),
		/limits/,
	);
	assert.equal(fs.existsSync(destination), false);
});
test("one empty historical sync remains ambiguous even alongside a fully identified page", (t) => {
	const { project, put } = fixture(t);
	put(".wheat/sync-state.json", {
		known: { pages: { brief: { pageId: "42", version: 3 } } },
		unresolved: { pages: {}, lastHash: "h" },
	});
	const result = applyMigration(inspectMigration({ project }), {
		quiesced: true,
	});
	const marker = JSON.parse(
		fs.readFileSync(
			path.join(project, ".grainulator/evidence/remote-migration.json"),
		),
	);
	assert.equal(marker.ambiguity, true);
	assert.equal(marker.pages.length, 1);
});
test("partial directory promotion rolls back after a real crash without exposing legacy runtime controls", (t) => {
	const { root, project, put } = fixture(t);
	put(".wheat/a.txt", "preserved");
	put(".wheat/dir/b.txt", "exact");
	const stopped = child(
		[
			"apply",
			"--plan",
			savePlan(root, inspectMigration({ project })),
			"--quiesced",
		],
		"promotion-0:after",
	);
	assert.equal(stopped.signal, "SIGKILL");
	const dir = transaction(project);
	const rolled = child([
		"rollback",
		"--transaction",
		dir,
		"--quiesced",
		"--recover-locks",
	]);
	assert.equal(rolled.status, 0, rolled.stderr);
	assert.equal(
		fs.existsSync(path.join(project, ".grainulator/evidence")),
		false,
	);
	assert.equal(
		fs.readFileSync(path.join(project, ".wheat/dir/b.txt"), "utf8"),
		"exact",
	);
	assert.equal(rollbackMigration(dir, { quiesced: true }).idempotent, true);
});
test("an already matching canonical config still has a verified reversible preimage", (t) => {
	const { project, put } = fixture(t);
	put("wheat.config.json", {});
	const original =
		JSON.stringify({ schema_version: 1, evidence: {} }, null, 2) + "\n";
	put("grainulator.config.json", original);
	fs.chmodSync(path.join(project, "grainulator.config.json"), 0o600);
	const result = applyMigration(inspectMigration({ project }), {
		quiesced: true,
	});
	rollbackMigration(result.transaction_directory, { quiesced: true });
	assert.equal(
		fs.readFileSync(path.join(project, "grainulator.config.json"), "utf8"),
		original,
	);
	fs.writeFileSync(
		path.join(project, "grainulator.config.json"),
		"later user change",
	);
	assert.throws(
		() => rollbackMigration(result.transaction_directory, { quiesced: true }),
		/changed/,
	);
	assert.equal(
		fs.readFileSync(path.join(project, "grainulator.config.json"), "utf8"),
		"later user change",
	);
});
test("read-only source directory modes are preserved without making staging unwritable", (t) => {
	const { root, project, put } = fixture(t),
		source = path.join(project, ".wheat");
	put(".wheat/nested/data", "private bytes");
	fs.chmodSync(path.join(source, "nested/data"), 0o400);
	fs.chmodSync(path.join(source, "nested"), 0o500);
	fs.chmodSync(source, 0o500);
	try {
		const result = applyMigration(inspectMigration({ project }), {
				quiesced: true,
			}),
			dest = path.join(project, ".grainulator/evidence");
		assert.equal(fs.statSync(dest).mode & 0o777, 0o500);
		assert.equal(fs.statSync(path.join(dest, "nested")).mode & 0o777, 0o500);
		assert.equal(
			fs.statSync(path.join(dest, "nested/data")).mode & 0o777,
			0o400,
		);
		assert.equal(
			verifyMigration(result.transaction_directory).status,
			"verified",
		);
		rollbackMigration(result.transaction_directory, { quiesced: true });
	} finally {
		// Restore only directories of this disposable fixture so its cleanup can
		// remove deliberately read-only examples. Production migration never does this.
		const writable = (dir) => {
			fs.chmodSync(dir, 0o700);
			for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
				if (entry.isDirectory()) writable(path.join(dir, entry.name));
		};
		writable(root);
	}
});
test("a conflicting rollback retirement is never adopted or overwritten", (t) => {
	const { project, put } = fixture(t);
	put(".wheat/data", "source");
	const result = applyMigration(inspectMigration({ project }), {
			quiesced: true,
		}),
		conflict = path.join(result.transaction_directory, "rolled-back/0");
	fs.mkdirSync(conflict);
	fs.writeFileSync(path.join(conflict, "unrelated"), "keep me");
	assert.throws(
		() => rollbackMigration(result.transaction_directory, { quiesced: true }),
		/already exists/,
	);
	assert.equal(
		fs.readFileSync(path.join(conflict, "unrelated"), "utf8"),
		"keep me",
	);
	assert.equal(
		fs.readFileSync(path.join(project, ".grainulator/evidence/data"), "utf8"),
		"source",
	);
});
test("memory-only selection neither reads nor follows the unselected cache tree", (t) => {
	const { root, project } = fixture(t),
		source = path.join(root, "old"),
		destination = path.join(root, "new");
	fs.mkdirSync(path.join(source, "cache"), { recursive: true });
	fs.writeFileSync(
		path.join(source, "index.json"),
		JSON.stringify({ version: 1, collections: [] }),
	);
	fs.symlinkSync(
		"/no/such/private-cache-data",
		path.join(source, "cache/opaque"),
	);
	const plan = inspectMigration({
		project,
		memorySource: source,
		memoryDestination: destination,
	});
	fs.writeFileSync(
		path.join(source, "cache/private.txt"),
		"cache still belongs to old scope",
	);
	const result = applyMigration(plan, { quiesced: true });
	assert.equal(fs.existsSync(path.join(destination, "cache")), false);
	assert.equal(
		fs.lstatSync(path.join(source, "cache/opaque")).isSymbolicLink(),
		true,
	);
	assert.equal(
		verifyMigration(result.transaction_directory).status,
		"verified",
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
});
for (const boundary of ["after-locks", "before-first-journal"])
	test(
		"pre-journal crash recovery with the frozen plan and exact transaction: " +
			boundary,
		(t) => {
			const { root, project, put } = fixture(t);
			put(".wheat/data", "source");
			const plan = inspectMigration({ project }),
				file = savePlan(root, plan);
			const stopped = child(["apply", "--plan", file, "--quiesced"], boundary);
			assert.equal(stopped.signal, "SIGKILL");
			const owner = JSON.parse(
				fs.readFileSync(path.join(project, ".grainulator-migration.lock")),
			);
			assert.equal(owner.plan_sha256, plan.plan_sha256);
			assert.equal(
				fs.existsSync(
					path.join(
						project,
						".grainulator-migrations",
						owner.transaction,
						"journal.json",
					),
				),
				false,
			);
			const recovered = child([
				"apply",
				"--plan",
				file,
				"--quiesced",
				"--recover-transaction",
				owner.transaction,
			]);
			assert.equal(recovered.status, 0, recovered.stderr);
			const result = JSON.parse(recovered.stdout);
			assert.equal(
				verifyMigration(result.transaction_directory).status,
				"verified",
			);
			rollbackMigration(result.transaction_directory, { quiesced: true });
		},
	);
test("valid v2 claims without content roundtrip through canonical runtime validation APIs", (t) => {
	const { project, put } = fixture(t);
	const claims = [
		{
			id: "no-content",
			type: "factual",
			topic: "required topic",
			evidence: "stated",
			custom: { untouched: true },
		},
		{
			id: "full",
			type: "constraint",
			topic: "policy",
			content: "literal .bean string",
			evidence: "documented",
			status: "active",
			tags: ["kept"],
			depends_on: ["no-content"],
			verified_by: { verifier: "declared" },
		},
	];
	const run = {
		verification: { mode: "strict" },
		budget: { max_rounds: 9, unknown_budget: "preserved" },
		oracles: {
			declared: {
				cmd: ["false"],
				inputs: [".bean/claims.json"],
				timeout_ms: 1000,
				trust: "dev_oracle",
				custom: "unchanged",
			},
		},
		custom: { unknown: true },
	};
	claims.forEach(validateClaim);
	validateRun(run);
	put(".bean/claims.json", { claims, extension: "retained" });
	put(".bean/run.json", run);
	const result = applyMigration(inspectMigration({ project }), {
			quiesced: true,
		}),
		target = path.join(project, ".grainulator/runtime");
	const converted = JSON.parse(
			fs.readFileSync(path.join(target, "claims.json")),
		),
		convertedRun = JSON.parse(fs.readFileSync(path.join(target, "run.json")));
	converted.claims.forEach(validateClaim);
	validateRun(convertedRun);
	assert.deepEqual(converted, { claims, extension: "retained" });
	assert.deepEqual(convertedRun, run);
	assert.equal("content" in converted.claims[0], false);
	assert.equal(
		JSON.parse(fs.readFileSync(path.join(target, "migration-required.json")))
			.state,
		"verification-required",
	);
	rollbackMigration(result.transaction_directory, { quiesced: true });
});
test("native-invalid claim and cmd declarations are refused before staging, including argv-only oracles", (t) => {
	const { project, put } = fixture(t),
		claim = {
			id: "valid",
			type: "factual",
			topic: "nonempty",
			evidence: "stated",
		};
	for (const invalid of [
		{ ...claim, evidence: undefined },
		{ ...claim, topic: "" },
		{ ...claim, topic: "   " },
		{ ...claim, content: null },
		{ ...claim, id: "../escape" },
		{ ...claim, tags: [1] },
		{ ...claim, depends_on: ["../unsafe"] },
		{ ...claim, status: "unknown" },
		{ ...claim, verified_by: { verifier: "unsafe/id" } },
	]) {
		assert.throws(() => validateClaim(invalid));
		put(".bean/claims.json", [invalid]);
		assert.throws(() => inspectMigration({ project }));
	}
	put(".bean/claims.json", [claim]);
	for (const run of [
		{ oracles: { v: { argv: ["false"] } } },
		{ oracles: { v: { cmd: [] } } },
		{ oracles: { v: { cmd: [""] } } },
		{ oracles: { v: { cmd: ["false"], inputs: [1] } } },
		{ oracles: { "../unsafe": { cmd: ["false"] } } },
		{ verification: {} },
		{ budget: { max_rounds: 0 } },
	]) {
		assert.throws(() => validateRun(run));
		put(".bean/run.json", run);
		assert.throws(() => inspectMigration({ project }));
	}
	assert.equal(fs.existsSync(path.join(project, ".grainulator")), false);
});
for (let index = 0; index < 5; index++)
	for (const phase of ["before-owner", "owner-prepared", "published"])
		test(`atomic lock recovery at acquisition ${index} ${phase} preserves unrelated-project progress`, (t) => {
			const { root, project, put } = fixture(t);
			put(".wheat/data", "original source");
			const plan = inspectMigration({ project }),
				planFile = savePlan(root, plan);
			const second = path.join(root, "another-project");
			fs.mkdirSync(path.join(second, ".wheat"), { recursive: true });
			fs.writeFileSync(path.join(second, ".wheat/data"), "other source");
			const other = inspectMigration({ project: second }),
				otherFile = path.join(root, "other-plan.json");
			fs.writeFileSync(otherFile, JSON.stringify(other));
			const stopped = child(
				["apply", "--plan", planFile, "--quiesced"],
				`lock-${index}:${phase}`,
			);
			assert.equal(stopped.signal, "SIGKILL", stopped.stderr);
			let otherResult = child(["apply", "--plan", otherFile, "--quiesced"]);
			if (otherResult.status !== 0) assert.match(otherResult.stderr, /lock/i);
			const binding = path.join(project, ".grainulator-migration.lock"),
				args = ["apply", "--plan", planFile, "--quiesced"];
			if (fs.existsSync(binding)) {
				const owner = JSON.parse(fs.readFileSync(binding));
				assert.equal(owner.project, project);
				assert.equal(owner.plan_sha256, plan.plan_sha256);
				assert.equal(fs.statSync(binding).nlink, 2);
				assert.deepEqual(
					fs.readFileSync(owner.owner_file),
					fs.readFileSync(binding),
				);
				args.push("--recover-transaction", owner.transaction);
			}
			const recovered = child(args);
			assert.equal(recovered.status, 0, recovered.stderr);
			const result = JSON.parse(recovered.stdout);
			assert.equal(
				verifyMigration(result.transaction_directory).status,
				"verified",
			);
			if (otherResult.status !== 0)
				otherResult = child(["apply", "--plan", otherFile, "--quiesced"]);
			assert.equal(otherResult.status, 0, otherResult.stderr);
			rollbackMigration(JSON.parse(otherResult.stdout).transaction_directory, {
				quiesced: true,
			});
			rollbackMigration(result.transaction_directory, { quiesced: true });
		});
