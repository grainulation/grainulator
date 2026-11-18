import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { loadClaims } from "../packages/evidence/lib/load-claims.js";
import { readPassage, readBoundedRegularFile, quoteInPassage } from "../packages/evidence/lib/passages.js";

const { assertSafeOutput } = createRequire(import.meta.url)("../packages/exports/lib/output-safety.js");
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PASSAGE_BYTES = 16 * 1024 * 1024;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const ordered = (value) => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object"
	? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
export const canonicalJSON = (value) => JSON.stringify(ordered(value));
const digest = (value) => sha256(canonicalJSON(value));

// This is a locator identity, not a claim that the remote source was retrieved.
function sourceMetadata(source) {
	if (!source || typeof source !== "object" || Array.isArray(source)) return null;
	const omit = new Set(["quote", "passage", "passage_sha256", "witnessed_claim", "challenged_claim", "relationship"]);
	return Object.fromEntries(Object.entries(source).filter(([key]) => !omit.has(key)));
}

/** Freeze the current ledger and its recorded passages without network/model calls. */
export function buildReportPacket(dir) {
	const root = fs.realpathSync(dir);
	const loaded = loadClaims(root, { maxBytes: MAX_BYTES });
	if (!loaded.data) throw new Error(loaded.errors[0]?.message || "No claims.json in the sprint.");
	const active = loaded.data.claims.filter((claim) => claim.status === "active").sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	if (!active.length) throw new Error("A report packet requires at least one active claim.");
	if (active.length > 10000) throw new Error("Report packets support at most 10000 active claims.");
	const ids = new Set();
	const sources = new Map(), passages = new Map(), relations = [], gaps = [];
	let passageBytes = 0;
	for (const claim of active) {
		if (typeof claim.id !== "string" || !claim.id || ids.has(claim.id)) throw new Error("Active claim IDs must be unique nonempty strings.");
		ids.add(claim.id);
		const source = claim.source, metadata = sourceMetadata(source);
		const hasLocator = typeof metadata?.artifact === "string" && !!metadata.artifact.trim();
		const sourceId = hasLocator ? `src-${digest(metadata)}` : null;
		if (sourceId) sources.set(sourceId, { id: sourceId, metadata, identity: "recorded_locator_not_independently_resolved" });
		else gaps.push({ claim_id: claim.id, code: "source_locator_missing" });
		const passageDigest = source?.passage_sha256 ?? null;
		let integrity = "not_recorded", quoteIntegrity = "not_recorded";
		if (passageDigest) {
			if (!passages.has(passageDigest)) {
				if (passages.size >= 2000) throw new Error("Report packet passage count exceeds 2000.");
				const read = readPassage(root, passageDigest, Math.max(0, MAX_PASSAGE_BYTES - passageBytes));
				passageBytes += read.bytes || 0;
				if (passageBytes > MAX_PASSAGE_BYTES || read.code === "limit_exceeded") throw new Error("Report packet passage byte limit exceeded.");
				passages.set(passageDigest, read.ok ? { sha256: passageDigest, integrity: "intact", text: read.text }
					: { sha256: passageDigest, integrity: read.code, ...(read.actual ? { observed_sha256: read.actual } : {}) });
			}
			const passage = passages.get(passageDigest);
			integrity = passage.integrity;
			quoteIntegrity = integrity === "intact" && typeof source.quote === "string" && source.quote.trim()
				? (quoteInPassage(source.quote, passage.text) ? "present" : "absent") : "unavailable";
		}
		if (integrity !== "intact") gaps.push({ claim_id: claim.id, code: "passage_" + integrity });
		else if (quoteIntegrity !== "present") gaps.push({ claim_id: claim.id, code: "quote_" + quoteIntegrity });
		relations.push({ claim_id: claim.id, source_id: sourceId, passage_sha256: passageDigest,
			quote: source?.quote ?? null, passage_integrity: integrity, quote_integrity: quoteIntegrity,
			witnessed_claim: source?.witnessed_claim ?? null, challenged_claim: source?.challenged_claim ?? null,
			recorded_relationship: source?.relationship ?? null,
			semantic_support: "not_evaluated" });
	}
	const packet = {
		schema: "grainulator.report-packet/v1", ledger_sha256: sha256(loaded.raw_bytes),
		selection: { status: "active", total_records: loaded.data.claims.length, active_records: active.length },
		historical_claims: loaded.data.claims.filter((claim) => claim.status !== "active")
			.map(({ id, status, resolved_by }) => ({ id, status, resolved_by: resolved_by ?? null }))
			.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
		meta: loaded.data.meta, claims: active, sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id)),
		passages: [...passages.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)), relations, gaps,
		verification: "Recorded identity and local byte integrity only; semantic support requires independent review.",
	};
	return { ...packet, packet_sha256: digest(packet) };
}

// A report artifact belongs inside its explicit sprint. Reject symlink ancestors;
// these local-user checks do not claim isolation from concurrent hostile writers.
function confinedPath(dir, name, createParents = false) {
	const root = fs.realpathSync(dir), target = path.resolve(root, name);
	const relative = path.relative(root, target);
	if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
		throw new Error("Report paths must stay inside the selected sprint.");
	let current = root;
	const parts = relative.split(path.sep);
	for (let index = 0; index < parts.length; index++) {
		current = path.join(current, parts[index]);
		try {
			const stat = fs.lstatSync(current);
			if (stat.isSymbolicLink()) throw new Error("Report paths cannot traverse symlinks.");
			if (index < parts.length - 1 && !stat.isDirectory()) throw new Error("Report parent is not a directory.");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			if (createParents && index < parts.length - 1) fs.mkdirSync(current);
		}
	}
	return target;
}

export function writeReportPacket(dir, output) {
	const packet = buildReportPacket(dir);
	const target = confinedPath(dir, output);
	const sourcePaths = [path.join(fs.realpathSync(dir), "claims.json"), ...packet.passages.map((p) => path.join(fs.realpathSync(dir), "evidence", "passages", `${p.sha256}.txt`))];
	assertSafeOutput(target, sourcePaths);
	const serialized = JSON.stringify(ordered(packet), null, 2) + "\n";
	if (Buffer.byteLength(serialized) > MAX_BYTES * 4) throw new Error("Report packet artifact exceeds 32 MiB.");
	confinedPath(dir, output, true);
	const fd = fs.openSync(target, "wx", 0o600);
	try { fs.writeFileSync(fd, serialized); fs.fsyncSync(fd); }
	finally { fs.closeSync(fd); }
	return { path: target, packet_sha256: packet.packet_sha256, active_claims: packet.claims.length, gaps: packet.gaps.length };
}

function readText(dir, name) {
	const file = confinedPath(dir, name);
	const read = readBoundedRegularFile(file, MAX_BYTES * 4);
	if (!read.ok) throw new Error(`Report input is unusable (${read.code}).`);
	return new TextDecoder("utf-8", { fatal: true }).decode(read.data);
}

/** Independently compare to current ledger/passages and inspect explicit references. */
export function checkReportPacket(dir, packetFile, draftFile) {
	const packet = JSON.parse(readText(dir, packetFile));
	const { packet_sha256, ...body } = packet;
	const issues = [];
	if (body.schema !== "grainulator.report-packet/v1" || packet_sha256 !== digest(body)) issues.push({ code: "packet_integrity_failed" });
	const current = buildReportPacket(dir);
	if (canonicalJSON(packet) !== canonicalJSON(current)) issues.push({ code: "packet_stale_or_changed" });
	let referenceCount = 0;
	if (draftFile !== undefined) {
		const draft = readText(dir, draftFile);
		const relations = new Map(current.relations.map((r) => [r.claim_id, r]));
		for (const match of draft.matchAll(/\[\[claim:([^\]\r\n]+)\]\]/g)) {
			referenceCount++;
			const relation = relations.get(match[1]);
			if (!relation) issues.push({ code: "unknown_claim_reference", claim_id: match[1] });
			else if (!relation.source_id || relation.passage_integrity !== "intact" || relation.quote_integrity !== "present")
				issues.push({ code: "reference_without_intact_evidence", claim_id: match[1] });
		}
		if (!referenceCount) issues.push({ code: "no_explicit_claim_references" });
	}
	return { status: issues.length ? "failed" : "consistent", passed: issues.length === 0, issues,
		gaps: current.gaps, checked_references: referenceCount, semantic_support: "not_evaluated",
		limits: "Checks explicit [[claim:ID]] references and recorded bytes, not whether prose is true, supported, or complete." };
}

export async function reportCLI(args) {
	const help = "grainulator report packet --dir SPRINT --out output/packet.json\ngrainulator report check --dir SPRINT --packet output/packet.json [--draft output/draft.md] [--json]\nOffline, local evidence snapshots; checks do not establish semantic support. Existing outputs are never overwritten.";
	if (!args.length || args.includes("--help") || args.includes("-h")) { console.log(help); return; }
	const [action, ...rest] = args, values = {};
	for (let index = 0; index < rest.length; index++) {
		const key = rest[index];
		if (key === "--json") { values.json = true; continue; }
		if (!["--dir", "--out", "--packet", "--draft"].includes(key) || !rest[index + 1] || rest[index + 1].startsWith("--")) throw new Error("Invalid report arguments.\n" + help);
		if (values[key] !== undefined) throw new Error("Duplicate report argument: " + key);
		values[key] = rest[++index];
	}
	if (!values["--dir"]) throw new Error("report requires an explicit --dir.");
	let result;
	if (action === "packet" && values["--out"] && !values["--packet"] && !values["--draft"]) result = writeReportPacket(values["--dir"], values["--out"]);
	else if (action === "check" && values["--packet"] && !values["--out"]) {
		result = checkReportPacket(values["--dir"], values["--packet"], values["--draft"]);
		if (!result.passed) process.exitCode = 2;
	} else throw new Error("Invalid report arguments.\n" + help);
	console.log(JSON.stringify(result, null, 2));
}
