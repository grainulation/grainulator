#!/usr/bin/env node
import crypto from "node:crypto";
import type { Stats } from "node:fs";
// Separate offline converter: no application loaders, providers or subprocesses.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ConfigOperation,
	ConfigSource,
	ConverterOptions,
	InspectOptions,
	Inventory,
	InventoryEntry,
	JournalOperation,
	LegacyMemoryDocument,
	LegacyRun,
	LockOwner,
	MigrationFailure,
	MigrationJournal,
	MigrationOperation,
	MigrationPlan,
	MigrationResult,
	PlanDraft,
	RecoveryOptions,
	RollbackResult,
	ScanOptions,
	SnapshotOptions,
	TreeOperation,
	UnknownRecord,
} from "./contracts.mjs";

const SCHEMA = "grainulator.migration-plan.v1",
	JOURNAL = "grainulator.migration-journal.v1";
const MAX_ENTRIES = 20_000,
	MAX_BYTES = 256 * 1024 * 1024,
	MAX_FILE = 32 * 1024 * 1024,
	MAX_DOCUMENT = 16 * 1024 * 1024,
	MAX_DEPTH = 64;
function member<T>(items: readonly T[], value: unknown): value is T {
	return (items as readonly unknown[]).includes(value);
}
function integer(value: unknown): value is number {
	return Number.isSafeInteger(value);
}
const OWNER = ".grainulator-migration-owner.json";
const sha = (b: crypto.BinaryLike) =>
	crypto.createHash("sha256").update(b).digest("hex");
const encode = (v: unknown) => Buffer.from(JSON.stringify(v, null, 2) + "\n");
const object = (v: unknown): v is UnknownRecord =>
	v !== null && typeof v === "object" && !Array.isArray(v);
const equal = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);
function fail(message: string): never {
	throw new Error(message);
}
const exists = (f: string) => {
	try {
		fs.lstatSync(f);
		return true;
	} catch (_e) {
		const e = _e as MigrationFailure;
		if (e.code === "ENOENT") return false;
		throw e;
	}
};
const nested = (a: string, b: string) => a === b || b.startsWith(a + path.sep);
function safeAbsolute(input: unknown): string {
	if (typeof input !== "string" || !path.isAbsolute(input))
		fail("An explicit absolute path is required");
	const result = path.normalize(input);
	let current = path.parse(result).root;
	for (const part of result
		.slice(current.length)
		.split(path.sep)
		.filter(Boolean)) {
		current = path.join(current, part);
		if (exists(current) && fs.lstatSync(current).isSymbolicLink())
			fail("Symbolic path components are unsupported: " + current);
	}
	return result;
}
const READ_FLAGS =
	fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
function identity(st: Stats) {
	return [
		st.dev,
		st.ino,
		st.uid,
		st.gid,
		st.mode,
		st.nlink,
		st.size,
		st.mtimeMs,
		st.ctimeMs,
	];
}
function openRegular(
	file: string,
	{ peer, maximum = MAX_FILE, links = 1, expected }: SnapshotOptions = {},
) {
	safeAbsolute(file);
	// Pin the actual referent before inspecting it. NONBLOCK avoids waiting on a
	// raced FIFO; NOFOLLOW refuses a raced symbolic link before it can be read.
	const fd = fs.openSync(file, READ_FLAGS, 0o600);
	try {
		const stat = fs.fstatSync(fd);
		if (!stat.isFile() || stat.size > maximum)
			fail("Expected bounded regular file: " + file);
		if (expected && !equal(identity(stat), identity(expected)))
			fail("Source changed while opening: " + file);
		if (stat.nlink !== links) {
			if (!peer || stat.nlink !== 2)
				fail("Expected regular file without hard links: " + file);
			const other = fs.openSync(peer, READ_FLAGS, 0o600);
			try {
				const counterpart = fs.fstatSync(other);
				if (
					!counterpart.isFile() ||
					counterpart.nlink !== 2 ||
					counterpart.ino !== stat.ino ||
					counterpart.dev !== stat.dev
				)
					fail("Owned hard-link peer changed");
			} finally {
				fs.closeSync(other);
			}
		}
		return { fd, stat };
	} catch (_error) {
		const error = _error as MigrationFailure;
		fs.closeSync(fd);
		throw error;
	}
}
function snapshot(file: string, options: SnapshotOptions = {}) {
	const opened = openRegular(file, options),
		{ fd, stat } = opened;
	try {
		// A file growing during a read cannot cause an unbounded allocation. One
		// extra byte distinguishes a stable EOF from growth beyond the pinned size.
		const buffer = Buffer.alloc(stat.size + 1);
		let length = 0;
		while (length < buffer.length) {
			const count = fs.readSync(
				fd,
				buffer,
				length,
				buffer.length - length,
				length,
			);
			if (!count) break;
			length += count;
		}
		if (
			length !== stat.size ||
			!equal(identity(fs.fstatSync(fd)), identity(stat))
		)
			fail("File changed during snapshot: " + file);
		const current = fs.openSync(file, READ_FLAGS, 0o600);
		try {
			if (!equal(identity(fs.fstatSync(current)), identity(stat)))
				fail("File path changed during snapshot: " + file);
		} finally {
			fs.closeSync(current);
		}
		return { data: buffer.subarray(0, length), stat };
	} finally {
		fs.closeSync(fd);
	}
}
function regular(file: string, peer?: string) {
	const opened = openRegular(file, { peer });
	try {
		return opened.stat;
	} finally {
		fs.closeSync(opened.fd);
	}
}
function bytes(file: string, peer?: string) {
	return snapshot(file, { peer }).data;
}
function jsonAny(file: string): unknown {
	return JSON.parse(String(bytes(file).toString()));
}
function json(file: string): UnknownRecord {
	const value = jsonAny(file);
	if (!object(value)) fail("Expected JSON object: " + file);
	return value;
}
function syncDir(dir: string) {
	const fd = fs.openSync(
		dir,
		fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
		0o600,
	);
	try {
		if (!fs.fstatSync(fd).isDirectory())
			fail("Expected directory for durability fence");
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
}
function writeNew(file: string, data: Buffer, mode = 0o600) {
	safeAbsolute(file);
	const fd = fs.openSync(file, "wx", mode);
	try {
		fs.writeFileSync(fd, data);
		fs.fchmodSync(fd, mode);
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
	syncDir(path.dirname(file));
}
function exclusive(file: string, value: unknown) {
	const data = encode(value);
	if (data.length > MAX_DOCUMENT) fail("Migration document exceeds bounds");
	writeNew(file, data);
}
function atomic(file: string, value: unknown) {
	const data = encode(value);
	if (data.length > MAX_DOCUMENT) fail("Migration journal exceeds bounds");
	const temp = file + "." + crypto.randomUUID() + ".tmp";
	writeNew(temp, data);
	fs.renameSync(temp, file);
	syncDir(path.dirname(file));
}
function mkdir(dir: string, mode = 0o700) {
	fs.mkdirSync(dir, { mode });
	syncDir(path.dirname(dir));
}
function parents(dir: string) {
	if (exists(dir)) {
		safeAbsolute(dir);
		if (!fs.lstatSync(dir).isDirectory()) fail("Parent is not a directory");
		return;
	}
	parents(path.dirname(dir));
	mkdir(dir);
}
function nearest(file: string): string {
	while (!exists(file)) file = path.dirname(file);
	safeAbsolute(file);
	return file;
}
function scan(
	root: string,
	{ exclude = [], peer, ignoreOwner = false }: ScanOptions = {},
): Inventory {
	safeAbsolute(root);
	const entries: Inventory = [],
		seen = new Set();
	let total = 0;
	function walk(file: string, relative: string, depth: number) {
		if (depth > MAX_DEPTH || entries.length >= MAX_ENTRIES)
			fail("Selected migration unit exceeds entry/depth limits");
		const st = fs.lstatSync(file);
		if (st.isSymbolicLink()) fail("Migration refuses symbolic links: " + file);
		if (/(?:^|[\\/])[^\\/]*\.lock(?:$|[\\/])/.test(relative))
			fail("Resolve all writer locks before migration: " + file);
		const key = relative.normalize("NFC").toLowerCase();
		if (seen.has(key)) fail("Case/Unicode-colliding paths");
		seen.add(key);
		if (st.isDirectory()) {
			entries.push({
				path: relative,
				kind: "directory",
				mode: st.mode & 0o777,
			});
			for (const name of fs.readdirSync(file).sort()) {
				const rel = relative ? relative + "/" + name : name;
				if (
					(ignoreOwner && rel === OWNER) ||
					exclude.some((p) => rel === p || rel.startsWith(p + "/"))
				)
					continue;
				walk(path.join(file, name), rel, depth + 1);
			}
		} else {
			const pinned = snapshot(file, {
				peer: peer && path.join(peer, relative),
				expected: st,
			});
			total += pinned.stat.size;
			if (total > MAX_BYTES)
				fail("Selected migration unit exceeds byte limits");
			entries.push({
				path: relative,
				kind: "file",
				mode: pinned.stat.mode & 0o777,
				bytes: pinned.stat.size,
				sha256: sha(pinned.data),
			});
		}
	}
	walk(root, "", 0);
	return entries;
}
function assertInventory(
	root: string,
	expected: Inventory | null,
	options?: ScanOptions,
) {
	if (!exists(root) || !equal(scan(root, options), expected))
		fail("Source or destination changed; inspect again: " + root);
}
function fileInventory(file: string) {
	return exists(file) ? scan(file) : null;
}
function hashFile(file: string) {
	return exists(file) ? sha(bytes(file)) : null;
}
function validateSchema(
	value: unknown,
	kind: string,
): asserts value is UnknownRecord {
	if (!object(value)) fail("Malformed runtime " + kind);
	for (const field of ["schema", "schema_version", "$schema"])
		if (field in value) {
			const allowed = [
				`bean.${kind}.v0`,
				`bean.${kind}/1`,
				`bean.${kind}/2`,
				`grainulator.runtime.${kind}.v1`,
				`urn:grainulator:runtime:${kind}:1`,
				1,
				"1.0",
				`https://github.com/grainulation/bean/schemas/${kind}.schema.json`,
			];
			if (!member(allowed, value[field]))
				fail("Unsupported runtime " + kind + " schema");
		}
}
function validateRuntime(root: string) {
	// Keep the standalone artifact independent of application imports. Contract
	// tests check these declarations through the canonical validation APIs too.
	const safeId = (id: unknown): id is string =>
		typeof id === "string" &&
		/^[A-Za-z0-9._-]{1,128}$/.test(id) &&
		id !== "." &&
		id !== "..";
	const tiers = ["stated", "web", "documented", "tested", "production"];
	const file = path.join(root, "claims.json");
	if (!exists(file)) fail("Runtime claims ledger is required");
	const envelope = jsonAny(file);
	if (!Array.isArray(envelope)) validateSchema(envelope, "claims");
	const claims = Array.isArray(envelope) ? envelope : envelope.claims;
	if (!Array.isArray(claims))
		fail("Runtime claims must be an array or claims envelope");
	const ids = new Set();
	for (const c of claims) {
		if (
			!object(c) ||
			!safeId(c.id) ||
			ids.has(c.id) ||
			!member(
				[
					"constraint",
					"factual",
					"estimate",
					"risk",
					"recommendation",
					"feedback",
				],
				c.type,
			) ||
			typeof c.topic !== "string" ||
			!c.topic.trim() ||
			(c.content !== undefined && typeof c.content !== "string")
		)
			fail("Malformed or duplicate runtime claim");
		ids.add(c.id);
		if (!member(tiers, c.evidence)) fail("Unsupported runtime evidence tier");
		if (
			c.status !== undefined &&
			!member(["active", "superseded", "rejected", "resolved"], c.status)
		)
			fail("Invalid runtime claim status");
		for (const key of ["depends_on", "conflicts_with"])
			if (
				c[key] !== undefined &&
				(!Array.isArray(c[key]) || !c[key].every(safeId))
			)
				fail("Invalid runtime claim " + key);
		if (
			c.tags !== undefined &&
			(!Array.isArray(c.tags) || c.tags.some((x) => typeof x !== "string"))
		)
			fail("Runtime tags must be strings");
		if (
			c.verified_by !== undefined &&
			(!object(c.verified_by) || !safeId(c.verified_by.verifier))
		)
			fail("Invalid runtime verified_by");
		if (
			c.source !== undefined &&
			(!object(c.source) ||
				(c.source.origin !== undefined && typeof c.source.origin !== "string"))
		)
			fail("Invalid runtime claim source");
		if (
			c.resolved_by !== undefined &&
			c.resolved_by !== null &&
			typeof c.resolved_by !== "string"
		)
			fail("Invalid runtime resolved_by");
	}
	const runFile = path.join(root, "run.json");
	if (exists(runFile)) {
		const run = json(runFile) as LegacyRun;
		validateSchema(run, "run");
		for (const field of ["budget", "verification", "oracles", "evidence_bar"])
			if (field in run && !object(run[field]))
				fail("Malformed runtime " + field);
		if (
			run.verification !== undefined &&
			!member(["strict", "compat", "advisory"], run.verification.mode)
		)
			fail("Unknown runtime verification mode");
		if (
			run.budget?.max_rounds !== undefined &&
			(!integer(run.budget.max_rounds) || run.budget.max_rounds < 1)
		)
			fail("Malformed runtime budget");
		if (run.task_id !== undefined && typeof run.task_id !== "string")
			fail("Invalid runtime task id");
		if (
			run.stakes !== undefined &&
			!member(["low", "medium", "high"], run.stakes)
		)
			fail("Invalid runtime stakes");
		for (const key of ["load_bearing", "recommendation"])
			if (
				run.evidence_bar?.[key] !== undefined &&
				!member(tiers, run.evidence_bar[key])
			)
				fail("Invalid runtime evidence bar");
		if (run.mutation_policy !== undefined) {
			if (!object(run.mutation_policy)) fail("Invalid runtime mutation policy");
			for (const key of ["reversible", "destructive"])
				if (
					run.mutation_policy[key] !== undefined &&
					typeof run.mutation_policy[key] !== "string"
				)
					fail("Invalid runtime mutation policy");
		}
		for (const [id, oracle] of Object.entries(run.oracles || {})) {
			const cmd = oracle?.cmd;
			if (
				!safeId(id) ||
				!object(oracle) ||
				!Array.isArray(cmd) ||
				!cmd.length ||
				cmd.some((x) => typeof x !== "string" || !x.length)
			)
				fail("Malformed runtime oracle");
			if (
				oracle.inputs !== undefined &&
				(!Array.isArray(oracle.inputs) ||
					oracle.inputs.some((x) => typeof x !== "string"))
			)
				fail("Malformed oracle inputs");
			if (
				oracle.timeout_ms !== undefined &&
				(!integer(oracle.timeout_ms) || oracle.timeout_ms < 1)
			)
				fail("Invalid oracle timeout");
			if (
				oracle.oracle_digest !== undefined &&
				typeof oracle.oracle_digest !== "string"
			)
				fail("Invalid oracle digest");
			if (
				oracle.trust !== undefined &&
				!member(["dev_oracle", "answer_key"], oracle.trust)
			)
				fail("Invalid oracle trust");
		}
	}
	const stateFile = path.join(root, "state.json");
	if (exists(stateFile)) {
		const state = json(stateFile);
		validateSchema(state, "state");
		if (!("round" in state))
			fail("Runtime temporal state must retain its round counter");
		for (const field of ["round", "dry_rounds"])
			if (field in state && (!integer(state[field]) || state[field] < 0))
				fail("Malformed runtime temporal counter");
		for (const field of ["seen_ids", "superseded_hashes"])
			if (
				field in state &&
				(!Array.isArray(state[field]) ||
					state[field].some((x) => typeof x !== "string"))
			)
				fail("Malformed runtime temporal history");
		if ("claims_hash" in state && typeof state.claims_hash !== "string")
			fail("Malformed runtime claims hash");
		if ("history" in state && !Array.isArray(state.history))
			fail("Malformed runtime history");
	}
}
function validateMemory(root: string) {
	const index = json(path.join(root, "index.json"));
	if (index.version !== 1 || !Array.isArray(index.collections))
		fail("Unsupported memory index version or collections");
	const ids = new Set();
	for (const entry of index.collections) {
		if (
			!object(entry) ||
			typeof entry.id !== "string" ||
			!/^[a-zA-Z0-9_-]+$/.test(entry.id) ||
			ids.has(entry.id.toLowerCase())
		)
			fail("Unsafe, missing or duplicate memory collection ID");
		ids.add(entry.id.toLowerCase());
		const folder = (
			{
				claims: "claims",
				template: "templates",
				templates: "templates",
				pack: "packs",
				packs: "packs",
			} as Record<string, string>
		)[String(entry.type)];
		if (!folder) fail("Unknown memory collection type");
		const file = path.join(root, folder, entry.id + ".json");
		if (!exists(file)) fail("Memory index has a dangling collection reference");
		const data = json(file) as LegacyMemoryDocument;
		if (data.meta?.id !== undefined && data.meta.id !== entry.id)
			fail("Memory index-record ID mismatch");
		if (data.meta?.type !== undefined && data.meta.type !== entry.type)
			fail("Memory index-record type mismatch");
		if (folder === "claims") {
			if (!Array.isArray(data.claims) || data.claims.some((c) => !object(c)))
				fail("Malformed memory claim collection");
			const actual = sha(Buffer.from(JSON.stringify(data.claims)));
			for (const meta of [entry, data.meta || {}]) {
				if (
					meta.hash !== undefined &&
					(typeof meta.hash !== "string" ||
						!/^(?:[a-f0-9]{12}|[a-f0-9]{64})$/.test(meta.hash) ||
						!actual.startsWith(meta.hash))
				)
					fail("Memory collection integrity mismatch");
				if (
					meta.claimCount !== undefined &&
					meta.claimCount !== data.claims.length
				)
					fail("Memory claim count mismatch");
			}
		} else if (folder === "templates") {
			if (
				data.id !== entry.id ||
				typeof data.question !== "string" ||
				(data.seedClaims !== undefined &&
					(!Array.isArray(data.seedClaims) ||
						data.seedClaims.some((c) => !object(c))))
			)
				fail("Malformed memory template");
			if (
				entry.claimCount !== undefined &&
				entry.claimCount !== (data.seedClaims || []).length
			)
				fail("Memory template count mismatch");
		} else {
			if (!Array.isArray(data.claims) || data.claims.some((c) => !object(c)))
				fail("Malformed memory pack");
			const actual = sha(Buffer.from(JSON.stringify(data.claims)));
			for (const meta of [entry, data]) {
				if (
					meta.hash !== undefined &&
					(typeof meta.hash !== "string" ||
						!/^(?:[a-f0-9]{12}|[a-f0-9]{64})$/.test(meta.hash) ||
						!actual.startsWith(meta.hash))
				)
					fail("Memory pack integrity mismatch");
				if (
					meta.claimCount !== undefined &&
					meta.claimCount !== data.claims.length
				)
					fail("Memory pack count mismatch");
			}
		}
	}
}
function validateManifest(file: string) {
	const v = json(file),
		strings = (a: unknown): a is string[] =>
			Array.isArray(a) && a.every((x) => typeof x === "string");
	if (
		v.schema_version !== "1.0" ||
		!object(v.topics) ||
		!object(v.files) ||
		!object(v.sprints)
	)
		fail("Unsupported derived manifest; regenerate deliberately");
	for (const topic of Object.values(v.topics))
		if (
			!object(topic) ||
			!strings(topic.claims) ||
			!strings(topic.files) ||
			typeof topic.sprint !== "string" ||
			!member(
				["stated", "web", "documented", "tested", "production"],
				topic.evidence_level,
			)
		)
			fail("Malformed derived topic map");
	for (const entry of Object.values(v.files))
		if (
			!object(entry) ||
			!strings(entry.topics) ||
			typeof entry.type !== "string"
		)
			fail("Malformed derived file map");
	for (const entry of Object.values(v.sprints))
		if (
			!object(entry) ||
			(entry.path !== undefined && typeof entry.path !== "string")
		)
			fail("Malformed derived sprint map");
}
function configOutput(op: ConfigOperation) {
	const result = op.destination_inventory
		? json(op.destination)
		: { schema_version: 1 };
	if (result.schema_version !== 1) fail("Unsupported canonical config version");
	for (const s of op.sources) {
		const value = json(s.path);
		if (s.section in result && !equal(result[s.section], value))
			fail("Contradictory canonical section; explicit reconciliation required");
		result[s.section] = value;
	}
	return encode(result);
}
function tree(
	source: string,
	destination: string,
	kind: TreeOperation["kind"],
	exclude: string[] = [],
): TreeOperation | null {
	if (!exists(source)) return null;
	if (exists(destination))
		fail(
			"Destination already exists; stores and ledgers are never merged: " +
				destination,
		);
	if (!fs.lstatSync(source).isDirectory()) fail("Expected source directory");
	// Bound only the selected unit before decoding. Unselected cache is neither
	// read nor copied; an explicit cache operation gets its own bounded scan.
	const all = scan(source, { exclude });
	if (kind === "runtime") validateRuntime(source);
	if (kind === "memory") validateMemory(source);
	if (
		kind !== "runtime" &&
		all.some((e) =>
			[
				OWNER,
				...(kind === "evidence"
					? ["remote-migration.json", "manifest-migration.json"]
					: []),
			].includes(e.path),
		)
	)
		fail("Legacy source contains a reserved canonical migration control file");
	return {
		kind,
		source,
		destination,
		source_inventory: all,
		copy_inventory: all,
		exclude,
		destination_inventory: null,
	};
}
export function inspectMigration({
	project: projectInput,
	memorySource,
	memoryDestination,
	cacheSource,
	cacheDestination,
}: InspectOptions = {}) {
	const project = safeAbsolute(projectInput);
	if (!fs.lstatSync(project).isDirectory()) fail("Project must be a directory");
	const operations: MigrationOperation[] = [],
		sources: ConfigSource[] = [];
	for (const [name, section] of [
		["wheat.config.json", "evidence"],
		["orchard.json", "orchestration"],
	] as const) {
		const file = path.join(project, name);
		if (exists(file)) {
			json(file);
			sources.push({ path: file, section, sha256: hashFile(file) });
		}
	}
	if (sources.length) {
		const op = {
			kind: "config",
			sources,
			destination: path.join(project, "grainulator.config.json"),
		} as ConfigOperation;
		op.destination_inventory = fileInventory(op.destination);
		op.output_mode = 0o600;
		op.output_sha256 = sha(configOutput(op));
		operations.push(op);
	}
	const manifest = path.join(project, "wheat-manifest.json");
	if (exists(manifest)) validateManifest(manifest);
	const legacyRemote = sources
		.filter((s) =>
			/confluence|spaceKey|space_key|siteUrl|site_url/.test(
				JSON.stringify(json(s.path)),
			),
		)
		.map((s) => ({ path: s.path, sha256: s.sha256 }));
	let evidence = tree(
		path.join(project, ".wheat"),
		path.join(project, ".grainulator/evidence"),
		"evidence",
	);
	if (evidence || exists(manifest) || legacyRemote.length) {
		evidence ||= {
			kind: "evidence",
			source: null,
			destination: path.join(project, ".grainulator/evidence"),
			source_inventory: null,
			copy_inventory: [],
			destination_inventory: null,
		};
		if (exists(evidence.destination))
			fail("Destination already exists; evidence is never merged");
		if (exists(manifest)) {
			if (
				evidence.source &&
				exists(path.join(evidence.source, "manifest.json"))
			)
				fail(
					"Root manifest collides with existing evidence manifest; reconcile deliberately",
				);
			evidence.manifest = { path: manifest, inventory: scan(manifest) };
		}
		evidence.legacy_remote = legacyRemote;
		operations.push(evidence);
	}
	const runtime = tree(
		path.join(project, ".bean"),
		path.join(project, ".grainulator/runtime"),
		"runtime",
	);
	if (runtime) operations.push(runtime);
	for (const [kind, source, destination] of [
		["memory", memorySource, memoryDestination],
		["cache", cacheSource, cacheDestination],
	] as const) {
		if (Boolean(source) !== Boolean(destination))
			fail("Select both explicit source and destination for " + kind);
		if (source) {
			const op = tree(
				safeAbsolute(source),
				safeAbsolute(destination),
				kind,
				kind === "memory" ? ["cache"] : [],
			);
			if (!op) fail("Selected source does not exist");
			operations.push(op);
		}
	}
	if (!operations.length)
		fail("No selected legacy data found; nothing was changed");
	const marker = receiptPath(project);
	if (exists(marker) && json(marker).state !== "rolled-back")
		fail("Existing migration receipt: use verify/recover for its transaction");
	const plan: PlanDraft = {
		schema: SCHEMA,
		converter_version: "3.0.0",
		project,
		operations,
		previous_marker_inventory: fileInventory(marker),
		conditions: {
			writers_must_be_stopped: true,
			network: "none",
			execute_commands: false,
			source_removal: false,
			cross_device: "refused before activation",
			memory_cache:
				"cache subtree excluded from memory; select cache separately",
			immutable_history:
				"Original bytes remain unchanged; receipts require independent verification.",
			runtime_live_mode: "0700; exact source modes retained in inert history",
		},
	};
	plan.plan_sha256 = sha(encode(plan));
	validatePlan(plan);
	return plan;
}
function validatePlan(plan: unknown): asserts plan is MigrationPlan {
	if (
		!object(plan) ||
		plan.schema !== SCHEMA ||
		plan.converter_version !== "3.0.0" ||
		!Array.isArray(plan.operations) ||
		!plan.operations.length ||
		encode(plan).length > MAX_DOCUMENT
	)
		fail("Unsupported or over-bound migration plan");
	const { plan_sha256, ...body } = plan;
	if (plan_sha256 !== sha(encode(body))) fail("Plan changed after inspection");
	const project = safeAbsolute(plan.project);
	const selected = [],
		destinations = [];
	for (const op of plan.operations) {
		if (!member(["config", "evidence", "runtime", "memory", "cache"], op.kind))
			fail("Unknown operation");
		safeAbsolute(op.destination);
		destinations.push(op.destination);
		if (op.kind === "config") {
			if (op.destination !== path.join(project, "grainulator.config.json"))
				fail("Invalid config destination");
			for (const s of op.sources) {
				if (
					!member(["evidence", "orchestration"], s.section) ||
					s.path !==
						path.join(
							project,
							s.section === "evidence" ? "wheat.config.json" : "orchard.json",
						)
				)
					fail("Invalid config source");
				selected.push({ path: s.path, kind: op.kind, source: true });
			}
		} else {
			if (
				member(["runtime", "evidence"], op.kind) &&
				(op.destination !== path.join(project, ".grainulator", op.kind) ||
					(op.source &&
						op.source !==
							path.join(project, op.kind === "runtime" ? ".bean" : ".wheat")))
			)
				fail("Invalid project data mapping");
			if (op.source) {
				safeAbsolute(op.source);
				selected.push({ path: op.source, kind: op.kind, source: true });
			}
			if (op.manifest) {
				if (
					op.kind !== "evidence" ||
					op.manifest.path !== path.join(project, "wheat-manifest.json")
				)
					fail("Invalid manifest mapping");
				selected.push({
					path: op.manifest.path,
					kind: "manifest",
					source: true,
				});
			}
		}
		selected.push({ path: op.destination, kind: op.kind, source: false });
	}
	for (let i = 0; i < selected.length; i++)
		for (let j = i + 1; j < selected.length; j++) {
			const a = selected[i]!,
				b = selected[j]!;
			if (!(nested(a.path, b.path) || nested(b.path, a.path))) continue;
			if (
				a.source &&
				b.source &&
				((a.kind === "memory" &&
					b.kind === "cache" &&
					nested(path.join(a.path, "cache"), b.path)) ||
					(b.kind === "memory" &&
						a.kind === "cache" &&
						nested(path.join(b.path, "cache"), a.path)))
			)
				continue;
			fail("Overlapping migration source/destination selections");
		}
	for (const file of destinations)
		if (
			fs.statSync(nearest(path.dirname(file))).dev !== fs.statSync(project).dev
		)
			fail(
				"Cross-device migration is unsupported; choose a same-device destination before activation",
			);
	for (const item of selected)
		if (
			nested(path.join(project, ".grainulator-migrations"), item.path) ||
			nested(item.path, path.join(project, ".grainulator-migrations"))
		)
			fail("Selected path overlaps transaction storage");
}
function checkSources(plan: MigrationPlan) {
	for (const op of plan.operations) {
		if (op.kind === "config") {
			for (const s of op.sources)
				if (hashFile(s.path) !== s.sha256) fail("Configuration source changed");
		} else if (op.source)
			assertInventory(op.source, op.source_inventory, {
				exclude: op.exclude || [],
			});
		if (op.manifest) assertInventory(op.manifest.path, op.manifest.inventory);
	}
}
function checkDestinations(plan: MigrationPlan) {
	for (const op of plan.operations) {
		if (op.kind === "config") {
			if (!equal(fileInventory(op.destination), op.destination_inventory))
				fail("Canonical config changed");
		} else if (exists(op.destination))
			fail("Destination appeared after inspection: " + op.destination);
	}
}
function copyFile(source: string, destination: string, entry: InventoryEntry) {
	const data = bytes(source);
	if (sha(data) !== entry.sha256) fail("Source changed during copy");
	writeNew(destination, data, entry.mode);
}
function copyTree(source: string, destination: string, inventory: Inventory) {
	mkdir(destination);
	for (const entry of inventory) {
		if (!entry.path) continue;
		const target = path.join(destination, entry.path);
		if (entry.kind === "directory") mkdir(target);
		else copyFile(path.join(source, entry.path), target, entry);
	}
	// Staging directories stay private and writable. Desired source modes are
	// recorded separately and applied to newly owned canonical directories only.
	for (const entry of [...inventory].reverse())
		if (entry.kind === "directory") syncDir(path.join(destination, entry.path));
}
function stagedInventory(
	op: MigrationOperation,
	stage: string,
	transaction: string,
) {
	const desired = new Map();
	for (const entry of op.copy_inventory || [])
		if (entry.kind === "directory") {
			const relative =
				op.kind === "runtime"
					? ["migration-history-" + transaction, entry.path]
							.filter(Boolean)
							.join("/")
					: entry.path;
			desired.set(relative, entry.mode);
		}
	return scan(stage).map((entry) =>
		entry.kind === "directory" && desired.has(entry.path)
			? { ...entry, mode: desired.get(entry.path) }
			: entry,
	);
}
function assertStaged(stage: string, expected: Inventory) {
	const actual = scan(stage).map((entry) =>
		entry.kind === "directory"
			? { ...entry, mode: expected.find((e) => e.path === entry.path)?.mode }
			: entry,
	);
	if (!equal(actual, expected)) fail("Staging contents changed");
}
function convertRuntime(
	source: string,
	stage: string,
	transaction: string,
	inventory: Inventory,
) {
	mkdir(stage);
	const history = "migration-history-" + transaction;
	copyTree(source, path.join(stage, history), inventory);
	for (const name of ["claims.json", "run.json", "state.json"])
		if (exists(path.join(source, name))) {
			const original = jsonAny(path.join(source, name));
			if (object(original))
				for (const field of ["schema", "schema_version", "$schema"])
					if (field in original) {
						original[field] =
							field === "$schema"
								? `urn:grainulator:runtime:${name.slice(0, -5)}:1`
								: `grainulator.runtime.${name.slice(0, -5)}.v1`;
					}
			writeNew(
				path.join(stage, name),
				encode(original),
				fs.statSync(path.join(source, name)).mode & 0o777,
			);
		}
	const run = exists(path.join(source, "run.json"))
			? (json(path.join(source, "run.json")) as LegacyRun)
			: {},
		all = Object.keys(run.oracles || {}),
		legacy = all.filter((id) =>
			/\bbean-(?:check|run|verify|hook|lessons)\b|\.bean(?:[\\/]|$)/.test(
				JSON.stringify(run.oracles![id]),
			),
		);
	exclusive(path.join(stage, "migration-required.json"), {
		schema: "grainulator.runtime.migration.v1",
		state: "verification-required",
		transaction,
		history,
		oracle_bindings_requiring_review: all,
		legacy_path_oracles: legacy,
		reason:
			"Exact legacy controls, receipts, lessons and unknown files are inert history. No enrollment or verification was performed.",
	});
}
function remoteMarker(source: string | null, stage: string, op: TreeOperation) {
	const sync = [];
	for (const entry of op.copy_inventory || [])
		if (
			entry.kind === "file" &&
			path.basename(entry.path) === "sync-state.json"
		)
			sync.push({
				source_relative_path: entry.path,
				sha256: entry.sha256,
				state: json(path.join(source!, entry.path)),
			});
	const pages: (UnknownRecord & {
		pageId: string;
		format: string;
		source_relative_path: string;
		scope: string[];
	})[] = [];
	let ambiguity = false;
	for (const record of sync) {
		const start = pages.length;
		const visit = (value: unknown, scope: string[] = []) => {
			if (!object(value) && !Array.isArray(value)) return;
			if (
				object(value) &&
				(("pages" in value &&
					(!object(value.pages) || Object.keys(value.pages).length === 0)) ||
					(("lastHash" in value || "lastSyncTimestamp" in value) &&
						!object(value.pages)))
			)
				ambiguity = true;
			if (object(value) && ("pageId" in value || "page_id" in value)) {
				const id = value.pageId ?? value.page_id;
				if (typeof id === "string" && id)
					pages.push({
						...value,
						pageId: id,
						format: "snapshot",
						source_relative_path: record.source_relative_path,
						scope: [...scope],
					});
				else ambiguity = true;
			}
			for (const [key, child] of Object.entries(value))
				if (object(child) || Array.isArray(child))
					visit(child, [...scope, key]);
		};
		visit(record.state);
		if (pages.length === start) ambiguity = true;
	}
	if (new Set(pages.map((p) => p.pageId)).size !== pages.length)
		ambiguity = true;
	if (sync.length || op.legacy_remote?.length)
		exclusive(path.join(stage, "remote-migration.json"), {
			schema: "grainulator.remote-migration.v1",
			state: "pending",
			ambiguity: ambiguity || sync.length === 0,
			missing_sync_map: sync.length === 0,
			legacy_config_sources: op.legacy_remote || [],
			sync_sources: sync,
			pages,
		});
}
function receiptPath(project: string) {
	return path.join(project, ".grainulator/migration.json");
}
function save(j: MigrationJournal) {
	atomic(path.join(j.transaction_directory, "journal.json"), j);
}
function load(directory: string): MigrationJournal {
	directory = safeAbsolute(directory);
	const j = json(path.join(directory, "journal.json")) as MigrationJournal;
	validatePlan(j.plan);
	if (
		j.schema !== JOURNAL ||
		j.transaction_directory !== directory ||
		!/^[0-9a-f-]{36}$/.test(j.transaction) ||
		directory !==
			path.join(j.plan.project, ".grainulator-migrations", j.transaction)
	)
		fail("Invalid migration journal");
	return j;
}
function crash(name: string) {
	if (process.env.GRAINULATOR_MIGRATION_TEST_CRASH === name)
		process.kill(process.pid, "SIGKILL");
}
function lockRoots(plan: MigrationPlan) {
	return [
		...new Set([
			plan.project,
			...plan.operations
				.flatMap((op) => [
					op.source,
					op.destination,
					...(op.sources || []).map((s) => s.path),
					op.manifest?.path,
				])
				.filter((value): value is string => Boolean(value)),
		]),
	].sort();
}
function readLock(file: string, original = file) {
	const pinned = snapshot(file, { links: 2, maximum: 8192 }),
		st = pinned.stat;
	if (
		!st.isFile() ||
		st.nlink !== 2 ||
		st.size > 8192 ||
		st.uid !== process.getuid!() ||
		(st.mode & 0o777) !== 0o600
	)
		fail("Unknown or uncertain writer lock: " + file);
	const data = pinned.data,
		owner = JSON.parse(String(data.toString())) as LockOwner;
	if (
		owner.schema !== "grainulator.offline-lock.v2" ||
		!integer(owner.pid) ||
		owner.pid <= 0 ||
		!/^[a-f0-9-]{36}$/.test(owner.transaction) ||
		!/^[a-f0-9-]{36}$/.test(owner.token) ||
		owner.lock_path !== original ||
		typeof owner.project !== "string" ||
		typeof owner.host !== "string" ||
		!/^[a-f0-9]{64}$/.test(owner.plan_sha256)
	)
		fail("Unknown writer lock ownership");
	const peer = original + ".owner-" + owner.transaction + "-" + owner.token;
	if (owner.owner_file !== peer) fail("Writer lock owner path changed");
	const proof = snapshot(peer, { links: 2, maximum: 8192, expected: st });
	if (!equal(identity(proof.stat), identity(st)) || !proof.data.equals(data))
		fail("Writer lock owner proof changed");
	return { owner, hash: sha(data) };
}
function deadOwner(owner: LockOwner) {
	try {
		process.kill(owner.pid, 0);
		return false;
	} catch (_e) {
		const e = _e as MigrationFailure;
		return e.code === "ESRCH";
	}
}
function recoveryBinding(plan: MigrationPlan, transaction: string) {
	const binding = path.join(plan.project, ".grainulator-migration.lock");
	const candidates = exists(binding)
		? [binding]
		: fs
				.readdirSync(plan.project)
				.filter((name) =>
					name.startsWith(path.basename(binding) + ".recovered-"),
				)
				.slice(0, MAX_ENTRIES)
				.map((name) => path.join(plan.project, name));
	return candidates.some((file) => {
		const { owner } = readLock(file, binding);
		return (
			owner.transaction === transaction &&
			owner.plan_sha256 === plan.plan_sha256 &&
			owner.project === plan.project &&
			owner.host === os.hostname() &&
			deadOwner(owner)
		);
	});
}
function locks(
	plan: MigrationPlan,
	transaction: string,
	{ recoverLocks = false }: RecoveryOptions = {},
) {
	const registry = path.join(
		fs.realpathSync(os.tmpdir()),
		"grainulator-offline-locks-" + process.getuid!(),
	);
	// Exclusive creation establishes the private shared fence, while EEXIST
	// requires validating the existing directory through its no-follow fd.
	try {
		fs.mkdirSync(registry, { mode: 0o700 });
		syncDir(path.dirname(registry));
	} catch (_e) {
		const e = _e as MigrationFailure;
		if (e.code !== "EEXIST") throw e;
	}
	const registryFD = fs.openSync(
		registry,
		fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
		0o600,
	);
	try {
		const st = fs.fstatSync(registryFD);
		if (
			!st.isDirectory() ||
			st.uid !== process.getuid!() ||
			(st.mode & 0o077) !== 0
		)
			fail("Unsafe shared lock registry");
	} finally {
		fs.closeSync(registryFD);
	}
	// Publish a complete project/plan recovery binding FIRST, then acquire all
	// shared fences in stable order. No global lock can outlive a missing binding.
	const paths = [
			path.join(plan.project, ".grainulator-migration.lock"),
			...[
				path.join(registry, "all-offline-converters"),
				...lockRoots(plan).map((root) =>
					path.join(registry, sha(Buffer.from(root))),
				),
			].sort(),
		],
		held: { file: string; hash: string }[] = [];
	const release = () => {
		for (const item of [...held].reverse())
			if (exists(item.file)) {
				const proof = readLock(item.file);
				if (proof.hash !== item.hash)
					fail("Writer lock ownership changed during release");
				fs.unlinkSync(item.file);
				fs.unlinkSync(proof.owner.owner_file);
				syncDir(path.dirname(item.file));
			}
	};
	try {
		for (const [index, file] of paths.entries()) {
			if (exists(file)) {
				const { owner, hash } = readLock(file);
				if (
					!recoverLocks ||
					owner.transaction !== transaction ||
					owner.plan_sha256 !== plan.plan_sha256 ||
					owner.project !== plan.project ||
					owner.host !== os.hostname() ||
					!deadOwner(owner)
				)
					fail(
						"Writer lock held or uncertain; explicit dead-owner recovery for transaction " +
							owner.transaction +
							" required: " +
							file,
					);
				if (readLock(file).hash !== hash || !deadOwner(owner))
					fail("Writer lock ownership changed");
				fs.renameSync(file, file + ".recovered-" + crypto.randomUUID());
				syncDir(path.dirname(file));
			}
			crash("lock-" + index + ":before-owner");
			const token = crypto.randomUUID(),
				ownerFile = file + ".owner-" + transaction + "-" + token;
			const owner = {
				schema: "grainulator.offline-lock.v2",
				pid: process.pid,
				host: os.hostname(),
				project: plan.project,
				transaction,
				plan_sha256: plan.plan_sha256,
				token,
				lock_path: file,
				owner_file: ownerFile,
			};
			// Complete bytes and owner proof are durable before the lock becomes visible.
			// Both paths share a parent, so publication is an atomic no-replace link.
			exclusive(ownerFile, owner);
			crash("lock-" + index + ":owner-prepared");
			try {
				fs.linkSync(ownerFile, file);
			} catch (_e) {
				const e = _e as MigrationFailure;
				fs.unlinkSync(ownerFile);
				syncDir(path.dirname(file));
				throw e;
			}
			syncDir(path.dirname(file));
			held.push({ file, hash: sha(encode(owner)) });
			crash("lock-" + index + ":published");
		}
		return release;
	} catch (_e) {
		const e = _e as MigrationFailure;
		release();
		throw e;
	}
}
function descriptor(file: string, peer?: string) {
	return exists(file) ? scan(file, { peer }) : null;
}
function sameInode(a: string, b: string) {
	return (
		exists(a) &&
		exists(b) &&
		fs.statSync(a).ino === fs.statSync(b).ino &&
		fs.statSync(a).dev === fs.statSync(b).dev
	);
}
function transition(
	j: MigrationJournal,
	key: string,
	target: string,
	data: Buffer,
	before: Inventory | null,
	mode = 0o600,
) {
	let tr = j.transitions[key];
	const stage = path.join(
			j.transaction_directory,
			"staged",
			"transition-" + key,
		),
		retired = path.join(
			j.transaction_directory,
			"backups",
			"transition-" + key,
		);
	if (!tr) {
		tr = j.transitions[key] = {
			target,
			before,
			after: [
				{ path: "", kind: "file", mode, bytes: data.length, sha256: sha(data) },
			],
			state: "intent",
		};
		save(j);
		crash(key + ":after-intent");
	} else if (tr.target !== target) fail("Invalid transition target");
	if (tr.state === "installed") {
		assertInventory(target, tr.after);
		return tr.after;
	}
	if (
		!exists(stage) &&
		((tr.before && !exists(retired)) ||
			!equal(fileInventoryIfFile(target), tr.after))
	)
		writeNew(stage, data, mode);
	if (exists(stage)) assertInventory(stage, tr.after, { peer: target });
	if (tr.before) {
		if (exists(retired)) assertInventory(retired, tr.before);
		else {
			assertInventory(target, tr.before);
			fs.renameSync(target, retired);
			syncDir(path.dirname(target));
			syncDir(path.dirname(retired));
			assertInventory(retired, tr.before);
			crash(key + ":after-retire");
		}
	} else if (exists(retired)) fail("Unexpected transition preimage");
	if (exists(target)) {
		if (!equal(descriptor(target, stage), tr.after))
			fail("Destination changed during guarded replacement");
		if (
			tr.state === "intent" &&
			!tr.before &&
			!sameInode(stage, target) &&
			exists(stage)
		)
			fail("Destination appeared during replacement");
	} else {
		assertInventory(stage, tr.after);
		fs.linkSync(stage, target);
		syncDir(path.dirname(target));
		crash(key + ":after-install");
	}
	if (exists(stage)) {
		if (!sameInode(stage, target)) fail("Transition ownership changed");
		fs.unlinkSync(stage);
		syncDir(path.dirname(stage));
	}
	tr.state = "installed";
	save(j);
	assertInventory(target, tr.after);
	return tr.after;
}
function compareMarker(j: MigrationJournal) {
	if (!equal(fileInventory(receiptPath(j.plan.project)), j.marker_inventory))
		fail("Migration receipt changed; reconciliation required");
}
function markerValue(j: MigrationJournal, state: string) {
	return {
		schema: "grainulator.migration.v1",
		state,
		transaction: j.transaction,
		plan_sha256: j.plan.plan_sha256,
		transaction_directory: j.transaction_directory,
		enrollment: "not-performed",
		remote: "not-performed",
	};
}
function reconcileMarker(j: MigrationJournal) {
	if (j.marker_transition) {
		const tr = j.transitions[j.marker_transition];
		if (tr) {
			const data = encode(
				markerValue(j, j.marker_transition.slice("marker-".length)),
			);
			j.marker_inventory = transition(
				j,
				j.marker_transition,
				receiptPath(j.plan.project),
				data,
				tr.before,
			);
			save(j);
		}
	}
	compareMarker(j);
}
function marker(j: MigrationJournal, state: string) {
	parents(path.dirname(receiptPath(j.plan.project)));
	const key = "marker-" + state;
	if (j.marker_transition !== key) {
		compareMarker(j);
		j.marker_transition = key;
		save(j);
	}
	const value = markerValue(j, state);
	crash(key + ":before");
	j.marker_inventory = transition(
		j,
		key,
		receiptPath(j.plan.project),
		encode(value),
		j.marker_inventory,
	);
	crash(key + ":after");
	save(j);
}
function stageAll(j: MigrationJournal) {
	checkSources(j.plan);
	checkDestinations(j.plan);
	// Probe the requested parent directories before activating any operation.
	// This catches unsupported hard links, unwritable parents and device changes.
	for (const op of j.plan.operations) {
		const parent = path.dirname(op.destination);
		parents(parent);
		if (fs.statSync(parent).dev !== fs.statSync(j.transaction_directory).dev)
			fail("Cross-device migration is unsupported before activation");
		const probe = path.join(parent, ".grainulator-probe-" + j.transaction),
			linked = probe + "-link";
		writeNew(probe, Buffer.from(j.transaction));
		try {
			fs.linkSync(probe, linked);
			syncDir(parent);
		} finally {
			if (exists(linked) && sameInode(probe, linked)) fs.unlinkSync(linked);
			fs.unlinkSync(probe);
			syncDir(parent);
		}
	}
	for (let i = 0; i < j.plan.operations.length; i++) {
		const op = j.plan.operations[i]!,
			stage = path.join(j.transaction_directory, "staged", String(i));
		if (exists(stage))
			fail(
				"Preparation interrupted; roll back the preserved transaction explicitly",
			);
		if (op.kind === "config") {
			if (op.destination_inventory)
				copyFile(
					op.destination,
					path.join(j.transaction_directory, "backups", String(i)),
					op.destination_inventory[0]!,
				);
			const data = configOutput(op);
			if (sha(data) !== op.output_sha256) fail("Config conversion changed");
			writeNew(stage, data);
		} else if (op.kind === "runtime")
			convertRuntime(op.source!, stage, j.transaction, op.copy_inventory);
		else {
			if (op.source) copyTree(op.source, stage, op.copy_inventory);
			else mkdir(stage);
			if (op.manifest) {
				copyFile(
					op.manifest.path,
					path.join(stage, "manifest.json"),
					op.manifest.inventory[0]!,
				);
				exclusive(path.join(stage, "manifest-migration.json"), {
					schema: "grainulator.manifest-migration.v1",
					source: "wheat-manifest.json",
					sha256: op.manifest.inventory[0]!.sha256,
					disposition:
						"exact derived bytes retained; historical attestations not renewed",
				});
			}
			if (op.kind === "evidence") remoteMarker(op.source, stage, op);
		}
		j.operations.push({
			state: "staged",
			inventory: stagedInventory(op, stage, j.transaction),
			backup_inventory: op.destination_inventory,
		});
		save(j);
	}
	checkSources(j.plan);
	parents(path.dirname(receiptPath(j.plan.project)));
	marker(j, "in-progress");
	j.state = "staged";
	save(j);
	crash("after-stage");
}
function ownedTree(j: MigrationJournal, i: number) {
	const dest = j.plan.operations[i]!.destination,
		r = j.operations[i]!;
	if (exists(path.join(dest, OWNER))) {
		const owner = json(path.join(dest, OWNER));
		if (
			owner.transaction !== j.transaction ||
			owner.operation !== i ||
			owner.token !== r.token
		)
			fail("Destination reservation belongs to another writer");
	} else if (r.state !== "finalizing" && r.state !== "committed")
		fail(
			"Destination lacks its owned reservation; preserve it for explicit reconciliation",
		);
	if (r.inode && fs.statSync(dest).ino !== r.inode)
		fail("Destination reservation changed");
}
function partialInventory(j: MigrationJournal, i: number) {
	const op = j.plan.operations[i]!,
		r = j.operations[i]!,
		stage = path.join(j.transaction_directory, "staged", String(i));
	ownedTree(j, i);
	const actual = scan(op.destination, { peer: stage, ignoreOwner: true });
	for (const entry of actual) {
		const expected = r.inventory.find((e) => e.path === entry.path);
		if (
			!expected ||
			!equal(
				{
					...entry,
					mode: entry.kind === "directory" ? expected.mode : entry.mode,
				},
				expected,
			)
		)
			fail("Destination changed during promotion");
	}
	return actual;
}
function promoteTree(j: MigrationJournal, i: number) {
	const op = j.plan.operations[i]!,
		r = j.operations[i]!,
		stage = path.join(j.transaction_directory, "staged", String(i));
	if (r.state === "staged") {
		if (exists(op.destination)) fail("Destination appeared after staging");
		assertStaged(stage, r.inventory);
		r.state = "promoting";
		r.token = crypto.randomUUID();
		save(j);
		crash("promotion-" + i + ":before");
		parents(path.dirname(op.destination));
		mkdir(op.destination);
		exclusive(path.join(op.destination, OWNER), {
			transaction: j.transaction,
			operation: i,
			token: r.token,
		});
		r.inode = fs.statSync(op.destination).ino;
		save(j);
		crash("promotion-" + i + ":reserved");
	} else if (!exists(op.destination)) {
		if (r.inode) fail("Owned destination is missing");
		mkdir(op.destination);
		exclusive(path.join(op.destination, OWNER), {
			transaction: j.transaction,
			operation: i,
			token: r.token,
		});
		r.inode = fs.statSync(op.destination).ino;
		save(j);
	}
	partialInventory(j, i);
	for (const entry of r.inventory) {
		if (!entry.path) continue;
		const target = path.join(op.destination, entry.path),
			from = path.join(stage, entry.path);
		if (entry.kind === "directory") {
			if (!exists(target)) mkdir(target);
		} else if (!exists(target)) {
			regular(from);
			fs.linkSync(from, target);
			syncDir(path.dirname(target));
		}
	}
	const actual = scan(op.destination, { peer: stage, ignoreOwner: true }),
		expected = r.inventory;
	if (
		!equal(
			actual.map((e) =>
				e.kind === "directory"
					? { ...e, mode: expected.find((x) => x.path === e.path)!.mode }
					: e,
			),
			expected,
		)
	)
		fail("Promoted contents differ from staged inventory");
	r.state = "finalizing";
	save(j);
	crash("promotion-" + i + ":after");
	for (const entry of expected)
		if (entry.kind === "file") {
			const from = path.join(stage, entry.path),
				to = path.join(op.destination, entry.path);
			if (exists(from) && sameInode(from, to)) {
				fs.unlinkSync(from);
				syncDir(path.dirname(from));
			}
		}
	if (exists(path.join(op.destination, OWNER))) {
		fs.unlinkSync(path.join(op.destination, OWNER));
		syncDir(op.destination);
	}
	for (const entry of [...expected].reverse())
		if (entry.kind === "directory") {
			fs.chmodSync(path.join(op.destination, entry.path), entry.mode);
			syncDir(path.join(op.destination, entry.path));
		}
	r.state = "committed";
	save(j);
	assertInventory(op.destination, expected);
}
function commit(j: MigrationJournal) {
	checkSources(j.plan);
	reconcileMarker(j);
	for (let i = 0; i < j.plan.operations.length; i++) {
		const op = j.plan.operations[i]!,
			r = j.operations[i]!;
		if (r.state === "committed") {
			assertInventory(op.destination, r.inventory);
			continue;
		}
		if (op.kind === "config") {
			const stage = path.join(j.transaction_directory, "staged", String(i)),
				data = bytes(stage);
			r.state = "activating";
			save(j);
			transition(
				j,
				"config-" + i,
				op.destination,
				data,
				op.destination_inventory,
				r.inventory[0]!.mode,
			);
			r.state = "committed";
			save(j);
		} else promoteTree(j, i);
	}
	checkSources(j.plan);
	marker(j, "complete");
	j.state = "complete";
	save(j);
	return {
		status: "complete",
		transaction_directory: j.transaction_directory,
		source_removal: false,
		enrollment: "not-performed",
		remote: "not-performed",
	};
}
export function applyMigration(
	plan: unknown,
	{
		quiesced = false,
		interruptAfterStage = false,
		recoverTransaction,
	}: RecoveryOptions = {},
): MigrationResult {
	validatePlan(plan);
	if (!quiesced)
		fail("Stop old and new writers, then explicitly pass --quiesced");
	const old = receiptPath(plan.project);
	if (exists(old)) {
		const value = json(old);
		if (value.state === "complete" && value.plan_sha256 === plan.plan_sha256)
			return {
				...verifyMigration(safeAbsolute(value.transaction_directory)),
				idempotent: true,
			};
	}
	if (recoverTransaction && !/^[0-9a-f-]{36}$/.test(recoverTransaction))
		fail("Recovery requires the exact transaction UUID");
	const transaction = recoverTransaction || crypto.randomUUID(),
		dir = path.join(plan.project, ".grainulator-migrations", transaction);
	if (recoverTransaction && exists(path.join(dir, "journal.json")))
		fail("Existing journal: use resume or rollback with --recover-locks");
	if (recoverTransaction && !recoveryBinding(plan, transaction))
		fail("No matching proven-dead pre-journal project binding");
	const unlock = locks(plan, transaction, {
		recoverLocks: Boolean(recoverTransaction),
	});
	let j: MigrationJournal | undefined;
	try {
		crash("after-locks");
		checkSources(plan);
		checkDestinations(plan);
		if (!equal(fileInventory(old), plan.previous_marker_inventory))
			fail("Migration receipt changed");
		parents(path.join(plan.project, ".grainulator-migrations"));
		if (exists(dir)) {
			if (!recoverTransaction) fail("Transaction storage appeared");
			fs.renameSync(dir, dir + ".before-journal-" + crypto.randomUUID());
			syncDir(path.dirname(dir));
		}
		mkdir(dir);
		mkdir(path.join(dir, "staged"));
		mkdir(path.join(dir, "backups"));
		mkdir(path.join(dir, "rolled-back"));
		j = {
			schema: JOURNAL,
			transaction,
			transaction_directory: dir,
			plan,
			state: "preparing",
			marker_inventory: plan.previous_marker_inventory,
			transitions: {},
			operations: [],
		};
		exclusive(path.join(dir, "plan.json"), plan);
		crash("before-first-journal");
		atomic(path.join(dir, "journal.json"), j);
		stageAll(j);
		if (interruptAfterStage)
			return { status: "staged", transaction_directory: dir };
		return commit(j);
	} catch (_e) {
		const e = _e as MigrationFailure;
		if (j) e.transaction_directory = j.transaction_directory;
		throw e;
	} finally {
		unlock();
	}
}
export function resumeMigration(
	directory: string,
	{ quiesced = false, recoverLocks = false }: RecoveryOptions = {},
): MigrationResult {
	const j = load(directory);
	if (!quiesced) fail("Explicit --quiesced is required for recovery");
	const unlock = locks(j.plan, j.transaction, { recoverLocks });
	try {
		reconcileMarker(j);
		if (j.state === "complete") return verifyMigration(directory);
		if (
			j.state === "preparing" &&
			j.operations.length === j.plan.operations.length
		) {
			marker(j, "in-progress");
			j.state = "staged";
			save(j);
		}
		if (j.state !== "staged")
			fail("Preparation or rollback interrupted; use explicit rollback");
		return commit(j);
	} finally {
		unlock();
	}
}
export function verifyMigration(directory: string): MigrationResult {
	const j = load(directory);
	compareMarker(j);
	checkSources(j.plan);
	if (j.state !== "complete")
		fail("Migration is incomplete; do not activate runtime or hosts");
	for (let i = 0; i < j.plan.operations.length; i++)
		assertInventory(
			j.plan.operations[i]!.destination,
			j.operations[i]!.inventory,
		);
	return {
		status: "verified",
		transaction_directory: j.transaction_directory,
		source_bytes_preserved: true,
		enrollment: "not-performed",
		remote: "not-performed",
	};
}
function retiredPath(j: MigrationJournal, i: number) {
	const op = j.plan.operations[i]!,
		record = j.operations[i]!;
	// POSIX directory moves across parents require write access to the moved
	// directory (to update '..'). Keep a protected directory beside its old name;
	// never change its permissions to force a rollback through that boundary.
	if (op.kind !== "config" && !(record.inventory[0]!.mode & 0o200))
		return op.destination + ".grainulator-retired-" + j.transaction;
	return path.join(j.transaction_directory, "rolled-back", String(i));
}
export function rollbackMigration(
	directory: string,
	{ quiesced = false, recoverLocks = false }: RecoveryOptions = {},
): RollbackResult {
	const j = load(directory);
	if (!quiesced) fail("Explicit --quiesced is required for rollback");
	const unlock = locks(j.plan, j.transaction, { recoverLocks });
	try {
		if (j.state === "rolled-back") {
			compareMarker(j);
			checkSources(j.plan);
			for (let i = 0; i < j.operations.length; i++)
				if (j.operations[i]!.rollback) {
					const r = j.operations[i]!,
						op = j.plan.operations[i]!;
					if (r.backup_inventory)
						assertInventory(op.destination, r.backup_inventory);
					else if (exists(op.destination))
						fail("Destination changed after rollback");
				}
			return { status: "rolled-back", idempotent: true };
		}
		reconcileMarker(j);
		checkSources(j.plan);
		for (let i = 0; i < j.operations.length; i++)
			if (j.operations[i]!.backup_inventory)
				assertInventory(
					path.join(j.transaction_directory, "backups", String(i)),
					j.operations[i]!.backup_inventory,
				);
		// Validate every committed destination (including absence) and backup before
		// moving any. Only an owned durable rollback intent explains a missing target.
		for (let i = 0; i < j.operations.length; i++) {
			const r = j.operations[i]!,
				op = j.plan.operations[i]!;
			if (op.kind === "config" && r.state === "activating") {
				const tr = j.transitions["config-" + i],
					data = bytes(path.join(j.transaction_directory, "staged", String(i)));
				transition(j, "config-" + i, op.destination, data, tr!.before);
				r.state = "committed";
				save(j);
			}
			if (r.backup_inventory)
				assertInventory(
					path.join(j.transaction_directory, "backups", String(i)),
					r.backup_inventory,
				);
			const retired = retiredPath(j, i);
			if (r.rollback) {
				if (exists(retired))
					assertInventory(retired, r.rollback.inventory, {
						peer: path.join(j.transaction_directory, "staged", String(i)),
					});
				else if (r.rollback.phase !== "intent")
					fail("Rollback retirement is missing");
				if (exists(op.destination)) {
					if (r.rollback.phase === "intent" && !exists(retired)) {
						assertInventory(op.destination, r.rollback.inventory, {
							peer: path.join(j.transaction_directory, "staged", String(i)),
						});
						continue;
					}
					const target = fileInventoryIfFile(
						op.destination,
						path.join(j.transaction_directory, "staged", "restore-" + i),
					);
					if (
						!r.backup_inventory ||
						op.kind !== "config" ||
						!equal(target, r.backup_inventory)
					)
						fail("Rollback destination changed");
				} else if (
					!exists(retired) ||
					(r.backup_inventory && r.rollback.phase === "restored")
				)
					fail("Committed destination missing without owned retirement");
			} else if (exists(retired))
				fail(
					"Rollback retirement path already exists; preserve conflicting bytes",
				);
			else if (r.state === "committed")
				assertInventory(op.destination, r.inventory);
			else if (
				["promoting", "finalizing"].includes(r.state) &&
				exists(op.destination)
			)
				partialInventory(j, i);
		}
		j.state = "rolling-back";
		save(j);
		for (let i = j.operations.length - 1; i >= 0; i--) {
			const r = j.operations[i]!,
				op = j.plan.operations[i]!,
				retired = retiredPath(j, i);
			if (
				r.state === "staged" ||
				(r.state === "promoting" && !exists(op.destination) && !r.inode)
			)
				continue;
			if (!r.rollback) {
				r.rollback = {
					phase: "intent",
					inventory: scan(op.destination, {
						peer: path.join(j.transaction_directory, "staged", String(i)),
					}),
				};
				save(j);
			}
			if (!exists(retired)) {
				assertInventory(op.destination, r.rollback.inventory, {
					peer: path.join(j.transaction_directory, "staged", String(i)),
				});
				fs.renameSync(op.destination, retired);
				syncDir(path.dirname(op.destination));
				syncDir(path.dirname(retired));
				crash("rollback-" + i + ":after-retire");
			}
			r.rollback.phase = "retired";
			save(j);
			if (r.backup_inventory) {
				const backup = path.join(j.transaction_directory, "backups", String(i)),
					stage = path.join(j.transaction_directory, "staged", "restore-" + i);
				if (!exists(stage) && !exists(op.destination))
					copyFile(backup, stage, r.backup_inventory[0]!);
				if (!exists(op.destination)) {
					fs.linkSync(stage, op.destination);
					syncDir(path.dirname(op.destination));
					crash("rollback-" + i + ":after-restore");
				}
				assertInventory(op.destination, r.backup_inventory, { peer: stage });
				if (exists(stage)) {
					if (!sameInode(stage, op.destination))
						fail("Restore ownership changed");
					fs.unlinkSync(stage);
					syncDir(path.dirname(stage));
				}
			}
			r.rollback.phase = "restored";
			save(j);
		}
		marker(j, "rolled-back");
		j.state = "rolled-back";
		save(j);
		return {
			status: "rolled-back",
			retained_copy: path.join(j.transaction_directory, "rolled-back"),
			retained_paths: j.operations.flatMap((r, i) =>
				r.rollback ? [retiredPath(j, i)] : [],
			),
			originals_preserved: true,
		};
	} finally {
		unlock();
	}
}
function fileInventoryIfFile(file: string, peer?: string) {
	return exists(file) && fs.lstatSync(file).isFile()
		? scan(file, { peer })
		: null;
}
export async function main(argv = process.argv.slice(2)) {
	const [command, ...args] = argv,
		options: ConverterOptions = {};
	const allowed = new Set([
		"--project",
		"--memory-source",
		"--memory-destination",
		"--cache-source",
		"--cache-destination",
		"--out",
		"--plan",
		"--transaction",
		"--quiesced",
		"--recover-locks",
		"--recover-transaction",
		"--json",
	]);
	for (let i = 0; i < args.length; i++) {
		const key = args[i]!;
		if (!allowed.has(key) || key in options)
			fail("Unknown or duplicate option: " + key);
		if (["--quiesced", "--recover-locks", "--json"].includes(key))
			options[key] = true;
		else {
			if (!args[i + 1] || args[i + 1]!.startsWith("--"))
				fail("Missing value: " + key);
			options[key] = args[++i]!;
		}
	}
	let result:
		| ReturnType<typeof inspectMigration>
		| MigrationResult
		| RollbackResult
		| { status: string; plan: string; plan_sha256: string };
	const recovery = {
		quiesced: options["--quiesced"],
		recoverLocks: options["--recover-locks"],
		recoverTransaction: options["--recover-transaction"],
	};
	if (member(["inspect", "plan"], command)) {
		result = inspectMigration({
			project: options["--project"],
			memorySource: options["--memory-source"],
			memoryDestination: options["--memory-destination"],
			cacheSource: options["--cache-source"],
			cacheDestination: options["--cache-destination"],
		});
		if (options["--out"]) {
			exclusive(safeAbsolute(options["--out"]), result);
			result = {
				status: "planned",
				plan: options["--out"],
				plan_sha256: result.plan_sha256,
			};
		}
	} else if (command === "apply")
		result = applyMigration(json(safeAbsolute(options["--plan"]!)), recovery);
	else if (command === "verify")
		result = verifyMigration(options["--transaction"]!);
	else if (command === "resume")
		result = resumeMigration(options["--transaction"]!, recovery);
	else if (command === "rollback")
		result = rollbackMigration(options["--transaction"]!, recovery);
	else if (member(["--help", "help", undefined], command)) {
		console.log(
			"Offline Grainulator 3 converter (separate artifact)\n  inspect --project /absolute/project [--memory-source /old --memory-destination /new] [--cache-source /old --cache-destination /new] [--out /new-plan.json]\n  apply --plan /plan.json --quiesced\n  verify --transaction /project/.grainulator-migrations/<id>\n  resume|rollback --transaction /project/.grainulator-migrations/<id> --quiesced [--recover-locks]\nRecovery steals only proven dead, same-host locks for this exact transaction. Stop all writers; cross-device selections are refused before activation. No network, child execution, host registration, source deletion or remote migration. Inspect is read-only unless --out explicitly selects a new plan file.",
		);
		console.log(
			"If killed before its first journal exists: apply --plan /same-reviewed-plan.json --quiesced --recover-transaction EXACT_UUID_FROM_LOCK. Existing journals require resume/rollback instead; live, mismatched or uncertain locks are never stolen.",
		);
		return;
	} else fail("Unknown converter command");
	console.log(JSON.stringify(result, null, 2));
}
if (
	process.argv[1] &&
	fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
	main().catch((error) => {
		console.error(
			JSON.stringify({
				status: "error",
				message: error.message,
				...(error.transaction_directory
					? { transaction_directory: error.transaction_directory }
					: {}),
			}),
		);
		process.exitCode = 1;
	});
