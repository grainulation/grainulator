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
	const omit = new Set(["quote", "passage", "passage_sha256", "witnessed_claim", "challenged_claim", "relationship", "source_role"]);
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
			source_role: source?.source_role ?? null,
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

const ABBREVIATIONS = new Set([
	"e.g.", "i.e.", "vs.", "etc.", "fig.", "eq.", "dr.", "mr.", "ms.", "prof.",
	"no.", "vol.", "pp.", "approx.", "est.", "al.", "cf.", "inc.", "ltd.",
]);

export function extractClaimReferences(draftText) {
	const refs = [];
	for (const match of draftText.matchAll(/\[\[claim:([^\]\r\n]+)\]\]/g)) {
		refs.push(match[1]);
	}
	return refs;
}

export function checkLimitationAndConflictSurvival(packet, citedIds) {
	const cited = citedIds instanceof Set ? citedIds : new Set(citedIds);
	const claims = Array.isArray(packet?.claims) ? packet.claims : [];
	const relations = Array.isArray(packet?.relations) ? packet.relations : [];
	const activeById = new Map(claims.map((c) => [c.id, c]));
	const issues = [];
	const flagged = new Set();

	for (const claim of claims) {
		if ((claim.type === "risk" || claim.type === "constraint") && !cited.has(claim.id)) {
			flagged.add(`limitation:${claim.id}`);
			issues.push({
				code: "omitted_active_risk_or_conflict",
				kind: "active_risk_or_constraint",
				claim_id: claim.id,
				claim_type: claim.type,
				topic: claim.topic ?? null,
				message: `Active ${claim.type} claim ${claim.id} is omitted from draft citations.`,
			});
		}
	}

	for (const rel of relations) {
		const isChallenge = rel.recorded_relationship === "contradicts"
			|| rel.recorded_relationship === "challenge"
			|| Boolean(rel.challenged_claim);
		if (!isChallenge) continue;
		const targetClaim = rel.challenged_claim ?? rel.witnessed_claim ?? null;
		const targetActive = !targetClaim || activeById.has(targetClaim);
		if (!targetActive) continue;
		if (!cited.has(rel.claim_id) && !flagged.has(`limitation:${rel.claim_id}`)) {
			flagged.add(`challenge:${rel.claim_id}`);
			issues.push({
				code: "omitted_active_risk_or_conflict",
				kind: "unresolved_challenge",
				claim_id: rel.claim_id,
				target_claim: targetClaim,
				relationship: rel.recorded_relationship ?? "challenge",
				message: `Unresolved ${rel.recorded_relationship ?? "challenge"} claim ${rel.claim_id}${targetClaim ? ` (challenging ${targetClaim})` : ""} is omitted from draft citations.`,
			});
		}
	}

	const seenConflictPairs = new Set();
	for (const claim of claims) {
		for (const targetId of claim.conflicts_with ?? []) {
			if (!activeById.has(targetId)) continue;
			const pairKey = [claim.id, targetId].sort().join("::");
			if (seenConflictPairs.has(pairKey)) continue;
			seenConflictPairs.add(pairKey);

			const missing = [];
			if (!cited.has(claim.id)) missing.push(claim.id);
			if (!cited.has(targetId)) missing.push(targetId);
			if (missing.length === 0) continue;

			const primaryMissing = missing[0];
			const other = primaryMissing === claim.id ? targetId : claim.id;
			if (flagged.has(`limitation:${primaryMissing}`) || flagged.has(`challenge:${primaryMissing}`)) {
				continue;
			}
			issues.push({
				code: "omitted_active_risk_or_conflict",
				kind: "unresolved_conflict",
				claim_id: primaryMissing,
				conflicting_claim: other,
				message: `Unresolved conflict between active claims ${claim.id} and ${targetId} omits ${missing.join(", ")} from draft citations.`,
			});
		}
	}

	return issues;
}

function stripInlineSyntaxForDetection(text) {
	return text
		.replace(/\[([^\]]+)\]\((?:[^()\s]+|\([^)]*\))*\)/g, "$1")
		.replace(/https?:\/\/[^\s)>\]]+/gi, " ")
		.replace(/`[^`\r\n]+`/g, " ");
}

function splitSentences(blockText) {
	const sentences = [];
	let start = 0;
	for (let i = 0; i < blockText.length; i++) {
		const ch = blockText[i];
		if (ch !== "." && ch !== "!" && ch !== "?") continue;
		const next = blockText[i + 1] ?? "";
		if (next && !/\s/.test(next)) continue;

		if (ch === ".") {
			const prev = blockText[i - 1] ?? "";
			const afterDot = blockText.slice(i + 1).trimStart();
			if (/\d/.test(prev) && /^\d/.test(afterDot)) continue;
			const tailWordMatch = blockText.slice(start, i + 1).match(/([A-Za-z.]+)$/);
			if (tailWordMatch && ABBREVIATIONS.has(tailWordMatch[1].toLowerCase())) continue;
		}

		let end = i + 1;
		const trailingMarker = blockText.slice(end).match(/^(?:\s*\[\[claim:[^\]\r\n]+\]\])+/);
		if (trailingMarker) {
			end += trailingMarker[0].length;
			i = end - 1;
		}
		const chunk = blockText.slice(start, end).trim();
		if (chunk) sentences.push(chunk);
		start = end;
	}
	const rest = blockText.slice(start).trim();
	if (rest) sentences.push(rest);
	return sentences;
}

function detectCheckworthySignals(sentence) {
	const cleaned = stripInlineSyntaxForDetection(sentence);
	const signals = [];

	const hasQuant = /(?:\b\d+(?:\.\d+)?%|\$\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:percent|ms|s|sec|seconds|minutes|hours|days|bytes|kb|mb|gb|tb|x|times|samples|claims|files|lines|tokens|citations|papers|studies|runs|cells|usd)\b|\b(?:more than|less than|over|under|at least|at most|nearly|roughly|approximately)\s+\d+(?:\.\d+)?\b|\b\d+\/\d+\b)/i.test(cleaned);
	if (hasQuant) signals.push("quantitative");

	const hasDate = /(?:\b\d{4}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b)/i.test(cleaned);
	if (hasDate) signals.push("temporal_or_date");

	const hasEmpirical = /\b(?:proved|proves|proven|demonstrated|demonstrates|established|benchmarks?\s+show|experiments?\s+show|studies?\s+show|results?\s+(?:show|indicate|confirm)|measurements?\s+confirm|outperforms?|reduces?\s+by|increases?\s+by|failed\s+with\s+exit)\b/i.test(cleaned);
	if (hasEmpirical) signals.push("empirical_claim_verb");

	return signals;
}

export function checkUncitedFactualAssertions(draftText) {
	const lines = draftText.split(/\r?\n/);
	const blocks = [];
	let fence = null;
	let current = null;

	const flush = () => {
		if (current && current.parts.length) {
			blocks.push(current);
		}
		current = null;
	};

	for (let idx = 0; idx < lines.length; idx++) {
		const rawLine = lines[idx];
		const trimmed = rawLine.trim();
		const lineNo = idx + 1;

		const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
		if (fenceMatch) {
			flush();
			const marker = fenceMatch[1][0];
			if (!fence) fence = marker;
			else if (fence === marker) fence = null;
			continue;
		}
		if (fence) continue;

		if (
			!trimmed
			|| /^\s{0,3}#{1,6}(?:\s|$)/.test(rawLine)
			|| /^\s{0,3}(?:=+|-+)\s*$/.test(rawLine)
			|| /^\s{0,3}(?:[-*_]\s*){3,}$/.test(rawLine)
			|| /^<!--.*-->$/.test(trimmed)
			|| /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(rawLine)
		) {
			flush();
			continue;
		}

		const unquoted = rawLine.replace(/^\s*(?:>\s*)+/, "");
		const bulletMatch = unquoted.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
		if (bulletMatch) {
			flush();
			current = { parts: [{ line: lineNo, text: bulletMatch[1].trim() }] };
			continue;
		}

		if (!current) current = { parts: [] };
		current.parts.push({ line: lineNo, text: unquoted.trim() });
	}
	flush();

	const issues = [];
	for (const block of blocks) {
		const spans = [];
		let joined = "";
		for (const part of block.parts) {
			if (joined) joined += " ";
			const start = joined.length;
			joined += part.text;
			spans.push({ start, end: joined.length, line: part.line });
		}
		let searchFrom = 0;
		for (const sentence of splitSentences(joined)) {
			const idx = joined.indexOf(sentence, searchFrom);
			const offset = idx >= 0 ? idx : searchFrom;
			searchFrom = offset + sentence.length;
			if (/\[\[claim:[^\]\r\n]+\]\]/.test(sentence)) continue;
			const signals = detectCheckworthySignals(sentence);
			if (!signals.length) continue;
			const span = spans.find((s) => offset >= s.start && offset <= s.end) ?? spans[0];
			issues.push({
				code: "uncited_checkworthy_sentence",
				line: span.line,
				sentence,
				signals,
			});
		}
	}
	return issues;
}

export function checkSourceProvenance(packet) {
	const claims = Array.isArray(packet?.claims) ? packet.claims : [];
	const relations = Array.isArray(packet?.relations) ? packet.relations : [];
	const sourcesById = new Map((packet?.sources ?? []).map((s) => [s.id, s]));
	const claimsById = new Map(claims.map((c) => [c.id, c]));
	const relationByClaimId = new Map(relations.map((r) => [r.claim_id, r]));

	const primaryWitnessed = new Set();
	for (const rel of relations) {
		if (!rel.witnessed_claim || rel.recorded_relationship === "contradicts") continue;
		const witnessClaim = claimsById.get(rel.claim_id);
		if (!witnessClaim || (witnessClaim.status && witnessClaim.status !== "active")) continue;
		const witnessSource = rel.source_id ? sourcesById.get(rel.source_id) : null;
		const witnessRole = rel.source_role ?? witnessClaim?.source?.source_role ?? witnessSource?.metadata?.source_role ?? null;
		if (witnessRole === "primary_evidence") {
			primaryWitnessed.add(rel.witnessed_claim);
		}
	}

	const issues = [];
	for (const claim of claims) {
		if (claim.evidence !== "documented" && claim.evidence !== "tested") continue;
		const rel = relationByClaimId.get(claim.id);
		const sourceRecord = rel?.source_id ? sourcesById.get(rel.source_id) : null;
		const role = rel?.source_role ?? claim.source?.source_role ?? sourceRecord?.metadata?.source_role ?? null;
		if (role !== "secondary_citation") continue;
		if (primaryWitnessed.has(claim.id)) continue;

		issues.push({
			code: "secondary_citation_for_strong_tier",
			claim_id: claim.id,
			evidence: claim.evidence,
			source_role: role,
			source_id: rel?.source_id ?? null,
			message: `Claim ${claim.id} has evidence tier "${claim.evidence}" but relies on source_role "secondary_citation" without primary evidence.`,
		});
	}
	return issues;
}

/** Independently compare to current ledger/passages and inspect explicit references. */
export function checkReportPacket(dir, packetFile, draftFile, opts = {}) {
	const strict = Boolean(opts?.strict);
	const packet = JSON.parse(readText(dir, packetFile));
	const { packet_sha256, ...body } = packet;
	const issues = [];
	if (body.schema !== "grainulator.report-packet/v1" || packet_sha256 !== digest(body)) issues.push({ code: "packet_integrity_failed" });
	const current = buildReportPacket(dir);
	if (canonicalJSON(packet) !== canonicalJSON(current)) issues.push({ code: "packet_stale_or_changed" });
	let referenceCount = 0;
	const warnings = [];
	if (draftFile !== undefined) {
		const draft = readText(dir, draftFile);
		const relations = new Map(current.relations.map((r) => [r.claim_id, r]));
		const citedIds = new Set();
		for (const match of draft.matchAll(/\[\[claim:([^\]\r\n]+)\]\]/g)) {
			referenceCount++;
			citedIds.add(match[1]);
			const relation = relations.get(match[1]);
			if (!relation) issues.push({ code: "unknown_claim_reference", claim_id: match[1] });
			else if (!relation.source_id || relation.passage_integrity !== "intact" || relation.quote_integrity !== "present")
				issues.push({ code: "reference_without_intact_evidence", claim_id: match[1] });
		}
		if (!referenceCount) issues.push({ code: "no_explicit_claim_references" });
		warnings.push(
			...checkLimitationAndConflictSurvival(current, citedIds),
			...checkUncitedFactualAssertions(draft),
		);
	}
	warnings.push(...checkSourceProvenance(current));
	if (strict && warnings.length) issues.push(...warnings);
	return { status: issues.length ? "failed" : "consistent", passed: issues.length === 0, strict, issues, warnings,
		gaps: current.gaps, checked_references: referenceCount, semantic_support: "not_evaluated",
		limits: "Checks explicit [[claim:ID]] references and recorded bytes, not whether prose is true, supported, or complete." };
}

export async function reportCLI(args) {
	const help = "grainulator report packet --dir SPRINT --out output/packet.json\ngrainulator report check --dir SPRINT --packet output/packet.json [--draft output/draft.md] [--strict] [--json]\nOffline, local evidence snapshots; checks do not establish semantic support. Existing outputs are never overwritten.";
	if (!args.length || args.includes("--help") || args.includes("-h")) { console.log(help); return; }
	const [action, ...rest] = args, values = {};
	for (let index = 0; index < rest.length; index++) {
		const key = rest[index];
		if (key === "--json") { values.json = true; continue; }
		if (key === "--strict") { values.strict = true; continue; }
		if (!["--dir", "--out", "--packet", "--draft"].includes(key) || !rest[index + 1] || rest[index + 1].startsWith("--")) throw new Error("Invalid report arguments.\n" + help);
		if (values[key] !== undefined) throw new Error("Duplicate report argument: " + key);
		values[key] = rest[++index];
	}
	if (!values["--dir"]) throw new Error("report requires an explicit --dir.");
	let result;
	if (action === "packet" && values["--out"] && !values["--packet"] && !values["--draft"] && !values.strict) result = writeReportPacket(values["--dir"], values["--out"]);
	else if (action === "check" && values["--packet"] && !values["--out"]) {
		result = checkReportPacket(values["--dir"], values["--packet"], values["--draft"], { strict: Boolean(values.strict) });
		if (!result.passed) process.exitCode = 2;
	} else throw new Error("Invalid report arguments.\n" + help);
	console.log(JSON.stringify(result, null, 2));
}
