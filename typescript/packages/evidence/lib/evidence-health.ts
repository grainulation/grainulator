import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
	Ledger,
	LedgerClaim,
	LedgerDiagnostic,
	Observation,
	SourceRange,
} from "./load-claims.js";
import { readBoundedRegularFile } from "./passages.js";

interface InspectionBudget {
	reads: number;
	bytes: number;
}
interface PremiseBlocker {
	premise: string;
	reason: string;
	path: string[];
}
const ordered = (value: unknown): unknown =>
	Array.isArray(value)
		? value.map(ordered)
		: value && typeof value === "object"
			? Object.fromEntries(
					Object.keys(value)
						.sort()
						.map((key) => [
							key,
							ordered((value as Record<string, unknown>)[key]),
						]),
				)
			: value;
export const evidenceDigest = (value: unknown) =>
	crypto
		.createHash("sha256")
		.update(JSON.stringify(ordered(value)))
		.digest("hex");
export const bytesDigest = (bytes: string | Buffer) =>
	crypto.createHash("sha256").update(bytes).digest("hex");

/** A necessary premise binds the actual recorded claim, never its replacement. */
export function premiseDigest(claim: LedgerClaim) {
	const {
		status,
		conflicts_with,
		resolved_by,
		resolution,
		audit,
		maintenance_history,
		...record
	} = claim;
	return evidenceDigest(record);
}

export function confinedEvidencePath(dir: string, relative: unknown) {
	if (
		typeof relative !== "string" ||
		!relative ||
		path.isAbsolute(relative) ||
		relative.includes("\\") ||
		relative.includes("\0") ||
		relative.split("/").includes("..")
	)
		throw new Error("Evidence paths must be relative paths inside the sprint.");
	const root = fs.realpathSync(dir);
	const parts = relative.split("/").filter((part) => part && part !== ".");
	if (!parts.length) throw new Error("Expected a file path.");
	let current = root;
	for (const part of parts) {
		current = path.join(current, part);
		try {
			if (fs.lstatSync(current).isSymbolicLink())
				throw new Error("Evidence paths cannot contain symlinks.");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return current;
}

export function captureSource(
	dir: string,
	relative: unknown,
	start = 1,
	end?: number,
	budget?: InspectionBudget,
): SourceRange {
	const file = confinedEvidencePath(dir, relative);
	const before = fs.statSync(file);
	if (budget) {
		if (--budget.reads < 0 || before.size > budget.bytes)
			throw new Error("Evidence inspection exceeds the aggregate read budget.");
		budget.bytes -= before.size;
	}
	const read = readBoundedRegularFile(file, 2 * 1024 * 1024);
	if (!read.ok) throw new Error(`Source is not readable (${read.code}).`);
	const text = new TextDecoder("utf-8", { fatal: true }).decode(read.data);
	if (text.includes("\0"))
		throw new Error("Source observations require text files.");
	const lines = text.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();
	end ??= Math.min(lines.length, start + 199);
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 1 ||
		end < start ||
		end > lines.length ||
		end - start >= 200
	)
		throw new Error("Source ranges must select 1–200 existing lines.");
	const after = fs.statSync(file);
	if (
		before.ino !== after.ino ||
		before.size !== after.size ||
		before.mtimeMs !== after.mtimeMs
	)
		throw new Error("Source changed during capture.");
	return {
		path: relative as string,
		start_line: start,
		end_line: end,
		file_sha256: bytesDigest(read.data),
		excerpt_sha256: bytesDigest(lines.slice(start - 1, end).join("\n")),
	};
}

export function inspectObservation(
	dir: string,
	observation: Observation,
	budget?: InspectionBudget,
) {
	try {
		if (observation?.kind === "source") {
			const current = captureSource(
				dir,
				observation.path,
				observation.start_line,
				observation.end_line,
				budget,
			);
			const intact =
				current.file_sha256 === observation.file_sha256 &&
				current.excerpt_sha256 === observation.excerpt_sha256;
			return {
				id: observation.id,
				kind: "source",
				status: intact ? "intact" : "changed",
				current,
			};
		}
		if (observation?.kind === "execution") {
			if (
				!Array.isArray(observation.inputs) ||
				!observation.inputs.length ||
				observation.inputs.length > 64
			)
				throw new Error("Execution requires 1–64 bound input files.");
			const inputs = observation.inputs.map((input) =>
				captureSource(
					dir,
					input.path,
					input.start_line,
					input.end_line,
					budget,
				),
			);
			const fresh = evidenceDigest(inputs) === observation.inputs_sha256;
			return {
				id: observation.id,
				kind: "execution",
				status: !fresh
					? "changed"
					: observation.input_changed
						? "changed_during_execution"
						: observation.failure
							? "error"
							: observation.exit_code === 0
								? "passed"
								: "failed",
				inputs_sha256: evidenceDigest(inputs),
			};
		}
		throw new Error("Unknown observation kind.");
	} catch (error) {
		return {
			id: observation?.id ?? null,
			kind: observation?.kind ?? null,
			status:
				(error as NodeJS.ErrnoException).code === "ENOENT"
					? "missing"
					: "unreadable",
			reason: (error as Error).message,
		};
	}
}

type ObservationBinding = Pick<Observation, "id" | "supersedes"> &
	(
		| { kind: "source"; path: string; start_line: number; end_line: number }
		| { kind: "execution"; argv: string[]; inputs: SourceRange[] }
	);
export function currentObservations<T extends ObservationBinding>(claim: {
	observations?: T[];
}): T[] {
	const records = claim.observations ?? [];
	if (!Array.isArray(records) || records.length > 128)
		throw new Error("Invalid observation list.");
	const prior = new Map<string, T>(),
		replaced = new Set<string>();
	for (const record of records) {
		if (
			typeof record?.id !== "string" ||
			!record.id ||
			prior.has(record.id) ||
			!["source", "execution"].includes(record.kind)
		)
			throw new Error("Observation IDs must be unique and kinds explicit.");
		if (record.supersedes !== undefined) {
			const old = prior.get(record.supersedes);
			if (!old || replaced.has(old.id) || old.kind !== record.kind)
				throw new Error(
					"Observation replacement must name a current earlier observation of the same kind.",
				);
			const binding = (observation: ObservationBinding) =>
				observation.kind === "source"
					? [observation.path, observation.start_line, observation.end_line]
					: [
							observation.argv,
							observation.inputs.map((input) => [
								input.path,
								input.start_line,
								input.end_line,
							]),
						];
			if (evidenceDigest(binding(old)) !== evidenceDigest(binding(record)))
				throw new Error(
					"Observation replacement must retain its source/command binding.",
				);
			replaced.add(old.id);
		}
		prior.set(record.id, record);
	}
	return records.filter((record) => !replaced.has(record.id));
}

/** Project one selected record without loading a ledger or reading source files. */
export function projectFinding(
	claim: LedgerClaim,
	observationStatuses: ReadonlyMap<string, string> = new Map(),
) {
	const observations = currentObservations(claim);
	const support = (id: string | undefined) =>
		!id
			? "not_recorded"
			: observations.some((item) => item.id === id)
				? observationStatuses.get(id)
				: "superseded";
	return {
		claim_id: claim.id,
		content: claim.content,
		audit: claim.audit || {
			revision: 0,
			verdict: "unverified",
			resolution: "open",
			duplicate_of: null,
		},
		verification_observation_status: support(claim.audit?.observation_id),
		resolution_observation_status: support(
			claim.audit?.resolution_observation_id,
		),
	};
}

/** Inspect only observations referenced by this record, then use the pure projection. */
export function inspectFinding(dir: string, claim: LedgerClaim) {
	const ids = new Set([
		claim.audit?.observation_id,
		claim.audit?.resolution_observation_id,
	]);
	const statuses = new Map(
		currentObservations(claim)
			.filter((item) => ids.has(item.id))
			.map((item) => [item.id, inspectObservation(dir, item).status]),
	);
	return projectFinding(claim, statuses);
}

/** Pure dependency projection plus bounded local source observations; no writes or processes. */
export function evidenceHealth(ledger: Pick<Ledger, "claims">, dir: string) {
	const claims = ledger.claims || [];
	if (!Array.isArray(claims) || claims.length > 10000)
		throw new Error("Expected at most 10000 claims.");
	const byId = new Map(claims.map((claim) => [claim.id, claim]));
	const errors: LedgerDiagnostic[] = [],
		children = new Map<string, string[]>(claims.map((claim) => [claim.id, []]));
	const degree = new Map(claims.map((claim) => [claim.id, 0]));
	const causes = new Map<string, PremiseBlocker[]>();
	let edges = 0;
	for (const claim of claims) {
		if (claim.premises === undefined) continue;
		if (!Array.isArray(claim.premises)) {
			errors.push({
				code: "E_PREMISE_LINK",
				message: `Claim ${claim.id}: premises must be an array.`,
				claims: [claim.id],
			});
			continue;
		}
		const seen = new Set();
		for (const link of claim.premises) {
			const parent = byId.get(link?.claim_id);
			if (
				!parent ||
				parent.id === claim.id ||
				seen.has(parent.id) ||
				!/^[a-f0-9]{64}$/.test(link.claim_sha256 || "")
			) {
				errors.push({
					code: "E_PREMISE_LINK",
					message: `Claim ${claim.id}: invalid, unknown or duplicate premise.`,
					claims: [claim.id],
				});
				continue;
			}
			if (++edges > 50000) throw new Error("Too many premise links.");
			seen.add(parent.id);
			children.get(parent.id)!.push(claim.id);
			degree.set(claim.id, degree.get(claim.id)! + 1);
			if (
				claim.status === "active" &&
				(parent.status !== "active" ||
					premiseDigest(parent) !== link.claim_sha256)
			) {
				const list = causes.get(claim.id) || [];
				list.push({
					premise: parent.id,
					reason:
						parent.status !== "active"
							? `premise_${parent.status}`
							: "premise_changed",
					path: [parent.id, claim.id],
				});
				causes.set(claim.id, list);
			}
		}
	}
	const ready = [...degree]
		.filter(([, n]) => n === 0)
		.map(([id]) => id)
		.sort();
	for (let i = 0; i < ready.length; i++)
		for (const child of children.get(ready[i]!)!) {
			degree.set(child, degree.get(child)! - 1);
			if (!degree.get(child)) ready.push(child);
		}
	if (ready.length !== claims.length || byId.size !== claims.length)
		errors.push({
			code: "E_PREMISE_GRAPH",
			message: "Premise graph has a cycle or duplicate claim IDs.",
			claims: [...degree].filter(([, n]) => n > 0).map(([id]) => id),
		});

	const observations = [];
	const inspectionBudget = { reads: 2000, bytes: 64 * 1024 * 1024 };
	let declared = 0;
	for (const claim of claims.filter((c) => c.status === "active")) {
		let records: Observation[];
		try {
			records = currentObservations<Observation>(claim);
		} catch {
			errors.push({
				code: "E_OBSERVATION",
				message: `Claim ${claim.id}: invalid observation list.`,
				claims: [claim.id],
			});
			continue;
		}
		if (records.length) declared++;
		const checks = records.map((observation) =>
			inspectObservation(dir, observation, inspectionBudget),
		);
		observations.push({
			claim_id: claim.id,
			required_support: ["tested", "production"].includes(claim.evidence)
				? "execution"
				: "source",
			checks,
		});
		if (
			checks.some((check) =>
				[
					"changed",
					"missing",
					"unreadable",
					"changed_during_execution",
					"error",
					"failed",
				].includes(check.status),
			)
		) {
			const list = causes.get(claim.id) || [];
			list.push({
				premise: claim.id,
				reason: "evidence_not_current",
				path: [claim.id],
			});
			causes.set(claim.id, list);
		}
	}
	for (const id of ready)
		for (const child of children.get(id)!) {
			if (byId.get(child)!.status !== "active" || !causes.has(id)) continue;
			const list = causes.get(child) || [];
			for (const cause of causes.get(id)!) {
				if (
					!list.some(
						(item) =>
							item.premise === cause.premise && item.reason === cause.reason,
					)
				)
					list.push({ ...cause, path: [...cause.path, child] });
			}
			causes.set(child, list);
		}
	const needs_reverification = [...causes]
		.filter(([id]) => byId.get(id)!.status === "active")
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([claim_id, blockers]) => ({ claim_id, blockers }));
	const sourceIntact = observations.filter((row) =>
		row.checks.some(
			(check) => check.kind === "source" && check.status === "intact",
		),
	).length;
	const executedPass = observations.filter((row) =>
		row.checks.some(
			(check) => check.kind === "execution" && check.status === "passed",
		),
	).length;
	const resolved = observations.filter(
		(row) =>
			row.checks.some(
				(check) =>
					check.kind === row.required_support &&
					["intact", "passed"].includes(check.status),
			) && !causes.has(row.claim_id),
	).length;
	return {
		schema: "grainulator.evidence-health/v1",
		errors,
		needs_reverification,
		observations,
		coverage: {
			total: observations.length,
			declared,
			source_intact: sourceIntact,
			executed_pass: executedPass,
			resolved,
			unresolved: observations.length - resolved,
			effective_coverage: observations.length
				? resolved / observations.length
				: 0,
		},
		limits:
			"Local byte/execution observations and declared necessary premises only; no semantic truth or hidden-dependency certification.",
	};
}

export function healthFingerprint(
	health: Pick<
		ReturnType<typeof evidenceHealth>,
		"errors" | "needs_reverification" | "observations"
	>,
) {
	return evidenceDigest({
		errors: health.errors,
		needs_reverification: health.needs_reverification,
		observations: health.observations,
	});
}
