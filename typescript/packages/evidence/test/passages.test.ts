/**
 * Quoted, content-addressed source passages.
 *
 * Covers storage limits and safety (lib/passages.js), ingestion through
 * addClaim and the CLI, the compiler's audit pass (integrity,
 * distinct supporting passages, conflict support, sanitized output), the
 * shared freshness check used by the guard and status, and next-actions
 * routing. Passage integrity is audit only: no winner or blocker changes.
 *
 * Uses node:test + node:assert — zero dependencies.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";
import {
	COMPILER_VERSION,
	compile,
	computeNextActions,
} from "../compiler/evidence-compiler.js";
import { addClaim, getStatus } from "../lib/claims-ops.js";
import { guard } from "../lib/guard.js";
import nextActionsModule from "../lib/next-actions.cjs";
import {
	normalizeMatch,
	PASSAGE_MAX_BYTES,
	QUOTE_MAX_BYTES,
	quoteProblem,
	readPassage,
	storePassage,
} from "../lib/passages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, "../../..", "bin", "grainulator.js");
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

const PASSAGE =
	"The Eiffel Tower was completed in 1889.\r\nIt is 330 metres tall.\n";
const QUOTE = "completed in   1889.";

interface LedgerSourceFixture {
	origin: string;
	artifact?: string | null;
	connector?: string | null;
	witnessed_claim?: string;
	relationship?: "full_support" | "partial_support";
	quote?: string | number;
	passage?: string;
	passage_sha256?: string;
}

interface ClaimOverrides {
	source?: LedgerSourceFixture;
	evidence?: "web" | "documented";
	status?: "active" | "superseded";
	conflicts_with?: string[];
}

function claim(id: string, overrides: ClaimOverrides = {}) {
	return {
		id,
		type: "factual",
		topic: "tower",
		content: `Claim ${id}`,
		source: { origin: "test", artifact: null, connector: null },
		evidence: "web",
		status: "active",
		phase_added: "research",
		timestamp: "2026-01-01T00:00:00Z",
		conflicts_with: [],
		resolved_by: null,
		tags: [],
		...overrides,
	};
}

function writeLedger(dir: string, claims: ReturnType<typeof claim>[]) {
	fs.writeFileSync(
		path.join(dir, "claims.json"),
		JSON.stringify({
			schema_version: "1.0",
			meta: { question: "q", phase: "research" },
			claims,
		}),
	);
}

interface PassageCompilation {
	status: string;
	errors: readonly unknown[];
	warnings: readonly { code: string }[];
	conflict_graph: {
		resolved: readonly {
			winner: string;
			loser: string;
			reason: string;
			basis?: string;
		}[];
		unresolved: readonly unknown[];
	};
	corroboration: unknown;
	resolved_claims: readonly {
		id: string;
		status: string;
		source: string | { origin: string; passage?: unknown };
	}[];
	passage_integrity: Record<string, { valid: boolean; reason?: string }>;
	distinct_supporting_passages: Record<string, number>;
	conflict_support: readonly {
		claims: readonly string[];
		both_supported: boolean;
		outcome: string;
		support: Record<string, readonly { claim: string; quote: string }[]>;
	}[];
	compilation_certificate: { compiler_version: string; passages_hash?: string };
}

const compileDir = (dir: string): PassageCompilation =>
	compile(
		path.join(dir, "claims.json"),
		path.join(dir, "compilation.json"),
		dir,
		{ skipSprintDetection: true },
	) as PassageCompilation;

const projection = (c: PassageCompilation) => ({
	status: c.status,
	errors: c.errors,
	resolved: c.conflict_graph.resolved.map(({ winner, loser, reason }) => ({
		winner,
		loser,
		reason,
	})),
	unresolved: c.conflict_graph.unresolved,
	corroboration: c.corroboration,
	statuses: c.resolved_claims.map((r) => [r.id, r.status]),
	warnings: c.warnings.filter((w) => w.code !== "W_PASSAGE_INTEGRITY"),
});

let dir: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "passages-"));
});
afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("passages: storage", () => {
	it("stores normalized bytes under their sha256 and reads them back", () => {
		const digest = storePassage(dir, PASSAGE);
		const stored = PASSAGE.replace(/\r\n?/g, "\n");
		assert.equal(digest, sha(stored));
		const read = readPassage(dir, digest);
		assert.equal(read.ok, true);
		assert.equal(read.text, stored);
		assert.equal(storePassage(dir, PASSAGE), digest, "reuse is idempotent");
		const files = fs.readdirSync(path.join(dir, "evidence", "passages"));
		assert.deepEqual(files, [`${digest}.txt`], "no temp files left behind");
	});

	it("normalizes lone CR and NFC", () => {
		const digest = storePassage(dir, "a\rbé");
		const read = readPassage(dir, digest);
		assert.equal(read.ok, true);
		assert.equal(read.text, "a\nbé");
	});

	it("caps passages in UTF-8 bytes, not characters", () => {
		const fits = "é".repeat(PASSAGE_MAX_BYTES / 2);
		assert.ok(storePassage(dir, fits));
		assert.throws(() => storePassage(dir, `${fits}x`), /limit/);
		assert.throws(() => storePassage(dir, ""), /empty/);
	});

	it("rejects quotes that are empty after normalization or too large", () => {
		assert.equal(quoteProblem(" \n\t "), "quote_empty");
		assert.equal(quoteProblem(5), "quote_not_string");
		assert.equal(quoteProblem("é".repeat(QUOTE_MAX_BYTES / 2)), null);
		assert.equal(
			quoteProblem("é".repeat(QUOTE_MAX_BYTES / 2 + 1)),
			"quote_too_large",
		);
		assert.equal(normalizeMatch(" a \n b "), "a b");
	});

	function failedRead(digest: string, budget?: number) {
		const result =
			budget === undefined
				? readPassage(dir, digest)
				: readPassage(dir, digest, budget);
		assert.equal(result.ok, false);
		return result;
	}

	it("rejects invalid digests, missing files, symlinks and special files", () => {
		assert.equal(failedRead("../x").code, "invalid_digest");
		assert.equal(failedRead("A".repeat(64)).code, "invalid_digest");
		const digest = storePassage(dir, PASSAGE);
		const pdir = path.join(dir, "evidence", "passages");
		assert.equal(failedRead("0".repeat(64)).code, "missing");

		const outside = path.join(dir, "outside.txt");
		fs.writeFileSync(outside, "secret");
		const linkName = sha("secret");
		fs.symlinkSync(outside, path.join(pdir, `${linkName}.txt`));
		assert.equal(failedRead(linkName).code, "symlink");

		const dirName = "1".repeat(64);
		fs.mkdirSync(path.join(pdir, `${dirName}.txt`));
		assert.equal(failedRead(dirName).code, "not_regular");

		if (process.platform !== "win32") {
			const fifo = "2".repeat(64);
			execFileSync("mkfifo", [path.join(pdir, `${fifo}.txt`)]);
			assert.equal(failedRead(fifo).code, "not_regular");
		}

		fs.writeFileSync(path.join(pdir, `${digest}.txt`), "edited");
		const tampered = failedRead(digest);
		assert.equal(tampered.code, "hash_mismatch");
		assert.ok("actual" in tampered);
		assert.equal(tampered.actual, sha("edited"));
	});

	it("refuses a symlinked evidence directory", () => {
		const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "elsewhere-"));
		try {
			fs.symlinkSync(elsewhere, path.join(dir, "evidence"));
			assert.throws(() => storePassage(dir, PASSAGE), /real directory/);
			assert.equal(failedRead(sha("x")).code, "unsafe_directory");
		} finally {
			fs.rmSync(elsewhere, { recursive: true, force: true });
		}
	});

	it("refuses to reuse an existing file whose bytes do not match its name", () => {
		const stored = PASSAGE.replace(/\r\n?/g, "\n");
		const pdir = path.join(dir, "evidence", "passages");
		fs.mkdirSync(pdir, { recursive: true });
		fs.writeFileSync(path.join(pdir, `${sha(stored)}.txt`), "corrupt");
		assert.throws(() => storePassage(dir, PASSAGE), /unusable/);
		assert.deepEqual(
			fs.readdirSync(pdir),
			[`${sha(stored)}.txt`],
			"failed publication leaves no temp file",
		);
	});
});

describe("passages: addClaim", () => {
	beforeEach(() => writeLedger(dir, [claim("r001")]));

	const witness = (
		id: string,
		source: { quote?: string; passage?: string; passage_sha256?: string },
	) =>
		addClaim(dir, {
			id,
			type: "factual",
			topic: "tower",
			content: "Witness",
			evidence: "web",
			source: {
				origin: "example.org",
				witnessed_claim: "r001",
				relationship: "full_support",
				...source,
			},
		});

	it("stores the passage and keeps only digest and quote in claims.json", () => {
		const result = witness("w001", { quote: QUOTE, passage: PASSAGE });
		assert.equal(
			result.status,
			"ok",
			"message" in result ? result.message : undefined,
		);
		assert.ok(result.claim);
		assert.ok(
			typeof result.claim.source === "object" && result.claim.source !== null,
		);
		const digest = sha(PASSAGE.replace(/\r\n?/g, "\n"));
		assert.equal(result.claim.source.passage_sha256, digest);
		assert.equal(result.claim.source.quote, QUOTE);
		const ledger = fs.readFileSync(path.join(dir, "claims.json"), "utf8");
		assert.ok(!ledger.includes("330 metres"), "passage text not in ledger");
		const reuse = witness("w002", {
			quote: "330 metres",
			passage_sha256: digest,
		});
		assert.equal(
			reuse.status,
			"ok",
			"message" in reuse ? reuse.message : undefined,
		);
	});

	function witnessError(source: Parameters<typeof witness>[1]) {
		const result = witness("w001", source);
		assert.equal(result.status, "error");
		assert.ok("message" in result && typeof result.message === "string");
		return result.message;
	}

	it("rejects a quote that is not in the passage, and bad combinations", () => {
		assert.match(
			witnessError({ quote: "built in 1999", passage: PASSAGE }),
			/does not occur/,
		);
		assert.match(witnessError({ passage: PASSAGE }), /quote/);
		assert.match(witnessError({ quote: "  ", passage: PASSAGE }), /empty/);
		assert.match(
			witnessError({
				quote: QUOTE,
				passage: PASSAGE,
				passage_sha256: "0".repeat(64),
			}),
			/not both/,
		);
		assert.match(
			witnessError({ quote: QUOTE, passage_sha256: "0".repeat(64) }),
			/not usable \(missing\)/,
		);
		assert.match(
			witnessError({ quote: QUOTE, passage_sha256: "../../etc/passwd" }),
			/hexadecimal/,
		);
		assert.ok(
			!fs.existsSync(path.join(dir, "evidence")),
			"nothing stored for rejected claims",
		);
	});

	it("is available through the CLI", () => {
		const file = path.join(dir, "passage.txt");
		fs.writeFileSync(file, PASSAGE);
		const out = execFileSync(
			process.execPath,
			[
				BIN,
				"add",
				"--dir",
				dir,
				"--id",
				"w010",
				"--type",
				"factual",
				"--topic",
				"tower",
				"--content",
				"Witness",
				"--source-origin",
				"example.org",
				"--witnessed-claim",
				"r001",
				"--relationship",
				"full_support",
				"--quote",
				QUOTE,
				"--passage-file",
				file,
				"--json",
			],
			{ encoding: "utf8" },
		);
		const result: {
			status: string;
			message?: string;
			claim?: { source?: LedgerSourceFixture };
		} = JSON.parse(out);
		assert.ok(result.claim?.source);
		assert.equal(result.status, "ok", result.message);
		assert.equal(result.claim.source.witnessed_claim, "r001");
		assert.ok(result.claim.source.passage_sha256);
	});
});

describe("passages: compiler audit", () => {
	function sealedWitness(
		id: string,
		target: string,
		quote: string,
		relationship: "full_support" | "partial_support" = "full_support",
	) {
		const digest = storePassage(dir, PASSAGE);
		return claim(id, {
			source: {
				origin: "example.org",
				artifact: null,
				connector: null,
				witnessed_claim: target,
				relationship,
				quote,
				passage_sha256: digest,
			},
		});
	}

	it("leaves winners, statuses, blockers and corroboration unchanged", () => {
		const base = [
			claim("r001", { evidence: "documented", conflicts_with: ["r002"] }),
			claim("r002"),
			claim("r003", { conflicts_with: ["r004"] }),
			claim("r004"),
		];
		writeLedger(dir, base);
		const before = projection(compileDir(dir));
		// Valid passage support for the lower-tier side and both tied sides.
		writeLedger(dir, [
			...base,
			sealedWitness("w001", "r002", QUOTE),
			sealedWitness("w002", "r003", QUOTE),
			sealedWitness("w003", "r004", QUOTE),
		]);
		const after = compileDir(dir);
		const p = projection(after);
		assert.deepEqual(p.resolved, before.resolved);
		assert.deepEqual(p.unresolved, before.unresolved);
		assert.equal(p.status, "blocked");
		assert.equal(after.conflict_graph.resolved[0]?.basis, "tier");
		const tied = after.conflict_support.find((c) => c.claims[0] === "r003");
		assert.ok(tied);
		assert.equal(tied.both_supported, true);
		assert.equal(tied.outcome, "unresolved");
		assert.equal(tied.support.r003?.[0]?.quote, QUOTE);
	});

	it("validates each claim's quote separately when passages are shared", () => {
		for (const order of [
			["w001", "w002"],
			["w002", "w001"],
		] as const) {
			const make = {
				w001: () => sealedWitness("w001", "r001", QUOTE),
				w002: () => sealedWitness("w002", "r001", "not in the passage"),
			};
			writeLedger(dir, [claim("r001"), ...order.map((id) => make[id]())]);
			const c = compileDir(dir);
			assert.equal(c.passage_integrity.w001?.valid, true);
			assert.equal(c.passage_integrity.w002?.reason, "quote_not_found");
			assert.deepEqual(c.distinct_supporting_passages, { r001: 1 });
			assert.ok(c.warnings.some((w) => w.code === "W_PASSAGE_INTEGRITY"));
		}
	});

	it("counts distinct passages, ignoring partial, self and inactive witnesses", () => {
		const other = storePassage(dir, "Another source: completed in 1889.");
		writeLedger(dir, [
			claim("r001"),
			sealedWitness("w001", "r001", QUOTE),
			sealedWitness("w002", "r001", "330 metres"),
			claim("w003", {
				source: {
					origin: "b.org",
					witnessed_claim: "r001",
					relationship: "full_support",
					quote: "completed in 1889",
					passage_sha256: other,
				},
			}),
			sealedWitness("w004", "r001", QUOTE, "partial_support"),
			{ ...sealedWitness("w005", "w005", QUOTE) },
			{ ...sealedWitness("w006", "r001", QUOTE), status: "superseded" },
			sealedWitness("w007", "missing-claim", QUOTE),
		]);
		const c = compileDir(dir);
		assert.deepEqual(c.distinct_supporting_passages, { r001: 2 });
	});

	it("never copies raw passage text into compiled output", () => {
		writeLedger(dir, [
			claim("r001", {
				source: {
					origin: "x",
					quote: "secret text",
					passage: "secret text <script>alert(1)</script>",
				},
			}),
		]);
		const c = compileDir(dir);
		assert.equal(c.passage_integrity.r001?.reason, "raw_passage_in_ledger");
		const out = fs.readFileSync(path.join(dir, "compilation.json"), "utf8");
		assert.ok(!out.includes("<script>"));
		const source = c.resolved_claims[0]?.source;
		assert.ok(source && typeof source === "object");
		assert.equal(source.passage, undefined);
	});

	it("reports malformed records as warnings, not blockers", () => {
		writeLedger(dir, [
			claim("r001", {
				source: { origin: "x", quote: 7, passage_sha256: "0".repeat(64) },
			}),
			claim("r002", { source: { origin: "x", passage_sha256: "zz" } }),
			claim("r003", { source: { origin: "x", quote: "q" } }),
		]);
		const c = compileDir(dir);
		assert.equal(c.status, "ready");
		assert.equal(c.passage_integrity.r001?.reason, "quote_not_string");
		assert.equal(c.passage_integrity.r002?.reason, "quote_missing");
		assert.equal(c.passage_integrity.r003?.reason, "passage_missing");
	});

	it("is deterministic across claim order", () => {
		const claims = [
			claim("r001", { conflicts_with: ["r002"] }),
			claim("r002"),
			sealedWitness("w001", "r001", QUOTE),
			sealedWitness("w002", "r002", QUOTE),
		];
		writeLedger(dir, claims);
		const a = compileDir(dir);
		writeLedger(dir, [...claims].reverse());
		const b = compileDir(dir);
		for (const key of [
			"passage_integrity",
			"distinct_supporting_passages",
			"conflict_support",
		] as const)
			assert.deepEqual(a[key], b[key], key);
		assert.equal(
			a.compilation_certificate.passages_hash,
			b.compilation_certificate.passages_hash,
		);
	});
});

function compilationStatus(dir: string) {
	const result = getStatus(dir);
	assert.equal(result.status, "ok");
	return result.compilation_status;
}

describe("passages: freshness", () => {
	const brief = () =>
		guard(
			dir,
			JSON.stringify({ file_path: path.join(dir, "output", "brief.html") }),
		).allow;

	it("a passage edit, deletion or restoration changes freshness", () => {
		writeLedger(dir, [claim("r001")]);
		const add = addClaim(dir, {
			id: "w001",
			type: "factual",
			topic: "tower",
			content: "Witness",
			source: {
				origin: "example.org",
				witnessed_claim: "r001",
				relationship: "full_support",
				quote: QUOTE,
				passage: PASSAGE,
			},
		});
		assert.equal(add.status, "ok", "message" in add ? add.message : undefined);
		assert.ok(add.claim);
		assert.ok(
			typeof add.claim.source === "object" && add.claim.source !== null,
		);
		compileDir(dir);
		assert.equal(brief(), true);
		assert.notEqual(compilationStatus(dir), "stale");

		const file = path.join(
			dir,
			"evidence",
			"passages",
			`${add.claim.source.passage_sha256}.txt`,
		);
		const original = fs.readFileSync(file);
		fs.writeFileSync(file, "edited");
		assert.equal(brief(), false);
		assert.equal(compilationStatus(dir), "stale");

		// Restoring the exact bytes makes the original compilation current again.
		fs.writeFileSync(file, original);
		assert.equal(brief(), true);
		fs.writeFileSync(file, "edited");

		// Two different invalid states are distinguishable.
		compileDir(dir);
		assert.equal(brief(), true);
		fs.writeFileSync(file, "edited again");
		assert.equal(brief(), false);

		fs.rmSync(file);
		assert.equal(brief(), false);

		// Restoring the exact bytes matches the fresh compilation of that state.
		fs.writeFileSync(file, original);
		compileDir(dir);
		assert.equal(brief(), true);
	});

	it("compilations without a passage fingerprint stay fresh for ledgers without passages", () => {
		writeLedger(dir, [claim("r001")]);
		const c = compileDir(dir);
		delete c.compilation_certificate.passages_hash;
		fs.writeFileSync(path.join(dir, "compilation.json"), JSON.stringify(c));
		assert.notEqual(compilationStatus(dir), "stale");
	});
});

describe("passages: next actions", () => {
	it("routes conflicts with quoted support on both sides to Manual", () => {
		const groups = nextActionsModule.nextActions({
			conflict_graph: {
				resolved: [],
				unresolved: [
					{ claimA: "r001", claimB: "r002" },
					{ claimA: "r003", claimB: "r004" },
				],
			},
			conflict_support: [
				{
					claims: ["r001", "r002"],
					outcome: "unresolved",
					both_supported: true,
				},
				{
					claims: ["r003", "r004"],
					outcome: "unresolved",
					both_supported: false,
				},
			],
			errors: [{ code: "E_CONFLICT", message: "x" }],
		});
		assert.deepEqual(groups.manual[0]?.claim_ids, ["r001", "r002"]);
		assert.deepEqual(groups.auto[0]?.claim_ids, ["r003", "r004"]);
	});

	it("still advises review when the tier already settled a both-supported conflict", () => {
		const groups = nextActionsModule.nextActions({
			conflict_graph: {
				resolved: [{ winner: "r001", loser: "r002" }],
				unresolved: [],
			},
			conflict_support: [
				{ claims: ["r001", "r002"], outcome: "resolved", both_supported: true },
			],
		});
		assert.equal(groups.manual.length, 1);
	});

	it("the compiler's --next view applies the same routing and names both claims", () => {
		const actions = computeNextActions({
			conflict_graph: {
				resolved: [],
				unresolved: [
					{ claimA: "r001", claimB: "r002" },
					{ claimA: "r003", claimB: "r004" },
				],
			},
			conflict_support: [
				{
					claims: ["r001", "r002"],
					outcome: "unresolved",
					both_supported: true,
				},
			],
		});
		const commands = actions.map((a) => [a.priority, a.command]);
		assert.deepEqual(commands.slice(0, 2), [
			["P0-USER", "/resolve r001 r002"],
			["P0-BLOCKER", "/resolve r003 r004"],
		]);
		assert.ok(!actions.some((a) => a.command.includes("undefined")));
	});
});

describe("passages: failure handling", () => {
	afterEach(() => mock.restoreAll());

	const tmpFiles = () =>
		fs
			.readdirSync(path.join(dir, "evidence", "passages"))
			.filter((f) => f.startsWith(".tmp-"));

	it("writes every byte when the OS returns short writes", () => {
		const real = fs.writeSync;
		mock.method(
			fs,
			"writeSync",
			(
				fd: number,
				buf: NodeJS.ArrayBufferView,
				offset: number,
				length: number,
			) => real(fd, buf, offset, Math.min(length, 3)),
		);
		const digest = storePassage(dir, PASSAGE);
		mock.restoreAll();
		assert.equal(readPassage(dir, digest).ok, true);
	});

	it("removes the temporary file when writing or syncing fails", () => {
		for (const name of ["writeSync", "fsyncSync"] as const) {
			mock.method(fs, name, () => {
				throw Object.assign(new Error(`${name} failed`), { code: "EIO" });
			});
			assert.throws(() => storePassage(dir, PASSAGE), /failed/);
			mock.restoreAll();
			assert.deepEqual(tmpFiles(), [], name);
			assert.deepEqual(
				fs.readdirSync(path.join(dir, "evidence", "passages")),
				[],
			);
		}
	});

	it("turns a read error into a warning instead of failing the compile", () => {
		const digest = storePassage(dir, PASSAGE);
		writeLedger(dir, [
			claim("r001", {
				source: { origin: "x", quote: QUOTE, passage_sha256: digest },
			}),
		]);
		mock.method(fs, "readSync", () => {
			throw Object.assign(new Error("read failed"), { code: "EIO" });
		});
		const c = compileDir(dir);
		mock.restoreAll();
		assert.equal(c.passage_integrity.r001?.reason, "unreadable");
		assert.ok(c.warnings.some((w) => w.code === "W_PASSAGE_INTEGRITY"));
	});

	it("fails a write that makes no progress instead of looping", () => {
		mock.method(fs, "writeSync", () => 0);
		assert.throws(() => storePassage(dir, PASSAGE), /no progress/);
		mock.restoreAll();
		assert.deepEqual(tmpFiles(), []);
	});

	it("a close error does not turn a read into an exception", () => {
		const digest = storePassage(dir, PASSAGE);
		mock.method(fs, "closeSync", () => {
			throw Object.assign(new Error("close failed"), { code: "EIO" });
		});
		const result = readPassage(dir, digest);
		mock.restoreAll();
		assert.equal(result.ok, true);
	});

	it("does not read a passage larger than the remaining byte budget", () => {
		const digest = storePassage(dir, PASSAGE);
		const calls = mock.method(fs, "readSync");
		const result = readPassage(dir, digest, 5);
		assert.equal(result.ok, false);
		assert.equal(result.code, "limit_exceeded");
		assert.equal(result.bytes, 0);
		assert.equal(calls.mock.callCount(), 0);
	});
});

describe("passages: review fixes", () => {
	it("keeps a witness's support when it loses a different conflict", () => {
		const digest = storePassage(dir, PASSAGE);
		const sealed = (id: string, target: string, extra: ClaimOverrides = {}) =>
			claim(id, {
				source: {
					origin: "example.org",
					witnessed_claim: target,
					relationship: "full_support",
					quote: QUOTE,
					passage_sha256: digest,
				},
				...extra,
			});
		writeLedger(dir, [
			claim("r001", { conflicts_with: ["r002"] }),
			claim("r002"),
			// w001 loses to the higher-tier x001 during auto-resolution.
			sealed("w001", "r001", { conflicts_with: ["x001"] }),
			claim("x001", { evidence: "documented" }),
			sealed("w002", "r002"),
		]);
		const c = compileDir(dir);
		const pair = c.conflict_support.find(
			(p) => p.claims.join() === "r001,r002",
		);
		assert.ok(pair);
		assert.equal(pair.both_supported, true);
		assert.deepEqual(
			pair.support.r001?.map((x) => x.claim),
			["w001"],
		);
		assert.equal(c.distinct_supporting_passages.r001, 1);
	});

	it("status treats a compilation from another compiler version as stale", () => {
		writeLedger(dir, [claim("r001")]);
		const c = compileDir(dir);
		assert.notEqual(compilationStatus(dir), "stale");
		c.compilation_certificate.compiler_version = "0.2.1";
		fs.writeFileSync(path.join(dir, "compilation.json"), JSON.stringify(c));
		assert.equal(compilationStatus(dir), "stale");
		assert.notEqual(COMPILER_VERSION, "0.2.1");
	});

	it("notices an edited passage even when its quote record is malformed", () => {
		const digest = storePassage(dir, PASSAGE);
		writeLedger(dir, [
			claim("r001", {
				source: { origin: "x", quote: "  ", passage_sha256: digest },
			}),
		]);
		compileDir(dir);
		const brief = () =>
			guard(
				dir,
				JSON.stringify({ file_path: path.join(dir, "output", "b.html") }),
			).allow;
		assert.equal(brief(), true);
		fs.writeFileSync(
			path.join(dir, "evidence", "passages", `${digest}.txt`),
			"x",
		);
		assert.equal(brief(), false);
	});
});
