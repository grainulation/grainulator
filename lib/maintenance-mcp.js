// Generated from typescript/lib/maintenance-mcp.ts; edit that source and run npm run build:types.
import {
	acceptanceGaps,
	correctClaim,
	duplicateCandidates,
	findingAction,
	inspectEvidence,
	linkPremises,
	listFindings,
	observeSource,
	setAcceptance,
} from "../packages/evidence/lib/maintenance.js";
import { jsonRpcResponse } from "../packages/shared/lib/mcp.js";
const str = (description) => ({ type: "string", description });
const directory = str(
	"Sprint directory inside the startup workspace; omitted uses that workspace. Relative evidence paths resolve inside the selected sprint. Example: research/cache.",
);
const id = str(
	"ID of an existing active finding in this sprint, for example r001; unknown or historical IDs are rejected for mutations.",
);
const why = str(
	"Nonempty decision rationale, at most 4096 Unicode characters; stored unchanged apart from surrounding whitespace in audit history.",
);
const definitions = [
	[
		"evidence-health",
		"Inspect premise versions and local observation freshness after edits. Returns affected claims, observations and coverage without writes, network or execution. Use compile to regenerate artifacts, or observe_source to record a new capture; intact bytes do not establish semantic support.",
		{},
		[],
		inspectEvidence,
		true,
	],
	[
		"premise-links",
		"Replace a conclusion's necessary-premise links with current active versions; returns claim_id and bound premises. Writes locked ledger history and rejects unknown IDs/cycles. Use correct_claim when a premise changes; corroborating sources belong in add_claim provenance, not dependency links.",
		{
			claim_id: id,
			premises: {
				type: "array",
				items: str(
					"ID of an existing active necessary premise, for example r002; self-links and dependency cycles are rejected.",
				),
				description:
					"Replace this conclusion's complete necessary-premise list with up to 64 unique active IDs. An empty array removes its declared links; source corroboration belongs in claim provenance.",
				examples: [["r002"]],
				maxItems: 64,
				uniqueItems: true,
			},
			reason: why,
		},
		["claim_id", "premises", "reason"],
		linkPremises,
		false,
	],
	[
		"correct-claim",
		"Create a stated-tier successor and supersede its active predecessor atomically; returns previous/replacement IDs and dependents needing re-verification. Preserves locked ledger history and rejects reused IDs. Use add_claim for an unrelated finding or resolve for an explicit conflict.",
		{
			claim_id: id,
			id: str(
				"New nonempty claim ID, unique within this sprint, for example r003. The predecessor remains as superseded history.",
			),
			content: str(
				"Nonempty corrected claim content; the successor inherits its predecessor's type/topic and starts at stated evidence.",
			),
			reason: why,
		},
		["claim_id", "id", "content", "reason"],
		correctClaim,
		false,
	],
	[
		"observe-source",
		"Capture a current local text range and return its observation ID, path/range and digests. Writes ledger history; unreadable, oversized or escaped sources fail. Use supersedes only to recheck the same binding, or evidence_health to inspect existing captures; no execution or tier promotion.",
		{
			claim_id: id,
			path: str(
				"UTF-8 text file relative to this sprint, for example src/cache.ts. Absolute paths, traversal, symlinks, NUL bytes and files larger than 2 MiB are rejected.",
			),
			start_line: {
				type: "integer",
				minimum: 1,
				default: 1,
				description:
					"First included line, numbered from 1. Defaults to 1; the selected inclusive range must contain 1–200 existing lines.",
				examples: [1],
			},
			end_line: {
				type: "integer",
				minimum: 1,
				description:
					"Last included line. Omitted selects the lesser of the file's last line and start_line+199; must be at least start_line and span at most 200 lines.",
				examples: [20],
			},
			supersedes: str(
				"Current observation ID to replace after rechecking the same file/range binding. Omit to append a first observation; a mismatched or historical ID is rejected.",
			),
		},
		["claim_id", "path"],
		observeSource,
		false,
	],
	[
		"findings",
		"Read finding audit records with verdict, resolution, duplicate link, revision and observation freshness; missing audits appear unverified/open. Writes nothing. Use search for content filtering and finding_action with the returned revision for a change; fixed labels alone do not prove a repair.",
		{
			include_inactive: {
				type: "boolean",
				description:
					"False by default; true also returns historical claim states with the same verdict, resolution, revision and observation-freshness fields.",
			},
		},
		[],
		listFindings,
		true,
	],
	[
		"finding-action",
		"Update a finding audit verdict, resolution, reopening or duplicate link; returns its incremented audit revision. Writes locked ledger history; stale revisions and missing required observations fail. Use findings to refresh the revision or duplicate_candidates to inspect overlaps; labels do not promote evidence tiers.",
		{
			claim_id: id,
			action: {
				type: "string",
				enum: ["verify", "resolve", "reopen", "duplicate"],
				description:
					"verify records verdict+observation_id; resolve records resolution and, for fixed/already_fixed, observation_id; reopen clears resolution/duplicate state; duplicate links duplicate_of. Every transition requires the current expected_revision.",
				examples: ["verify"],
			},
			expected_revision: {
				type: "integer",
				minimum: 0,
				description:
					"Current finding audit revision returned by findings or compact search_claims, starting at 0. A stale value fails without writing; refresh before retrying.",
			},
			reason: why,
			verdict: {
				type: "string",
				enum: ["confirmed", "partial", "refuted"],
				description:
					"Required for action=verify: confirmed supports the finding, partial records limited support, refuted records contrary evidence. A current intact/passing observation is also required.",
			},
			resolution: {
				type: "string",
				enum: ["fixed", "already_fixed", "wont_fix"],
				description:
					"Required for action=resolve. fixed/already_fixed require a current observation_id; wont_fix requires the recorded reason but no observation. Does not run a verifier.",
			},
			observation_id: str(
				"Current source or passing execution observation; required for verify/fixed actions.",
			),
			duplicate_of: str(
				"Required for action=duplicate: another existing active finding ID to retain as canonical. Self-links and duplicate cycles are rejected.",
			),
		},
		["claim_id", "action", "expected_revision", "reason"],
		findingAction,
		false,
	],
	[
		"duplicate-candidates",
		"Read candidate finding pairs whose intact source ranges overlap on one file version. Returns candidate IDs, path, digest and overlap; writes nothing. Distinct defects can share an anchor. Use finding_action for an explicit duplicate decision or search to inspect claim text.",
		{},
		[],
		duplicateCandidates,
		true,
	],
	[
		"acceptance-check",
		"Read missing explicit goal/completion criteria as questions and clarification_needed. No writes or model calls; an empty gap list does not prove complete requirements. Use acceptance_set after a material decision, or status for general sprint diagnostics.",
		{},
		[],
		acceptanceGaps,
		true,
	],
	[
		"acceptance-set",
		"Update the goal, completion criteria, or both with a recorded reason; returns the resulting question and done text. Writes locked ledger history and supersedes earlier completion constraints. Use acceptance_check to inspect gaps or init for a new sprint; reason alone fails without an update.",
		{
			question: str("New concrete goal, if changing it."),
			done: str("Observable completion criteria, if changing them."),
			reason: why,
		},
		["reason"],
		setAcceptance,
		false,
	],
];
const TOOL_EXAMPLES = {
	"evidence-health": {},
	"premise-links": {
		claim_id: "r001",
		premises: ["r002"],
		reason: "The conclusion requires the isolation premise.",
	},
	"correct-claim": {
		claim_id: "r001",
		id: "r003",
		content: "The cache isolates keys only within one tenant.",
		reason: "A boundary test disproved the broader claim.",
	},
	"observe-source": {
		claim_id: "r001",
		path: "src/cache.ts",
		start_line: 1,
		end_line: 10,
	},
	findings: {},
	"finding-action": {
		claim_id: "r001",
		action: "verify",
		expected_revision: 0,
		reason: "Reviewed the current captured source.",
		verdict: "confirmed",
		observation_id: "00000000-0000-4000-8000-000000000001",
	},
	"duplicate-candidates": {},
	"acceptance-check": {},
	"acceptance-set": {
		done: "Tenant isolation regression passes.",
		reason: "The acceptance test was agreed during review.",
	},
};
export const TOOLS = definitions.map(
	([name, description, properties, required, , readOnly]) => ({
		name: name.replaceAll("-", "_"),
		description: `${description} Example: ${JSON.stringify(TOOL_EXAMPLES[name])}`,
		annotations: {
			readOnlyHint: readOnly,
			destructiveHint: false,
			idempotentHint: readOnly,
			openWorldHint: false,
		},
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: { dir: directory, ...properties },
			required,
			examples: [TOOL_EXAMPLES[name]],
			...(name === "finding-action"
				? {
						oneOf: [
							{
								properties: { action: { const: "verify" } },
								required: ["verdict", "observation_id"],
							},
							{
								properties: {
									action: { const: "resolve" },
									resolution: { const: "wont_fix" },
								},
								required: ["resolution"],
							},
							{
								properties: {
									action: { const: "resolve" },
									resolution: { enum: ["fixed", "already_fixed"] },
								},
								required: ["resolution", "observation_id"],
							},
							{ properties: { action: { const: "reopen" } } },
							{
								properties: { action: { const: "duplicate" } },
								required: ["duplicate_of"],
							},
						],
					}
				: {}),
			...(name === "acceptance-set"
				? { anyOf: [{ required: ["question"] }, { required: ["done"] }] }
				: {}),
		},
	}),
);
export async function handleRequest(dir, method, params, id) {
	if (method !== "tools/call")
		throw new Error("Maintenance exposes tools only.");
	const definition = definitions.find(
		([name]) => params.name === name.replaceAll("-", "_"),
	);
	try {
		if (!definition) throw new Error("Unknown maintenance tool.");
		const args = params.arguments || {};
		const allowed = new Set(["dir", ...Object.keys(definition[2])]);
		if (Object.keys(args).some((key) => !allowed.has(key)))
			throw new Error("Unsupported maintenance tool argument.");
		for (const key of definition[3])
			if (args[key] === undefined) throw new Error(`Required field: ${key}`);
		const result = definition[4](dir, args);
		return jsonRpcResponse(id, {
			content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			isError: false,
		});
	} catch (error) {
		return jsonRpcResponse(id, {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						status: "error",
						message: error.message,
					}),
				},
			],
			isError: true,
		});
	}
}
