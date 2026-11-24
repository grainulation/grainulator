import { outputSchema } from "./mcp-contracts.js";

const str = (description) => ({ type: "string", description });
const hints = (readOnly, destructive = false) => ({
	readOnlyHint: readOnly,
	destructiveHint: destructive,
	idempotentHint: readOnly,
	openWorldHint: false,
});

/** A supported evidence/local-memory/export profile, not the complete legacy toolset. */
export function compactTools(legacyTools) {
	const byName = new Map(legacyTools.map((tool) => [tool.name, tool]));
	const make = (
		name,
		legacy,
		description,
		properties,
		required,
		annotations,
		resultProperties,
	) => {
		const base = byName.get(legacy);
		return {
			...base,
			name,
			description,
			inputSchema: {
				...structuredClone(base.inputSchema),
				type: "object",
				additionalProperties: false,
				properties: properties ?? structuredClone(base.inputSchema.properties),
				required: required ?? base.inputSchema.required ?? [],
			},
			annotations: annotations ?? structuredClone(base.annotations),
			outputSchema: resultProperties
				? outputSchema(name, resultProperties)
				: structuredClone(base.outputSchema),
		};
	};
	const init = byName.get("init").inputSchema.properties;
	const search = byName.get("search").inputSchema.properties;
	const memory = byName.get("memory_search").inputSchema.properties;
	const convert = byName.get("exports_convert").inputSchema.properties;
	const tools = [
		make(
			"configure_sprint",
			"init",
			"Create a sprint or explicitly update its acceptance criteria. mode=create requires question and preserves force/backup rules; omitted done creates no completion criterion. mode=criteria requires reason and question or done; done replaces active completion criteria with preserved history, and question updates the goal. Use inspect_sprint to read criteria. This tool can replace a ledger only with explicit force in create mode.",
			{
				...init,
				done: str(
					"In create mode, omission creates no done-criteria claim and leaves an acceptance gap. In criteria mode, omission preserves existing completion criteria; a supplied update must be nonempty. Read inspect_sprint.acceptance for acceptance gaps.",
				),
				mode: {
					type: "string",
					enum: ["create", "criteria"],
					description:
						"create initializes; criteria updates only goal/completion history.",
				},
				reason: str("Required rationale for criteria updates."),
			},
			["mode"],
			hints(false, true),
		),
		make(
			"record_claim",
			"add_claim",
			"Record one new authored finding with a unique ID, type, evidence tier and provenance. Writes the locked ledger and optional quoted passage. Use import_claims for document batches, correct_claim for a successor, or observe_source to capture a current file; a recorded tier is not independently verified proof.",
		),
		make(
			"import_claims",
			"import_claims",
			"Import active document findings with stable source identity, collision mapping and preserved source provenance. Writes stated-tier findings atomically; repeated unchanged imports are no-ops. Use record_claim for authored findings and correct_claim to review changes; this is not a historical ledger restore.",
		),
		make(
			"correct_claim",
			"correct_claim",
			"Create a stated-tier successor and supersede its predecessor atomically, preserving history and rationale. Necessary dependents require re-verification. Use record_claim for unrelated findings or resolve_conflict for a contradictory pair.",
		),
		make(
			"resolve_conflict",
			"resolve",
			"Resolve a contradictory pair: retain winner, supersede loser and record rationale without verifying the winner. Writes the locked ledger; dependent conclusions are not rebound. Use correct_claim for correction without a conflict.",
		),
		make(
			"search_claims",
			"search",
			"Read matching sprint claim records with audit verdict, revision and observation freshness. Defaults to complete active records; include_inactive preserves historical access. Filter verdict/resolution when auditing findings. Use search_memory for other stored collections or inspect_sprint for diagnostic coverage.",
			{
				...search,
				verdict: {
					type: "string",
					enum: ["unverified", "confirmed", "partial", "refuted"],
					description: "Filter the finding audit verdict.",
				},
				resolution: {
					type: "string",
					enum: ["open", "fixed", "already_fixed", "wont_fix"],
					description: "Filter the audit resolution.",
				},
			},
		),
		make(
			"compile_sprint",
			"compile",
			"Validate the ledger and regenerate the configured compilation and topic artifacts, returning blockers and Auto/Manual next actions. Writes local compiler outputs; does not run verifiers or prove source truth. Use inspect_sprint for read-only diagnostics.",
		),
		make(
			"inspect_sprint",
			"status",
			"Read a fixed diagnostic report containing sprint status, evidence freshness, missing acceptance criteria and possible duplicate anchors. No execution, network or ledger writes. limit bounds each returned array, including truncated_paths; truncated_path_count counts all shortened paths. Use compile_sprint to regenerate stale compilation or search_claims for complete records.",
			{
				dir: init.dir,
				limit: {
					type: "integer",
					minimum: 1,
					maximum: 100,
					description:
						"Maximum items per diagnostic array, default 20; summaries retain counts.",
				},
			},
			[],
			hints(true),
			{
				sprint: {
					...outputSchema("status"),
					description: "Recorded sprint status and next actions.",
				},
				evidence: {
					...outputSchema("evidence_health"),
					description: "Premise/observation freshness report.",
				},
				acceptance: {
					...outputSchema("acceptance_check"),
					description: "Missing explicit goal/completion criteria.",
				},
				duplicates: {
					...outputSchema("duplicate_candidates"),
					description: "Overlapping source anchors; no merging.",
				},
				truncated_paths: {
					type: "array",
					items: { type: "string" },
					description: "Bounded paths whose arrays/strings were shortened.",
				},
				truncated_path_count: {
					type: "integer",
					description:
						"Total shortened paths, including entries omitted from truncated_paths.",
				},
			},
		),
		make(
			"link_premises",
			"premise_links",
			"Bind a conclusion's necessary premises to current active versions. Writes ledger history and rejects unknown IDs/cycles; this is distinct from supporting-source links. Use correct_claim when a premise changes and re-verify affected conclusions.",
		),
		make(
			"observe_source",
			"observe_source",
			"Capture a current confined local text file or line range for an existing claim, recording file/range digests in the ledger. Rejects symlinks; never executes commands or promotes tiers. Use record_claim to add a finding, then capture its source here.",
		),
		make(
			"update_finding",
			"finding_action",
			"Record an explicit audit verdict, resolution, reopening or duplicate decision under expected_revision. Writes history; stale revisions fail. Verification/fixed decisions require a current observation. Use search_claims to refresh the revision; labeling fixed alone cannot prove repair.",
		),
		make(
			"search_memory",
			"memory_search",
			"Search reusable local collections/packs with query, or omit query to list their catalogs. May initialize the local index/acquire its lock; no network or sprint import. Use import_memory to copy selected evidence, store_memory to save it, and search_claims for the current sprint.",
			{
				...memory,
				query: str(
					"Search terms; omit to return collection and knowledge-pack catalogs.",
				),
			},
			[],
		),
		make(
			"import_memory",
			"memory_pull",
			"Import a selected local knowledge pack or collection into the sprint, deduplicating and remapping IDs. Writes the destination ledger and may initialize local memory. pack is a name, not a path; into stays within the sprint. Use import_claims for document findings or search_memory to discover reusable collections.",
		),
		make(
			"store_memory",
			"memory_store",
			"Save a sprint as a named reusable local collection under the memory lock. An existing name can be replaced; no upload/publication. from must remain within the sprint. Use search_memory to inspect available collections and import_memory to reuse one.",
		),
		make(
			"export_document",
			"exports_convert",
			"Omit format and supply only dir to list formats (tool-only catalog fallback); otherwise format is required to render evidence inline, preview lines, or save with output. Inline/preview do not write; output can replace an allowed local artifact and cannot overwrite evidence or host configuration. lines and output are mutually exclusive. Discover formats also at grainulator://exports/formats; no remote publication.",
			{
				...convert,
				lines: {
					type: "integer",
					minimum: 1,
					maximum: 200,
					description:
						"Preview line count; omit for inline/save. Cannot combine with output.",
				},
			},
			[],
			hints(false, true),
		),
	];

	for (const tool of tools) {
		if (tool.name === "configure_sprint") {
			tool.outputSchema.properties.question = str(
				"Current goal after criteria update.",
			);
			tool.outputSchema.properties.done = {
				type: ["string", "null"],
				description: "Updated completion criterion, if provided.",
			};
			tool.inputSchema.oneOf = [
				{
					properties: { mode: { const: "create" }, reason: false },
					required: ["question"],
				},
				{
					properties: {
						mode: { const: "criteria" },
						reason: { type: "string", pattern: "\\S", maxLength: 4096 },
						question: { type: "string", pattern: "\\S" },
						done: { type: "string", pattern: "\\S" },
						force: false,
						audience: false,
						constraints: false,
					},
					required: ["reason"],
					anyOf: [{ required: ["question"] }, { required: ["done"] }],
				},
			];
		}
		if (tool.name === "search_memory") {
			tool.inputSchema.oneOf = [
				{
					properties: {
						query: false,
						limit: false,
						type: false,
						evidence: false,
					},
				},
				{ required: ["query"] },
			];
			Object.assign(tool.outputSchema.properties, {
				collections: {
					type: "array",
					description: "Collection catalog when query is omitted.",
				},
				packs: {
					type: "array",
					description: "Knowledge-pack catalog when query is omitted.",
				},
				collection_count: {
					type: "number",
					description: "Collection catalog size.",
				},
				pack_count: {
					type: "number",
					description: "Knowledge-pack catalog size.",
				},
			});
		}
		if (tool.name === "export_document") {
			tool.inputSchema.oneOf = [
				{
					properties: {
						format: false,
						lines: false,
						output: false,
						source: false,
					},
				},
				{ required: ["format"] },
			];
			tool.inputSchema.not = { required: ["lines", "output"] };
			Object.assign(tool.outputSchema.properties, {
				formats: outputSchema("exports_formats").properties.formats,
				count: outputSchema("exports_formats").properties.count,
				preview: str("Requested preview lines."),
				totalLines: {
					type: "number",
					description: "Lines in the bounded inline conversion.",
				},
				showing: { type: "number", description: "Returned preview lines." },
				hasMore: {
					type: "boolean",
					description:
						"Whether more rendered lines exist in the bounded inline conversion.",
				},
			});
		}
	}
	return tools;
}

function validateArgs(tool, args) {
	if (!args || typeof args !== "object" || Array.isArray(args))
		throw new Error("Tool arguments must be an object.");
	const schema = tool.inputSchema;
	for (const key of Object.keys(args))
		if (!Object.hasOwn(schema.properties, key))
			throw new Error(`Unsupported ${tool.name} argument: ${key}`);
	for (const key of schema.required)
		if (args[key] === undefined) throw new Error(`Required field: ${key}`);
	for (const [key, value] of Object.entries(args)) {
		const property = schema.properties[key];
		const type = property.type;
		if (
			(type === "string" && typeof value !== "string") ||
			(type === "boolean" && typeof value !== "boolean") ||
			(type === "array" && !Array.isArray(value)) ||
			(type === "object" &&
				(!value || typeof value !== "object" || Array.isArray(value))) ||
			((type === "number" || type === "integer") &&
				(typeof value !== "number" || !Number.isFinite(value))) ||
			(type === "integer" && !Number.isInteger(value))
		)
			throw new Error(`${key} must be ${type}.`);
		if (property.enum && !property.enum.includes(value))
			throw new Error(`Unsupported ${key}.`);
		if (
			(property.minimum !== undefined && value < property.minimum) ||
			(property.maximum !== undefined && value > property.maximum)
		)
			throw new Error(`${key} is outside the supported range.`);
	}
}

function bounded(value, limit, truncated, location = "", depth = 0) {
	if (depth > 12) {
		truncated.push(location);
		return null;
	}
	if (typeof value === "string" && value.length > 4096) {
		truncated.push(location);
		return `${value.slice(0, 4096)} [truncated]`;
	}
	if (Array.isArray(value)) {
		if (value.length > limit) truncated.push(location);
		return value
			.slice(0, limit)
			.map((item, index) =>
				bounded(item, limit, truncated, `${location}/${index}`, depth + 1),
			);
	}
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				bounded(item, limit, truncated, `${location}/${key}`, depth + 1),
			]),
		);
	return value;
}

/** Carry the backend's business failure through composite routing unchanged. */
export class CompactBusinessError extends Error {
	constructor(result, data) {
		super(data.message || data.error || "Operation failed.");
		this.result = result;
	}
}

export async function callCompact(tool, args, call) {
	validateArgs(tool, args);
	const callData = async (name, arguments_) => {
		const response = JSON.parse(
			await call("tools/call", { name, arguments: arguments_ }, 1),
		);
		if (response.error) throw new Error(response.error.message);
		const data = JSON.parse(response.result.content[0].text);
		if (response.result.isError || data.status === "error")
			throw new CompactBusinessError(response.result, data);
		return data;
	};
	const common = args.dir === undefined ? {} : { dir: args.dir };
	switch (tool.name) {
		case "configure_sprint": {
			const { mode, ...rest } = args;
			if (mode === "create") {
				if (rest.reason !== undefined)
					throw new Error("reason is only supported in criteria mode.");
				return callData("init", rest);
			}
			for (const key of ["force", "constraints", "audience"])
				if (rest[key] !== undefined)
					throw new Error(`${key} is only supported in create mode.`);
			return callData("acceptance_set", rest);
		}
		case "search_claims": {
			const { verdict, resolution, ...rest } = args;
			const result = await callData("search", { full: true, ...rest });
			result.claims = result.claims.filter(
				(claim) =>
					(!verdict || claim.audit?.verdict === verdict) &&
					(!resolution || claim.audit?.resolution === resolution),
			);
			result.count = result.claims.length;
			return result;
		}
		case "inspect_sprint": {
			const report = {};
			for (const [section, name] of [
				["sprint", "status"],
				["evidence", "evidence_health"],
				["acceptance", "acceptance_check"],
				["duplicates", "duplicate_candidates"],
			])
				report[section] = await callData(name, common);
			const truncated_paths = [];
			const limit = args.limit ?? 20;
			const result = bounded(report, limit, truncated_paths);
			return {
				status: "ok",
				...result,
				truncated_paths: truncated_paths.slice(0, limit),
				truncated_path_count: truncated_paths.length,
			};
		}
		case "search_memory":
			if (args.query === undefined) {
				if (Object.keys(args).some((key) => key !== "dir"))
					throw new Error(
						"Catalog listing accepts only dir; provide query for search filters.",
					);
				const collections = await callData("memory_list", common),
					packs = await callData("memory_packs", common);
				return {
					status: "ok",
					collections: collections.collections,
					packs: packs.packs,
					collection_count: collections.count,
					pack_count: packs.count,
				};
			}
			return callData("memory_search", args);
		case "export_document": {
			if (args.format === undefined) {
				if (Object.keys(args).some((key) => key !== "dir"))
					throw new Error(
						"Catalog listing accepts only dir; provide format to render.",
					);
				return callData("exports_formats", common);
			}
			const { lines, ...rest } = args;
			if (lines !== undefined && rest.output !== undefined)
				throw new Error("lines and output are mutually exclusive.");
			return callData(
				lines === undefined ? "exports_convert" : "exports_preview",
				lines === undefined ? rest : { ...rest, lines },
			);
		}
		default: {
			const names = {
				record_claim: "add_claim",
				import_claims: "import_claims",
				correct_claim: "correct_claim",
				resolve_conflict: "resolve",
				compile_sprint: "compile",
				link_premises: "premise_links",
				observe_source: "observe_source",
				update_finding: "finding_action",
				import_memory: "memory_pull",
				store_memory: "memory_store",
			};
			return callData(names[tool.name], args);
		}
	}
}
