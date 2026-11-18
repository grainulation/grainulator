import {
	createHash,
	createPrivateKey,
	createPublicKey,
	sign,
	verify,
} from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { evidenceHealth } from "../packages/evidence/lib/evidence-health.js";
import { loadClaims } from "../packages/evidence/lib/load-claims.js";
import {
	quoteInPassage,
	readBoundedRegularFile,
	readPassage,
} from "../packages/evidence/lib/passages.js";

const { assertSafeOutput } = createRequire(import.meta.url)(
	"../packages/exports/lib/output-safety.js",
);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PASSAGE_BYTES = 16 * 1024 * 1024;
const MAX_KEY_BYTES = 64 * 1024;
const SEMANTIC_VERDICTS = new Set([
	"supported",
	"partial",
	"contradicted",
	"unresolvable",
]);
const DSSE_PAYLOAD_TYPE = "application/vnd.in-toto+json";
const IN_TOTO_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const REPORT_ATTESTATION_PREDICATE_TYPE =
	"https://grainulation.com/attestation/report-packet/v1";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const ordered = (value) =>
	Array.isArray(value)
		? value.map(ordered)
		: value && typeof value === "object"
			? Object.fromEntries(
					Object.keys(value)
						.sort()
						.map((key) => [key, ordered(value[key])]),
				)
			: value;
export const canonicalJSON = (value) => JSON.stringify(ordered(value));
const digest = (value) => sha256(canonicalJSON(value));

// This is a locator identity, not a claim that the remote source was retrieved.
function sourceMetadata(source) {
	if (!source || typeof source !== "object" || Array.isArray(source))
		return null;
	const omit = new Set([
		"quote",
		"passage",
		"passage_sha256",
		"witnessed_claim",
		"challenged_claim",
		"relationship",
		"source_role",
	]);
	return Object.fromEntries(
		Object.entries(source).filter(([key]) => !omit.has(key)),
	);
}

function normalizeLocatorAlias(value) {
	const trimmed = value.trim();
	if (!trimmed) return null;
	try {
		if (/^https?:\/\//i.test(trimmed)) {
			const parsed = new URL(trimmed);
			parsed.protocol = parsed.protocol.toLowerCase();
			parsed.hostname = parsed.hostname.toLowerCase();
			if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
				parsed.pathname = parsed.pathname.slice(0, -1);
			}
			return parsed.toString();
		}
	} catch {
		// Fall back to trimmed locator string when URL parsing fails.
	}
	return trimmed;
}

function extractIdentifiersFromString(
	raw,
	{ hasExplicitVersion = false, allowBareArxiv = false, asAlias = false } = {},
) {
	if (typeof raw !== "string") return { canonicalIds: [], matchKeys: [] };
	const text = raw.trim();
	if (!text) return { canonicalIds: [], matchKeys: [] };

	const canonicalIds = new Set();
	const doiMatches = text.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g) || [];
	for (const doi of doiMatches) {
		const cleaned = doi.replace(/[.,;]+$/, "").toLowerCase();
		if (cleaned) canonicalIds.add(`doi:${cleaned}`);
	}

	const arxivPatterns = [
		/(?:arxiv\s*:|arxiv\.org\/(?:abs|pdf|html)\/)(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?/gi,
		/(?:arxiv\s*:|arxiv\.org\/(?:abs|pdf|html)\/)([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?(?:\.pdf)?/gi,
	];
	if (allowBareArxiv) {
		arxivPatterns.push(
			/^(\d{4}\.\d{4,5})(v\d+)?$/gi,
			/^([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?$/gi,
		);
	}
	for (const pattern of arxivPatterns) {
		for (const match of text.matchAll(pattern)) {
			const baseId = match[1].toLowerCase();
			const version = match[2] ? match[2].toLowerCase() : "";
			const id = hasExplicitVersion && version ? `${baseId}${version}` : baseId;
			canonicalIds.add(`arxiv:${id}`);
		}
	}

	const matchKeys = new Set(canonicalIds);
	if (asAlias && canonicalIds.size === 0) {
		const normalizedAlias = normalizeLocatorAlias(text);
		if (normalizedAlias) {
			canonicalIds.add(normalizedAlias);
			matchKeys.add(`alias:${normalizedAlias}`);
		}
	} else if (canonicalIds.size === 0) {
		const normalizedLocator = normalizeLocatorAlias(text);
		if (normalizedLocator) matchKeys.add(`alias:${normalizedLocator}`);
	}
	return { canonicalIds: [...canonicalIds], matchKeys: [...matchKeys] };
}

export function normalizeSourceIdentifiers(metadata) {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
		return {
			canonicalIds: [],
			matchKeys: [],
			pinnedVersion: null,
			hasAliasField: false,
		};
	}
	const rawRevision =
		typeof metadata.revision === "string" && metadata.revision.trim()
			? metadata.revision.trim()
			: null;
	const rawVersion =
		typeof metadata.version === "string" && metadata.version.trim()
			? metadata.version.trim()
			: typeof metadata.version === "number" &&
					Number.isFinite(metadata.version)
				? String(metadata.version)
				: null;
	const pinnedVersion = rawRevision || rawVersion;
	const hasExplicitVersion = Boolean(pinnedVersion);

	const canonicalIds = new Set();
	const matchKeys = new Set();
	for (const [field, allowBareArxiv] of [
		["doi", false],
		["url", false],
		["arxiv", true],
		["artifact", false],
	]) {
		const res = extractIdentifiersFromString(metadata[field], {
			hasExplicitVersion,
			allowBareArxiv,
			asAlias: false,
		});
		for (const id of res.canonicalIds) canonicalIds.add(id);
		for (const key of res.matchKeys) matchKeys.add(key);
	}

	const aliases = Array.isArray(metadata.aliases) ? metadata.aliases : [];
	for (const alias of aliases) {
		const res = extractIdentifiersFromString(alias, {
			hasExplicitVersion,
			allowBareArxiv: true,
			asAlias: true,
		});
		for (const id of res.canonicalIds) canonicalIds.add(id);
		for (const key of res.matchKeys) matchKeys.add(key);
	}

	const scope = pinnedVersion ?? "";
	return {
		canonicalIds: [...canonicalIds].sort(),
		matchKeys: [...matchKeys].map((key) => `${scope}::${key}`).sort(),
		pinnedVersion,
		hasAliasField: aliases.length > 0,
	};
}

function mergeSourceMetadata(metas) {
	if (metas.length === 1) return metas[0];
	const merged = {};
	const aliasSet = new Set();
	for (const meta of metas) {
		for (const [key, value] of Object.entries(meta)) {
			if (key === "aliases" && Array.isArray(value)) {
				for (const item of value) {
					if (typeof item === "string" && item.trim())
						aliasSet.add(item.trim());
				}
				continue;
			}
			if (merged[key] === undefined) merged[key] = value;
		}
	}
	if (aliasSet.size > 0) merged.aliases = [...aliasSet].sort();
	return merged;
}

/** Freeze the current ledger and its recorded passages without network/model calls. */
export function buildReportPacket(dir) {
	const root = fs.realpathSync(dir);
	const loaded = loadClaims(root, { maxBytes: MAX_BYTES });
	if (!loaded.data)
		throw new Error(
			loaded.errors[0]?.message || "No claims.json in the sprint.",
		);
	const active = loaded.data.claims
		.filter((claim) => claim.status === "active")
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	if (!active.length)
		throw new Error("A report packet requires at least one active claim.");
	if (active.length > 10000)
		throw new Error("Report packets support at most 10000 active claims.");
	const ids = new Set();
	const passages = new Map(),
		pendingRelations = [],
		gaps = [];
	const locatorEntries = [];
	let passageBytes = 0;
	for (const claim of active) {
		if (typeof claim.id !== "string" || !claim.id || ids.has(claim.id))
			throw new Error("Active claim IDs must be unique nonempty strings.");
		ids.add(claim.id);
		const source = claim.source,
			metadata = sourceMetadata(source);
		const norm = normalizeSourceIdentifiers(metadata);
		const hasLocator = Boolean(
			(typeof metadata?.artifact === "string" && metadata.artifact.trim()) ||
				(typeof metadata?.doi === "string" && metadata.doi.trim()) ||
				(typeof metadata?.url === "string" && metadata.url.trim()) ||
				(typeof metadata?.arxiv === "string" && metadata.arxiv.trim()) ||
				norm.canonicalIds.length > 0,
		);
		let locatorIndex = -1;
		if (hasLocator) {
			locatorIndex = locatorEntries.length;
			locatorEntries.push({ metadata, norm });
		} else {
			gaps.push({ claim_id: claim.id, code: "source_locator_missing" });
		}
		const passageDigest = source?.passage_sha256 ?? null;
		let integrity = "not_recorded",
			quoteIntegrity = "not_recorded";
		if (passageDigest) {
			if (!passages.has(passageDigest)) {
				if (passages.size >= 2000)
					throw new Error("Report packet passage count exceeds 2000.");
				const read = readPassage(
					root,
					passageDigest,
					Math.max(0, MAX_PASSAGE_BYTES - passageBytes),
				);
				passageBytes += read.bytes || 0;
				if (passageBytes > MAX_PASSAGE_BYTES || read.code === "limit_exceeded")
					throw new Error("Report packet passage byte limit exceeded.");
				passages.set(
					passageDigest,
					read.ok
						? { sha256: passageDigest, integrity: "intact", text: read.text }
						: {
								sha256: passageDigest,
								integrity: read.code,
								...(read.actual ? { observed_sha256: read.actual } : {}),
							},
				);
			}
			const passage = passages.get(passageDigest);
			integrity = passage.integrity;
			quoteIntegrity =
				integrity === "intact" &&
				typeof source.quote === "string" &&
				source.quote.trim()
					? quoteInPassage(source.quote, passage.text)
						? "present"
						: "absent"
					: "unavailable";
		}
		if (integrity !== "intact")
			gaps.push({ claim_id: claim.id, code: `passage_${integrity}` });
		else if (quoteIntegrity !== "present")
			gaps.push({ claim_id: claim.id, code: `quote_${quoteIntegrity}` });
		pendingRelations.push({
			locatorIndex,
			relation: {
				claim_id: claim.id,
				source_id: null,
				passage_sha256: passageDigest,
				quote: source?.quote ?? null,
				passage_integrity: integrity,
				quote_integrity: quoteIntegrity,
				witnessed_claim: source?.witnessed_claim ?? null,
				challenged_claim: source?.challenged_claim ?? null,
				recorded_relationship: source?.relationship ?? null,
				source_role: source?.source_role ?? null,
				semantic_support: "not_evaluated",
			},
		});
	}

	// Union-find merges sources that share any normalized canonical identifier or alias (within matching pinned version).
	const parent = locatorEntries.map((_, idx) => idx);
	const find = (x) => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x]];
			x = parent[x];
		}
		return x;
	};
	const unite = (a, b) => {
		const ra = find(a),
			rb = find(b);
		if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
	};
	const keyOwner = new Map();
	const metaOwner = new Map();
	const anyAliasesInSprint = locatorEntries.some(
		(entry) => entry.norm.hasAliasField,
	);
	for (let idx = 0; idx < locatorEntries.length; idx++) {
		const { metadata, norm } = locatorEntries[idx];
		const metaHash = digest(metadata);
		if (metaOwner.has(metaHash)) unite(idx, metaOwner.get(metaHash));
		else metaOwner.set(metaHash, idx);
		for (const key of norm.matchKeys) {
			const isAliasKey = key.includes("::alias:");
			if (isAliasKey && !anyAliasesInSprint && !norm.hasAliasField) continue;
			if (keyOwner.has(key)) unite(idx, keyOwner.get(key));
			else keyOwner.set(key, idx);
		}
	}

	const groups = new Map();
	for (let idx = 0; idx < locatorEntries.length; idx++) {
		const rootIdx = find(idx);
		if (!groups.has(rootIdx)) groups.set(rootIdx, []);
		groups.get(rootIdx).push(locatorEntries[idx]);
	}

	const sources = new Map();
	const groupSourceIds = new Map();
	for (const [rootIdx, items] of groups.entries()) {
		const metaByDigest = new Map();
		const canonicalSet = new Set();
		let pinnedVersion = null;
		for (const item of items) {
			metaByDigest.set(digest(item.metadata), item.metadata);
			for (const cid of item.norm.canonicalIds) canonicalSet.add(cid);
			if (item.norm.pinnedVersion) pinnedVersion = item.norm.pinnedVersion;
		}
		const distinctMetas = [...metaByDigest.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([, m]) => m);
		const canonicalIds = [...canonicalSet].sort();
		let sourceId;
		if (canonicalIds.length > 0) {
			sourceId = `src-${digest({ canonical_ids: canonicalIds, ...(pinnedVersion ? { version: pinnedVersion } : {}) })}`;
		} else if (distinctMetas.length > 1) {
			sourceId = `src-${digest({ merged_metadata: distinctMetas })}`;
		} else {
			sourceId = `src-${digest(distinctMetas[0])}`;
		}
		groupSourceIds.set(rootIdx, sourceId);
		const mergedMetadata = mergeSourceMetadata(distinctMetas);
		sources.set(sourceId, {
			id: sourceId,
			metadata: mergedMetadata,
			...(distinctMetas.length > 1 ? { merged_metadata: distinctMetas } : {}),
			canonical_ids: canonicalIds,
			identity: "recorded_locator_not_independently_resolved",
		});
	}

	const relations = pendingRelations.map(({ locatorIndex, relation }) => ({
		...relation,
		source_id:
			locatorIndex >= 0 ? groupSourceIds.get(find(locatorIndex)) : null,
	}));

	const packet = {
		schema: "grainulator.report-packet/v1",
		ledger_sha256: sha256(loaded.raw_bytes),
		// Keep existing v1 packets byte-compatible until a sprint uses maintenance.
		...(loaded.data.claims.some(
			(claim) =>
				claim.premises !== undefined ||
				claim.observations !== undefined ||
				claim.audit !== undefined ||
				claim.maintenance_history !== undefined,
		)
			? { evidence_health: evidenceHealth(loaded.data, root) }
			: {}),
		selection: {
			status: "active",
			total_records: loaded.data.claims.length,
			active_records: active.length,
		},
		historical_claims: loaded.data.claims
			.filter((claim) => claim.status !== "active")
			.map(({ id, status, resolved_by }) => ({
				id,
				status,
				resolved_by: resolved_by ?? null,
			}))
			.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
		meta: loaded.data.meta,
		claims: active,
		sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id)),
		passages: [...passages.values()].sort((a, b) =>
			a.sha256.localeCompare(b.sha256),
		),
		relations,
		gaps,
		verification:
			"Recorded identity and local byte integrity only; semantic support requires independent review.",
	};
	return { ...packet, packet_sha256: digest(packet) };
}

// A report artifact belongs inside its explicit sprint. Reject symlink ancestors;
// these local-user checks do not claim isolation from concurrent hostile writers.
function confinedPath(dir, name, createParents = false) {
	const root = fs.realpathSync(dir),
		target = path.resolve(root, name);
	const relative = path.relative(root, target);
	if (
		!relative ||
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
		throw new Error("Report paths must stay inside the selected sprint.");
	let current = root;
	const parts = relative.split(path.sep);
	for (let index = 0; index < parts.length; index++) {
		current = path.join(current, parts[index]);
		try {
			const stat = fs.lstatSync(current);
			if (stat.isSymbolicLink())
				throw new Error("Report paths cannot traverse symlinks.");
			if (index < parts.length - 1 && !stat.isDirectory())
				throw new Error("Report parent is not a directory.");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			if (createParents && index < parts.length - 1) fs.mkdirSync(current);
		}
	}
	return target;
}

function writeConfinedJSON(
	dir,
	output,
	data,
	sourcePaths = [],
	label = "Report artifact",
) {
	const target = confinedPath(dir, output);
	assertSafeOutput(target, sourcePaths);
	const serialized = `${JSON.stringify(ordered(data), null, 2)}\n`;
	if (Buffer.byteLength(serialized) > MAX_BYTES * 4)
		throw new Error(`${label} exceeds 32 MiB.`);
	confinedPath(dir, output, true);
	const fd = fs.openSync(target, "wx", 0o600);
	try {
		fs.writeFileSync(fd, serialized);
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
	return target;
}

function readAndVerifyPacket(dir, packetFile) {
	const packet = JSON.parse(readText(dir, packetFile));
	const { packet_sha256, ...body } = packet;
	const integrityOk =
		body.schema === "grainulator.report-packet/v1" &&
		packet_sha256 === digest(body);
	return { packet, integrityOk };
}

export function writeReportPacket(dir, output) {
	const packet = buildReportPacket(dir);
	const root = fs.realpathSync(dir);
	const sourcePaths = [
		path.join(root, "claims.json"),
		...packet.passages.map((p) =>
			path.join(root, "evidence", "passages", `${p.sha256}.txt`),
		),
	];
	const target = writeConfinedJSON(
		dir,
		output,
		packet,
		sourcePaths,
		"Report packet artifact",
	);
	return {
		path: target,
		packet_sha256: packet.packet_sha256,
		active_claims: packet.claims.length,
		gaps: packet.gaps.length,
	};
}

function readText(dir, name) {
	const file = confinedPath(dir, name);
	const read = readBoundedRegularFile(file, MAX_BYTES * 4);
	if (!read.ok) throw new Error(`Report input is unusable (${read.code}).`);
	return new TextDecoder("utf-8", { fatal: true }).decode(read.data);
}

function readExternalKeyPem(keyPath) {
	const resolved = path.resolve(keyPath);
	const read = readBoundedRegularFile(resolved, MAX_KEY_BYTES);
	if (!read.ok) throw new Error(`Key file is unusable (${read.code}).`);
	return new TextDecoder("utf-8", { fatal: true }).decode(read.data);
}

const ABBREVIATIONS = new Set([
	"e.g.",
	"i.e.",
	"vs.",
	"etc.",
	"fig.",
	"eq.",
	"dr.",
	"mr.",
	"ms.",
	"prof.",
	"no.",
	"vol.",
	"pp.",
	"approx.",
	"est.",
	"al.",
	"cf.",
	"inc.",
	"ltd.",
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
		if (
			(claim.type === "risk" || claim.type === "constraint") &&
			!cited.has(claim.id)
		) {
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
		const isChallenge =
			rel.recorded_relationship === "contradicts" ||
			rel.recorded_relationship === "challenge" ||
			Boolean(rel.challenged_claim);
		if (!isChallenge) continue;
		const targetClaim = rel.challenged_claim ?? rel.witnessed_claim ?? null;
		const targetActive = !targetClaim || activeById.has(targetClaim);
		if (!targetActive) continue;
		if (
			!cited.has(rel.claim_id) &&
			!flagged.has(`limitation:${rel.claim_id}`)
		) {
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
			if (
				flagged.has(`limitation:${primaryMissing}`) ||
				flagged.has(`challenge:${primaryMissing}`)
			) {
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
		.replace(/\[([^\]]+)\]\([^)\r\n]*\)/g, "$1")
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
			const tailWordMatch = blockText
				.slice(start, i + 1)
				.match(/([A-Za-z.]+)$/);
			if (tailWordMatch && ABBREVIATIONS.has(tailWordMatch[1].toLowerCase()))
				continue;
		}

		let end = i + 1;
		const trailingMarker = blockText
			.slice(end)
			.match(/^(?:\s*\[\[claim:[^\]\r\n]+\]\])+/);
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

	const hasQuant =
		/(?:\b\d+(?:\.\d+)?%|\$\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:percent|ms|s|sec|seconds|minutes|hours|days|bytes|kb|mb|gb|tb|x|times|samples|claims|files|lines|tokens|citations|papers|studies|runs|cells|usd)\b|\b(?:more than|less than|over|under|at least|at most|nearly|roughly|approximately)\s+\d+(?:\.\d+)?\b|\b\d+\/\d+\b)/i.test(
			cleaned,
		);
	if (hasQuant) signals.push("quantitative");

	const hasDate =
		/(?:\b\d{4}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b)/i.test(
			cleaned,
		);
	if (hasDate) signals.push("temporal_or_date");

	const hasEmpirical =
		/\b(?:proved|proves|proven|demonstrated|demonstrates|established|benchmarks?\s+show|experiments?\s+show|studies?\s+show|results?\s+(?:show|indicate|confirm)|measurements?\s+confirm|outperforms?|reduces?\s+by|increases?\s+by|failed\s+with\s+exit)\b/i.test(
			cleaned,
		);
	if (hasEmpirical) signals.push("empirical_claim_verb");

	return signals;
}

export function checkUncitedFactualAssertions(draftText) {
	const lines = draftText.split(/\r?\n/);
	const blocks = [];
	let fence = null;
	let current = null;
	let inHtmlComment = false;

	const flush = () => {
		if (current?.parts.length) {
			blocks.push(current);
		}
		current = null;
	};

	for (let idx = 0; idx < lines.length; idx++) {
		const rawLine = lines[idx];
		const trimmed = rawLine.trim();
		const lineNo = idx + 1;

		if (inHtmlComment) {
			if (trimmed.includes("-->")) inHtmlComment = false;
			continue;
		}
		if (trimmed.startsWith("<!--")) {
			if (!trimmed.includes("-->")) inHtmlComment = true;
			continue;
		}

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
			!trimmed ||
			/^\s{0,3}#{1,6}(?:\s|$)/.test(rawLine) ||
			/^\s{0,3}(?:=+|-+)\s*$/.test(rawLine) ||
			/^\s{0,3}(?:[-*_]\s*){3,}$/.test(rawLine) ||
			/^\s*\|?[\s:-]+\|[\s|:-]*$/.test(rawLine)
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
			const span =
				spans.find((s) => offset >= s.start && offset <= s.end) ?? spans[0];
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
		if (!rel.witnessed_claim || rel.recorded_relationship === "contradicts")
			continue;
		const witnessClaim = claimsById.get(rel.claim_id);
		if (
			!witnessClaim ||
			(witnessClaim.status && witnessClaim.status !== "active")
		)
			continue;
		const witnessSource = rel.source_id ? sourcesById.get(rel.source_id) : null;
		const witnessRole =
			rel.source_role ??
			witnessClaim?.source?.source_role ??
			witnessSource?.metadata?.source_role ??
			null;
		if (witnessRole === "primary_evidence") {
			primaryWitnessed.add(rel.witnessed_claim);
		}
	}

	const issues = [];
	for (const claim of claims) {
		if (claim.evidence !== "documented" && claim.evidence !== "tested")
			continue;
		const rel = relationByClaimId.get(claim.id);
		const sourceRecord = rel?.source_id ? sourcesById.get(rel.source_id) : null;
		const role =
			rel?.source_role ??
			claim.source?.source_role ??
			sourceRecord?.metadata?.source_role ??
			null;
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

const SEMANTIC_STOPWORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"that",
	"this",
	"from",
	"into",
	"about",
	"was",
	"were",
	"are",
	"been",
	"being",
	"have",
	"has",
	"had",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"may",
	"might",
	"can",
	"than",
	"then",
	"when",
	"where",
	"which",
	"while",
	"also",
	"only",
	"very",
	"more",
	"most",
	"some",
	"such",
	"each",
	"both",
	"all",
	"any",
	"its",
	"their",
	"our",
	"your",
	"his",
	"her",
	"there",
	"here",
	"used",
]);
const NEGATION_PATTERN =
	/\b(?:not|no|never|neither|nor|none|cannot|can't|won't|wouldn't|couldn't|shouldn't|didn't|doesn't|don't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|failed\s+to|fails\s+to|fail\s+to|without|refutes?|disproves?|contradicts?|contrary\s+to|false|incorrect|untrue)\b/i;

function extractNumbers(text) {
	return [
		...new Set(
			(text.match(/\b\d+(?:\.\d+)?%?/g) || []).map((n) => n.toLowerCase()),
		),
	];
}

function extractKeyTerms(text) {
	const words = (text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(
		(w) => !SEMANTIC_STOPWORDS.has(w) && !NEGATION_PATTERN.test(w),
	);
	return [...new Set(words)];
}

function termsMatch(a, b) {
	if (a === b) return true;
	if (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5))
		return true;
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	return (
		short.length >= 4 &&
		(long === `${short}s` ||
			long === `${short}es` ||
			long === `${short}ed` ||
			long === `${short}ing`)
	);
}

function evaluateRelationDeterministically({ claim, relation, passage }) {
	if (
		!relation.source_id ||
		relation.passage_integrity !== "intact" ||
		relation.quote_integrity !== "present" ||
		!passage?.text ||
		!relation.quote
	) {
		return {
			verdict: "unresolvable",
			reason:
				"Missing source locator, non-intact passage, or quote absent from passage.",
		};
	}
	if (
		relation.recorded_relationship === "contradicts" ||
		relation.challenged_claim
	) {
		return {
			verdict: "contradicted",
			reason: relation.challenged_claim
				? `Relation challenges claim ${relation.challenged_claim}.`
				: "Relation recorded_relationship is contradicts.",
		};
	}

	const claimText = String(claim?.content ?? "");
	const quoteText = String(relation.quote ?? "");
	const claimTerms = extractKeyTerms(claimText);
	const quoteTerms = extractKeyTerms(quoteText);
	const claimNumbers = extractNumbers(claimText);
	const quoteNumbers = new Set(extractNumbers(quoteText));

	const matchedTerms = claimTerms.filter((ct) =>
		quoteTerms.some((qt) => termsMatch(ct, qt)),
	);
	const matchedNumbers = claimNumbers.filter((cn) => quoteNumbers.has(cn));

	const claimNegated = NEGATION_PATTERN.test(claimText);
	const quoteNegated = NEGATION_PATTERN.test(quoteText);
	if (
		quoteNegated !== claimNegated &&
		(matchedTerms.length > 0 || matchedNumbers.length > 0)
	) {
		return {
			verdict: "contradicted",
			reason:
				"Quote contains explicit negation or polarity conflict against claim terms.",
		};
	}

	if (
		relation.source_role === "secondary_citation" ||
		relation.recorded_relationship === "partial_support"
	) {
		return {
			verdict: "partial",
			reason:
				relation.source_role === "secondary_citation"
					? "Intact quote relies on secondary_citation provenance."
					: "Relation recorded_relationship is partial_support.",
		};
	}

	const allNumbersCovered = matchedNumbers.length === claimNumbers.length;
	const termCoverage =
		claimTerms.length === 0 ? 1 : matchedTerms.length / claimTerms.length;
	if (allNumbersCovered && termCoverage >= 0.5) {
		return {
			verdict: "supported",
			reason:
				"Intact passage quote covers key claim terms and numerical values.",
		};
	}

	return {
		verdict: "partial",
		reason:
			"Intact quote only partially overlaps claim terms or omits numerical values.",
	};
}

function finalizeSemanticEvaluation(
	dir,
	packet,
	outFile,
	evaluations,
	evaluatorMode,
) {
	const summary = {
		total: evaluations.length,
		supported: 0,
		partial: 0,
		contradicted: 0,
		unresolvable: 0,
	};
	for (const ev of evaluations) summary[ev.verdict]++;
	const body = {
		schema: "grainulator.semantic-eval/v1",
		packet_sha256: packet.packet_sha256,
		ledger_sha256: packet.ledger_sha256,
		evaluator: evaluatorMode,
		summary,
		evaluations,
	};
	const payload = { ...body, eval_sha256: digest(body) };
	let target = null;
	if (outFile !== undefined && outFile !== null) {
		const root = fs.realpathSync(dir);
		const sourcePaths = [
			path.join(root, "claims.json"),
			...packet.passages.map((p) =>
				path.join(root, "evidence", "passages", `${p.sha256}.txt`),
			),
		];
		target = writeConfinedJSON(
			dir,
			outFile,
			payload,
			sourcePaths,
			"Semantic evaluation artifact",
		);
	}
	return { ...(target ? { path: target } : {}), ...payload };
}

/** Sidecar offline (or custom-adapter) semantic support evaluator. Never mutates packet.json. */
export function verifyReportSemantics(dir, packetFile, outFile, opts = {}) {
	const { packet, integrityOk } = readAndVerifyPacket(dir, packetFile);
	if (!integrityOk)
		throw new Error("Report packet failed integrity verification.");
	const claimsById = new Map((packet.claims ?? []).map((c) => [c.id, c]));
	const passagesBySha = new Map(
		(packet.passages ?? []).map((p) => [p.sha256, p]),
	);
	const sourcesById = new Map((packet.sources ?? []).map((s) => [s.id, s]));
	const evaluator =
		typeof opts?.evaluator === "function" ? opts.evaluator : null;
	const evaluatorMode = evaluator ? "custom" : "deterministic-offline-v1";

	const normalizeEvalRow = (rel, res) => {
		const verdict = res?.verdict;
		if (!SEMANTIC_VERDICTS.has(verdict)) {
			throw new Error(
				`Invalid semantic verdict "${verdict}" for claim ${rel.claim_id}.`,
			);
		}
		return {
			claim_id: rel.claim_id,
			source_id: rel.source_id ?? null,
			passage_sha256: rel.passage_sha256 ?? null,
			verdict,
			reason: typeof res.reason === "string" ? res.reason : "",
			source_role: rel.source_role ?? null,
			recorded_relationship: rel.recorded_relationship ?? null,
		};
	};

	const rawEntries = (packet.relations ?? []).map((rel) => {
		const claim = claimsById.get(rel.claim_id) ?? null;
		const passage = rel.passage_sha256
			? (passagesBySha.get(rel.passage_sha256) ?? null)
			: null;
		const source = rel.source_id
			? (sourcesById.get(rel.source_id) ?? null)
			: null;
		const deterministic = evaluateRelationDeterministically({
			claim,
			relation: rel,
			passage,
		});
		if (!evaluator || deterministic.verdict === "unresolvable") {
			return normalizeEvalRow(rel, deterministic);
		}
		const custom = evaluator({
			claim,
			relation: rel,
			passage,
			source,
			packet,
			deterministic,
		});
		if (custom && typeof custom.then === "function") {
			return custom.then((resolved) => normalizeEvalRow(rel, resolved));
		}
		return normalizeEvalRow(rel, custom);
	});

	if (rawEntries.some((entry) => entry && typeof entry.then === "function")) {
		return Promise.all(rawEntries).then((evaluations) =>
			finalizeSemanticEvaluation(
				dir,
				packet,
				outFile,
				evaluations,
				evaluatorMode,
			),
		);
	}
	return finalizeSemanticEvaluation(
		dir,
		packet,
		outFile,
		rawEntries,
		evaluatorMode,
	);
}

/** Independently compare to current ledger/passages and inspect explicit references. */
export function checkReportPacket(dir, packetFile, draftFile, opts = {}) {
	const strict = Boolean(opts?.strict);
	const { packet, integrityOk } = readAndVerifyPacket(dir, packetFile);
	const issues = [];
	if (!integrityOk) issues.push({ code: "packet_integrity_failed" });
	const current = buildReportPacket(dir);
	for (const item of current.evidence_health?.errors || [])
		issues.push({ code: "invalid_evidence_health", detail: item });
	for (const item of current.evidence_health?.needs_reverification || [])
		issues.push({
			code: "claim_needs_reverification",
			claim_id: item.claim_id,
		});
	if (canonicalJSON(packet) !== canonicalJSON(current))
		issues.push({ code: "packet_stale_or_changed" });
	let referenceCount = 0;
	const citedIds = new Set();
	const warnings = [];
	if (draftFile !== undefined) {
		const draft = readText(dir, draftFile);
		const relations = new Map(current.relations.map((r) => [r.claim_id, r]));
		for (const match of draft.matchAll(/\[\[claim:([^\]\r\n]+)\]\]/g)) {
			referenceCount++;
			citedIds.add(match[1]);
			const relation = relations.get(match[1]);
			if (!relation)
				issues.push({ code: "unknown_claim_reference", claim_id: match[1] });
			else if (
				!relation.source_id ||
				relation.passage_integrity !== "intact" ||
				relation.quote_integrity !== "present"
			)
				issues.push({
					code: "reference_without_intact_evidence",
					claim_id: match[1],
				});
		}
		if (!referenceCount) issues.push({ code: "no_explicit_claim_references" });
		warnings.push(
			...checkLimitationAndConflictSurvival(current, citedIds),
			...checkUncitedFactualAssertions(draft),
		);
	}
	warnings.push(...checkSourceProvenance(current));

	let semanticMode = "not_evaluated";
	if (opts?.semanticFile) {
		let sem = null;
		try {
			sem = JSON.parse(readText(dir, opts.semanticFile));
		} catch {
			sem = null;
		}
		const semValid = Boolean(
			sem &&
				sem.schema === "grainulator.semantic-eval/v1" &&
				sem.packet_sha256 === current.packet_sha256 &&
				sem.packet_sha256 === packet.packet_sha256 &&
				sem.ledger_sha256 === current.ledger_sha256 &&
				Array.isArray(sem.evaluations),
		);
		if (!semValid) {
			issues.push({
				code: "semantic_eval_stale_or_invalid",
				message:
					"Sidecar semantic evaluation does not match current packet or ledger SHA-256.",
			});
			semanticMode = "failed";
		} else {
			const evalByClaim = new Map(
				sem.evaluations.map((ev) => [ev.claim_id, ev]),
			);
			for (const claimId of citedIds) {
				const ev = evalByClaim.get(claimId);
				if (
					!ev ||
					ev.verdict === "contradicted" ||
					ev.verdict === "unresolvable"
				) {
					issues.push({
						code: "semantic_support_failed",
						claim_id: claimId,
						verdict: ev?.verdict ?? "missing",
						message: `Cited claim ${claimId} has semantic verdict "${ev?.verdict ?? "missing"}".`,
					});
				}
			}
			semanticMode = issues.some((i) => i.code === "semantic_support_failed")
				? "failed"
				: "sidecar_evaluated";
		}
	}

	if (strict && warnings.length) issues.push(...warnings);
	return {
		status: issues.length ? "failed" : "consistent",
		passed: issues.length === 0,
		strict,
		issues,
		warnings,
		gaps: current.gaps,
		checked_references: referenceCount,
		semantic_support: semanticMode,
		limits:
			"Checks explicit [[claim:ID]] references and recorded bytes, not whether prose is true, supported, or complete.",
	};
}

function computeDraftMetrics(packet, draftText, checkResult) {
	const citedIds = new Set(extractClaimReferences(draftText));
	const relationsByClaim = new Map(
		(packet.relations ?? []).map((r) => [r.claim_id, r]),
	);
	const claimsById = new Map((packet.claims ?? []).map((c) => [c.id, c]));
	const sourcesById = new Map((packet.sources ?? []).map((s) => [s.id, s]));

	const primaryWitnessed = new Set();
	for (const rel of packet.relations ?? []) {
		if (!rel.witnessed_claim || rel.recorded_relationship === "contradicts")
			continue;
		const witnessClaim = claimsById.get(rel.claim_id);
		if (
			!witnessClaim ||
			(witnessClaim.status && witnessClaim.status !== "active")
		)
			continue;
		const witnessSource = rel.source_id ? sourcesById.get(rel.source_id) : null;
		const witnessRole =
			rel.source_role ??
			witnessClaim?.source?.source_role ??
			witnessSource?.metadata?.source_role ??
			null;
		if (witnessRole === "primary_evidence")
			primaryWitnessed.add(rel.witnessed_claim);
	}

	let effectiveGroundedClaims = 0;
	let primaryEvidenceClaims = 0;
	for (const claimId of citedIds) {
		const rel = relationsByClaim.get(claimId);
		const intact = Boolean(
			rel?.source_id &&
				rel.passage_integrity === "intact" &&
				rel.quote_integrity === "present",
		);
		if (!intact) continue;
		effectiveGroundedClaims++;
		const isPrimary =
			primaryWitnessed.has(claimId) || rel.source_role !== "secondary_citation";
		if (isPrimary) primaryEvidenceClaims++;
	}

	return {
		effective_grounded_claims: effectiveGroundedClaims,
		primary_evidence_claims: primaryEvidenceClaims,
		structural_issues_count: checkResult.issues.length,
		grounding_warnings_count: checkResult.warnings.length,
		checked_references: checkResult.checked_references,
		passed: checkResult.passed,
	};
}

function deterministicBlindJudge(first, second) {
	const a = first.metrics,
		b = second.metrics;
	if (a.structural_issues_count !== b.structural_issues_count) {
		return a.structural_issues_count < b.structural_issues_count
			? "candidate_1"
			: "candidate_2";
	}
	if (a.effective_grounded_claims !== b.effective_grounded_claims) {
		return a.effective_grounded_claims > b.effective_grounded_claims
			? "candidate_1"
			: "candidate_2";
	}
	if (a.primary_evidence_claims !== b.primary_evidence_claims) {
		return a.primary_evidence_claims > b.primary_evidence_claims
			? "candidate_1"
			: "candidate_2";
	}
	if (a.grounding_warnings_count !== b.grounding_warnings_count) {
		return a.grounding_warnings_count < b.grounding_warnings_count
			? "candidate_1"
			: "candidate_2";
	}
	return "tie";
}

function mapBlindDecision(decision, firstName, secondName) {
	const raw = typeof decision === "string" ? decision : decision?.winner;
	if (raw === "tie") return "tie";
	if (raw === "candidate_1" || raw === "first") return firstName;
	if (raw === "candidate_2" || raw === "second") return secondName;
	throw new Error(
		`Invalid judge winner "${raw}". Expected candidate_1, candidate_2, or tie.`,
	);
}

/** Blind order-swapped comparison of two drafts against a frozen report packet. */
export function compareReportDrafts(
	dir,
	packetFile,
	draftAFile,
	draftBFile,
	opts = {},
) {
	const { packet, integrityOk } = readAndVerifyPacket(dir, packetFile);
	const current = buildReportPacket(dir);
	const checkOpts = {
		strict: Boolean(opts?.strict),
		...(opts?.semanticFile ? { semanticFile: opts.semanticFile } : {}),
	};
	const checkA = checkReportPacket(dir, packetFile, draftAFile, checkOpts);
	const checkB = checkReportPacket(dir, packetFile, draftBFile, checkOpts);
	const textA = readText(dir, draftAFile);
	const textB = readText(dir, draftBFile);
	const metricsA = computeDraftMetrics(current, textA, checkA);
	const metricsB = computeDraftMetrics(current, textB, checkB);

	const judge =
		typeof opts?.judge === "function" ? opts.judge : deterministicBlindJudge;
	const candA1 = { label: "candidate_1", text: textA, metrics: metricsA };
	const candB2 = { label: "candidate_2", text: textB, metrics: metricsB };
	const candB1 = { label: "candidate_1", text: textB, metrics: metricsB };
	const candA2 = { label: "candidate_2", text: textA, metrics: metricsA };

	const finalizeComparison = (resAB, resBA) => {
		const rawAB = typeof resAB === "string" ? resAB : resAB?.winner;
		const rawBA = typeof resBA === "string" ? resBA : resBA?.winner;
		const mappedAB = mapBlindDecision(resAB, "A", "B");
		const mappedBA = mapBlindDecision(resBA, "B", "A");
		const orderDisagreement = mappedAB !== mappedBA;
		return {
			schema: "grainulator.blind-compare/v1",
			packet_sha256: packet.packet_sha256,
			packet_consistent:
				integrityOk && canonicalJSON(packet) === canonicalJSON(current),
			draft_a: { file: draftAFile, ...metricsA },
			draft_b: { file: draftBFile, ...metricsB },
			orders: {
				A_then_B: {
					candidate_1: "A",
					candidate_2: "B",
					raw_winner: rawAB,
					mapped_winner: mappedAB,
				},
				B_then_A: {
					candidate_1: "B",
					candidate_2: "A",
					raw_winner: rawBA,
					mapped_winner: mappedBA,
				},
			},
			order_consistent: !orderDisagreement,
			order_disagreement: orderDisagreement,
			winner: orderDisagreement ? "inconclusive" : mappedAB,
		};
	};

	const resAB = judge(candA1, candB2);
	const resBA = judge(candB1, candA2);
	if (
		(resAB && typeof resAB.then === "function") ||
		(resBA && typeof resBA.then === "function")
	) {
		return Promise.all([resAB, resBA]).then(([a, b]) =>
			finalizeComparison(a, b),
		);
	}
	return finalizeComparison(resAB, resBA);
}

function dssePAE(payloadType, payloadBytes) {
	const typeBytes = Buffer.from(payloadType, "utf8");
	return Buffer.concat([
		Buffer.from(
			`DSSEv1 ${typeBytes.length} ${payloadType} ${payloadBytes.length} `,
			"utf8",
		),
		payloadBytes,
	]);
}

function readConfinedBytes(dir, name) {
	const file = confinedPath(dir, name);
	const read = readBoundedRegularFile(file, MAX_BYTES * 4);
	if (!read.ok) throw new Error(`Report input is unusable (${read.code}).`);
	const root = fs.realpathSync(dir);
	return {
		relativeName: path.relative(root, file).split(path.sep).join("/"),
		data: read.data,
	};
}

/** Produce an offline DSSE / in-toto Statement v1 provenance envelope (optionally Ed25519-signed). */
export function attestReportPacket(dir, packetFile, outFile, opts = {}) {
	const { packet, integrityOk } = readAndVerifyPacket(dir, packetFile);
	if (!integrityOk)
		throw new Error(
			"Cannot attest a packet that fails integrity verification.",
		);
	const packetEntry = readConfinedBytes(dir, packetFile);
	const subjects = [
		{
			name: packetEntry.relativeName,
			digest: { sha256: sha256(packetEntry.data) },
		},
	];
	if (opts?.draftFile !== undefined && opts?.draftFile !== null) {
		const draftEntry = readConfinedBytes(dir, opts.draftFile);
		subjects.push({
			name: draftEntry.relativeName,
			digest: { sha256: sha256(draftEntry.data) },
		});
	}
	const statement = {
		_type: IN_TOTO_STATEMENT_TYPE,
		subject: subjects,
		predicateType: REPORT_ATTESTATION_PREDICATE_TYPE,
		predicate: {
			schema: packet.schema,
			ledger_sha256: packet.ledger_sha256,
			packet_sha256: packet.packet_sha256,
			active_claims: Array.isArray(packet.claims) ? packet.claims.length : 0,
			intact_passages: Array.isArray(packet.passages)
				? packet.passages.filter((p) => p.integrity === "intact").length
				: 0,
		},
	};
	const payloadBytes = Buffer.from(canonicalJSON(statement), "utf8");
	const signatures = [];
	if (opts?.privateKeyPem) {
		const privateKey = createPrivateKey(opts.privateKeyPem);
		const publicKeyDer = createPublicKey(privateKey).export({
			type: "spki",
			format: "der",
		});
		const keyid = sha256(publicKeyDer);
		const sig = sign(
			null,
			dssePAE(DSSE_PAYLOAD_TYPE, payloadBytes),
			privateKey,
		).toString("base64");
		signatures.push({ keyid, sig });
	}
	const envelope = {
		payloadType: DSSE_PAYLOAD_TYPE,
		payload: payloadBytes.toString("base64"),
		signatures,
	};
	const root = fs.realpathSync(dir);
	const sourcePaths = [
		path.join(root, "claims.json"),
		...packet.passages.map((p) =>
			path.join(root, "evidence", "passages", `${p.sha256}.txt`),
		),
		confinedPath(dir, packetFile),
		...(opts?.draftFile ? [confinedPath(dir, opts.draftFile)] : []),
	];
	const target = writeConfinedJSON(
		dir,
		outFile,
		envelope,
		sourcePaths,
		"DSSE attestation artifact",
	);
	return {
		path: target,
		payloadType: DSSE_PAYLOAD_TYPE,
		signed: signatures.length > 0,
		packet_sha256: packet.packet_sha256,
		subjects: subjects.map((s) => s.name),
	};
}

/** Verify a DSSE / in-toto Statement v1 provenance envelope against disk subjects and optional Ed25519 public key. */
export function verifyReportAttestation(dir, attestationFile, opts = {}) {
	const envelope = JSON.parse(readText(dir, attestationFile));
	const issues = [];
	if (
		envelope?.payloadType !== DSSE_PAYLOAD_TYPE ||
		typeof envelope?.payload !== "string"
	) {
		issues.push({ code: "attestation_envelope_invalid" });
		return {
			status: "failed",
			passed: false,
			signed: false,
			signature_verified: null,
			subjects_verified: [],
			predicate: null,
			issues,
		};
	}

	let payloadBytes;
	let statement;
	try {
		payloadBytes = Buffer.from(envelope.payload, "base64");
		statement = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes),
		);
	} catch {
		issues.push({ code: "attestation_payload_invalid" });
		return {
			status: "failed",
			passed: false,
			signed: false,
			signature_verified: null,
			subjects_verified: [],
			predicate: null,
			issues,
		};
	}

	if (
		statement?._type !== IN_TOTO_STATEMENT_TYPE ||
		statement?.predicateType !== REPORT_ATTESTATION_PREDICATE_TYPE ||
		!Array.isArray(statement?.subject) ||
		statement.subject.length === 0
	) {
		issues.push({ code: "attestation_statement_invalid" });
	}

	const sigs = Array.isArray(envelope.signatures) ? envelope.signatures : [];
	const signed = sigs.length > 0;
	let signatureVerified = signed ? false : null;
	if (opts?.publicKeyPem) {
		if (!signed) {
			issues.push({ code: "attestation_signature_missing" });
			signatureVerified = false;
		} else {
			const pae = dssePAE(envelope.payloadType, payloadBytes);
			let pubKey;
			try {
				pubKey = createPublicKey(opts.publicKeyPem);
			} catch {
				pubKey = null;
			}
			const ok =
				Boolean(pubKey) &&
				sigs.some((entry) => {
					if (typeof entry?.sig !== "string" || !entry.sig) return false;
					try {
						return verify(null, pae, pubKey, Buffer.from(entry.sig, "base64"));
					} catch {
						return false;
					}
				});
			signatureVerified = ok;
			if (!ok) issues.push({ code: "attestation_signature_invalid" });
		}
	}

	const verifiedSubjects = [];
	for (const subject of statement?.subject ?? []) {
		const name = subject?.name;
		const expectedSha = subject?.digest?.sha256;
		if (typeof name !== "string" || !name || typeof expectedSha !== "string") {
			issues.push({
				code: "attestation_subject_invalid",
				subject: name ?? null,
			});
			continue;
		}
		let subjectFile;
		try {
			subjectFile = confinedPath(dir, name);
		} catch {
			issues.push({ code: "attestation_subject_unsafe_path", subject: name });
			continue;
		}
		const read = readBoundedRegularFile(subjectFile, MAX_BYTES * 4);
		if (!read.ok) {
			issues.push({
				code: "attestation_subject_missing",
				subject: name,
				reason: read.code,
			});
			continue;
		}
		const actualSha = sha256(read.data);
		if (actualSha !== expectedSha) {
			issues.push({
				code: "attestation_subject_digest_mismatch",
				subject: name,
				expected: expectedSha,
				actual: actualSha,
			});
			continue;
		}
		verifiedSubjects.push(name);
		try {
			const parsed = JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(read.data),
			);
			if (parsed?.schema === "grainulator.report-packet/v1") {
				const { packet_sha256, ...body } = parsed;
				if (
					packet_sha256 !== digest(body) ||
					packet_sha256 !== statement?.predicate?.packet_sha256 ||
					parsed.ledger_sha256 !== statement?.predicate?.ledger_sha256
				) {
					issues.push({ code: "attestation_packet_mismatch", subject: name });
				}
			}
		} catch {
			// Subject is not a JSON packet (e.g. draft.md), which only requires SHA-256 verification.
		}
	}

	return {
		status: issues.length ? "failed" : "verified",
		passed: issues.length === 0,
		signed,
		signature_verified: signatureVerified,
		subjects_verified: verifiedSubjects,
		predicate: statement?.predicate ?? null,
		issues,
	};
}

export async function reportCLI(args) {
	const help = [
		"grainulator report packet --dir SPRINT --out output/packet.json [--json]",
		"grainulator report check --dir SPRINT --packet output/packet.json [--draft output/draft.md] [--semantics output/semantic-eval.json] [--strict] [--json]",
		"grainulator report verify-semantics --dir SPRINT --packet output/packet.json --out output/semantic-eval.json [--json]",
		"grainulator report compare --dir SPRINT --packet output/packet.json --draft-a A.md --draft-b B.md [--json]",
		"grainulator report attest --dir SPRINT --packet output/packet.json --out output/packet.dsse.json [--draft output/draft.md] [--key PRIVKEY.pem] [--json]",
		"grainulator report verify-attestation --dir SPRINT --attestation output/packet.dsse.json [--pubkey PUBKEY.pem] [--json]",
		"Offline, local evidence snapshots; checks do not establish semantic support. Existing outputs are never overwritten.",
	].join("\n");
	if (!args.length || args.includes("--help") || args.includes("-h")) {
		console.log(help);
		return;
	}
	const [action, ...rest] = args,
		values = {};
	const allowedValueFlags = new Set([
		"--dir",
		"--out",
		"--packet",
		"--draft",
		"--semantics",
		"--draft-a",
		"--draft-b",
		"--key",
		"--pubkey",
		"--attestation",
	]);
	for (let index = 0; index < rest.length; index++) {
		const key = rest[index];
		if (key === "--json") {
			values.json = true;
			continue;
		}
		if (key === "--strict") {
			values.strict = true;
			continue;
		}
		if (
			!allowedValueFlags.has(key) ||
			!rest[index + 1] ||
			rest[index + 1].startsWith("--")
		)
			throw new Error(`Invalid report arguments.\n${help}`);
		if (values[key] !== undefined)
			throw new Error(`Duplicate report argument: ${key}`);
		values[key] = rest[++index];
	}
	if (!values["--dir"]) throw new Error("report requires an explicit --dir.");
	const hasOnly = (required, optional = []) => {
		const permitted = new Set(["--dir", ...required, ...optional]);
		for (const key of required) if (!values[key]) return false;
		for (const key of Object.keys(values)) {
			if (key === "json") continue;
			if (key === "strict") {
				if (!permitted.has("--strict")) return false;
				continue;
			}
			if (!permitted.has(key)) return false;
		}
		return true;
	};
	let result;
	if (action === "packet" && hasOnly(["--out"])) {
		result = writeReportPacket(values["--dir"], values["--out"]);
	} else if (
		action === "check" &&
		hasOnly(["--packet"], ["--draft", "--semantics", "--strict"])
	) {
		result = checkReportPacket(
			values["--dir"],
			values["--packet"],
			values["--draft"],
			{
				strict: Boolean(values.strict),
				...(values["--semantics"]
					? { semanticFile: values["--semantics"] }
					: {}),
			},
		);
		if (!result.passed) process.exitCode = 2;
	} else if (action === "verify-semantics" && hasOnly(["--packet", "--out"])) {
		result = await verifyReportSemantics(
			values["--dir"],
			values["--packet"],
			values["--out"],
		);
	} else if (
		action === "compare" &&
		hasOnly(["--packet", "--draft-a", "--draft-b"], ["--strict", "--semantics"])
	) {
		result = await compareReportDrafts(
			values["--dir"],
			values["--packet"],
			values["--draft-a"],
			values["--draft-b"],
			{
				strict: Boolean(values.strict),
				...(values["--semantics"]
					? { semanticFile: values["--semantics"] }
					: {}),
			},
		);
	} else if (
		action === "attest" &&
		hasOnly(["--packet", "--out"], ["--draft", "--key"])
	) {
		const privateKeyPem = values["--key"]
			? readExternalKeyPem(values["--key"])
			: undefined;
		result = attestReportPacket(
			values["--dir"],
			values["--packet"],
			values["--out"],
			{
				...(values["--draft"] ? { draftFile: values["--draft"] } : {}),
				...(privateKeyPem ? { privateKeyPem } : {}),
			},
		);
	} else if (
		action === "verify-attestation" &&
		hasOnly(["--attestation"], ["--pubkey"])
	) {
		const publicKeyPem = values["--pubkey"]
			? readExternalKeyPem(values["--pubkey"])
			: undefined;
		result = verifyReportAttestation(values["--dir"], values["--attestation"], {
			...(publicKeyPem ? { publicKeyPem } : {}),
		});
		if (!result.passed) process.exitCode = 2;
	} else {
		throw new Error(`Invalid report arguments.\n${help}`);
	}
	console.log(JSON.stringify(result, null, 2));
}
