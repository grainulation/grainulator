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
	"Sprint within the startup workspace. File paths are relative to it.",
);
const id = str("Existing active claim ID.");
const why = str("Explicit reason, preserved in history.");
const definitions = [
	[
		"evidence-health",
		"Recheck necessary-premise versions and current local observations. Returns affected paths and coverage including unresolved claims. Read-only; no processes or network. Use after edits; does not certify semantic truth.",
		{},
		[],
		inspectEvidence,
		true,
	],
	[
		"premise-links",
		"Bind explicit necessary premises to current active claim versions. Writes claims.json and history under its lock. Rejects cycles and unknown IDs. Use only for necessary premises; evidence corroboration/challenge links remain separate. Does not repair conclusions automatically.",
		{
			claim_id: id,
			premises: {
				type: "array",
				items: str("Necessary premise ID."),
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
		"Create a stated-tier successor and supersede its active predecessor atomically. Writes ledger history, preserving the old record and reason. Downstream conclusions need re-verification; use add_claim for unrelated findings.",
		{
			claim_id: id,
			id: str("New unique replacement ID."),
			content: str("Replacement text."),
			reason: why,
		},
		["claim_id", "id", "content", "reason"],
		correctClaim,
		false,
	],
	[
		"observe-source",
		"Capture a current local text file/range with full-file and range digests. Writes claims.json; reads stay inside the sprint and reject symlinks. No code execution or tier promotion. Use supersedes only after rechecking the same binding.",
		{
			claim_id: id,
			path: str("Relative local text file."),
			start_line: { type: "integer", minimum: 1 },
			end_line: { type: "integer", minimum: 1 },
			supersedes: str("Earlier current observation with the same binding."),
		},
		["claim_id", "path"],
		observeSource,
		false,
	],
	[
		"findings",
		"Read active claims with separate audit verdict, resolution, duplicate link and revision. Defaults to unverified/open. A fixed label alone does not prove a repair. Writes nothing.",
		{},
		[],
		listFindings,
		true,
	],
	[
		"finding-action",
		"Verify, resolve, reopen or reconcile a duplicate finding explicitly. Writes ledger history and rejects a stale expected_revision. Verification/fixed resolutions require a current observation. No automatic duplicate merging or tier promotion.",
		{
			claim_id: id,
			action: {
				type: "string",
				enum: ["verify", "resolve", "reopen", "duplicate"],
			},
			expected_revision: {
				type: "integer",
				minimum: 0,
				description: "Revision from findings; refresh after a mismatch.",
			},
			reason: why,
			verdict: { type: "string", enum: ["confirmed", "partial", "refuted"] },
			resolution: {
				type: "string",
				enum: ["fixed", "already_fixed", "wont_fix"],
			},
			observation_id: str(
				"Current source or passing execution observation; required for verify/fixed actions.",
			),
			duplicate_of: id,
		},
		["claim_id", "action", "expected_revision", "reason"],
		findingAction,
		false,
	],
	[
		"duplicate-candidates",
		"Suggest findings whose current source anchors overlap on one file version. Read-only; never merges. Distinct defects can share a line; reconcile actual duplicates with finding_action.",
		{},
		[],
		duplicateCandidates,
		true,
	],
	[
		"acceptance-check",
		"Identify missing explicit goal/completion fields in the existing sprint. Read-only; no model call or compulsory interview. Ask only about material returned gaps. Empty output is not proof of complete requirements.",
		{},
		[],
		acceptanceGaps,
		true,
	],
	[
		"acceptance-set",
		"Explicitly update goal/completion criteria with a recorded reason. Writes the locked ledger and preserves superseded completion constraints. Use after a material decision, not for mandatory preflight questions.",
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
export const TOOLS = definitions.map(
	([name, description, properties, required, , readOnly]) => ({
		name: name.replaceAll("-", "_"),
		description,
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
					text: JSON.stringify({ status: "error", message: error.message }),
				},
			],
			isError: true,
		});
	}
}
