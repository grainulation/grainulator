import { outputSchema } from "./mcp-contracts.js";

type ResultSchema = ReturnType<typeof outputSchema>;
type ResultProperties = NonNullable<ResultSchema["properties"]>;
interface InputProperty {
	type?: string | readonly string[];
	enum?: readonly unknown[];
	minimum?: number;
	maximum?: number;
	description?: string;
	default?: unknown;
}
type InputProperties = Record<string, InputProperty>;
interface InputSchema {
	description?: string;
	type?: string;
	additionalProperties?: boolean;
	properties: InputProperties;
	required?: readonly string[];
	oneOf?: unknown[];
	not?: unknown;
	examples?: Args[];
}
interface LegacyTool {
	title?: string | undefined;
	description?: string;
	name: string;
	inputSchema: InputSchema;
	outputSchema: ResultSchema;
	annotations?: unknown;
}
type Args = Record<string, unknown>;
type BackendCall = (
	method: string,
	params: Args,
	id: number,
) => Promise<string | null>;
const str = (description: string) => ({ type: "string" as const, description });
const hints = (readOnly: boolean, destructive = false) => ({
	readOnlyHint: readOnly,
	destructiveHint: destructive,
	idempotentHint: readOnly,
	openWorldHint: false,
});

const guidance: Record<string, { title: string; example: Args }> = {
	configure_sprint: {
		title: "Create sprint or update acceptance criteria",
		example: {
			mode: "create",
			question: "What causes the service timeout?",
			done: "Identify the cause and verify the repair.",
		},
	},
	record_claim: {
		title: "Record an authored evidence claim",
		example: {
			id: "r001",
			type: "factual",
			topic: "timeouts",
			content: "The service timeout is configured to 30 seconds.",
		},
	},
	import_claims: {
		title: "Import active findings from a document",
		example: {
			source: "docs/incident.md",
			claims: [
				{
					id: "r004",
					type: "factual",
					topic: "timeouts",
					content: "The incident report records a 30-second request deadline.",
				},
			],
		},
	},
	correct_claim: {
		title: "Correct a claim while preserving history",
		example: {
			claim_id: "r001",
			id: "r002",
			content: "The client request deadline is configured to 30 seconds.",
			reason: "Distinguish client deadline from service execution time.",
		},
	},
	resolve_conflict: {
		title: "Resolve a contradictory claim pair",
		example: {
			winner: "r002",
			loser: "r003",
			reason: "The current client configuration supports r002.",
		},
	},
	search_claims: {
		title: "Search current or historical sprint claims",
		example: { query: "deadline" },
	},
	compile_sprint: {
		title: "Compile evidence and propose next actions",
		example: {},
	},
	inspect_sprint: {
		title: "Inspect evidence freshness and acceptance gaps",
		example: { limit: 10 },
	},
	link_premises: {
		title: "Bind necessary premises to a conclusion",
		example: {
			claim_id: "r002",
			premises: ["r004"],
			reason: "The conclusion depends on the incident report deadline.",
		},
	},
	observe_source: {
		title: "Capture a current local source observation",
		example: {
			claim_id: "r002",
			path: "src/service.ts",
			start_line: 1,
			end_line: 2,
		},
	},
	update_finding: {
		title: "Apply a revision-guarded finding audit decision",
		example: {
			claim_id: "r002",
			action: "reopen",
			expected_revision: 0,
			reason: "Recheck the deadline after configuration changes.",
		},
	},
	search_memory: {
		title: "Search local reusable evidence or list catalogs",
		example: { query: "deadline retry", limit: 5 },
	},
	import_memory: {
		title: "Import reusable local memory into a sprint",
		example: { pack: "prior-findings" },
	},
	store_memory: {
		title: "Save sprint claims as reusable local memory",
		example: { name: "prior-findings" },
	},
	export_document: {
		title: "Render evidence, preview a document or list formats",
		example: { format: "markdown", lines: 10 },
	},
};

/** A supported evidence/local-memory/export profile, not the complete legacy toolset. */
export function compactTools(legacyTools: readonly LegacyTool[]) {
	const byName = new Map(legacyTools.map((tool) => [tool.name, tool]));
	const make = (
		name: string,
		legacy: string,
		description: string,
		properties?: InputProperties,
		required?: string[],
		annotations?: ReturnType<typeof hints>,
		resultProperties?: ResultProperties,
	): LegacyTool => {
		const base = byName.get(legacy)!;
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
	const init = byName.get("init")!.inputSchema.properties;
	const search = byName.get("search")!.inputSchema.properties;
	const memory = byName.get("memory_search")!.inputSchema.properties;
	const convert = byName.get("exports_convert")!.inputSchema.properties;
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
				full: {
					...search.full,
					type: "boolean",
					default: true,
					description:
						"Return complete records by default. Set false for 200-UTF-16-unit content snippets with a truncated flag; id always returns a complete record.",
				},
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
				dir: init.dir!,
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
			"Search stored local collections with OR-matched query terms and 200-unit snippets, or omit query to list collection and unimported pack catalogs. May initialize the local index/acquire its lock; no network or sprint import. Use import_memory to copy selected evidence, store_memory to save it, and search_claims for the current sprint.",
			{
				...memory,
				query: str(
					"Case-insensitive search terms use OR matching (any term can match); hits contain 200-unit text snippets. Omit query to return collection and knowledge-pack catalogs; catalog mode accepts only dir.",
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
		const help = guidance[tool.name];
		if (!help) throw new Error(`Missing compact tool guidance: ${tool.name}`);
		tool.title = help.title;
		tool.inputSchema.description = `Arguments for ${tool.name}. Paths are confined to the configured local workspace.`;
		tool.inputSchema.examples = [structuredClone(help.example)];
		tool.description += ` Example: ${JSON.stringify(help.example)}`;
		if (tool.name === "configure_sprint") {
			tool.outputSchema.properties!.question = str(
				"Current goal after criteria update.",
			);
			tool.outputSchema.properties!.done = {
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
		if (tool.name === "import_memory") {
			tool.inputSchema.properties.pack = {
				...tool.inputSchema.properties.pack,
				description:
					"Exact knowledge-pack name or collection ID returned by search_memory with query omitted. This is a catalog identifier, never a filesystem path.",
			};
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
			Object.assign(tool.outputSchema.properties!, {
				collections: outputSchema("memory_list").properties!.collections,
				packs: outputSchema("memory_packs").properties!.packs,
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
			tool.inputSchema.properties.format = {
				...tool.inputSchema.properties.format,
				description:
					"Rendering format ID returned by export_document with format omitted, such as markdown or csv. Required for rendering; omit format, source, lines and output together to list available formats.",
			};
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
			Object.assign(tool.outputSchema.properties!, {
				formats: outputSchema("exports_formats").properties!.formats,
				count: outputSchema("exports_formats").properties!.count,
				preview: str("Requested preview lines."),
				totalLines: {
					type: "number",
					description:
						"Lines in the complete rendered export before preview limits.",
				},
				showing: { type: "number", description: "Returned preview lines." },
				hasMore: {
					type: "boolean",
					description:
						"Whether any rendered content was omitted by the requested line count or the 10,000-unit preview character limit.",
				},
			});
		}
	}
	return tools;
}

function validateArgs(tool: LegacyTool, args: unknown): asserts args is Args {
	if (!args || typeof args !== "object" || Array.isArray(args))
		throw new Error("Tool arguments must be an object.");
	const schema = tool.inputSchema;
	for (const key of Object.keys(args))
		if (!Object.hasOwn(schema.properties, key))
			throw new Error(`Unsupported ${tool.name} argument: ${key}`);
	for (const key of schema.required!)
		if (!Object.hasOwn(args, key) || (args as Args)[key] === undefined)
			throw new Error(`Required field: ${key}`);
	for (const [key, value] of Object.entries(args)) {
		const property = schema.properties[key]!;
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
			(property.minimum !== undefined &&
				(value as number) < property.minimum) ||
			(property.maximum !== undefined && (value as number) > property.maximum)
		)
			throw new Error(`${key} is outside the supported range.`);
	}
}

function bounded(
	value: unknown,
	limit: number,
	truncated: string[],
	location = "",
	depth = 0,
): unknown {
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
	declare readonly result: Record<string, unknown>;
	constructor(
		result: Record<string, unknown>,
		data: { message?: string; error?: string },
	) {
		super(data.message || data.error || "Operation failed.");
		this.result = result;
	}
}

export async function callCompact(
	tool: LegacyTool,
	args: unknown,
	call: BackendCall,
) {
	validateArgs(tool, args);
	const callData = async (name: string, arguments_: Args) => {
		const response = JSON.parse(
			(await call("tools/call", { name, arguments: arguments_ }, 1))!,
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
				if (!Object.hasOwn(rest, "question"))
					throw new Error("Required field: question");
				if (rest.reason !== undefined)
					throw new Error("reason is only supported in criteria mode.");
				return callData("init", rest);
			}
			for (const key of ["force", "constraints", "audience"])
				if (rest[key] !== undefined)
					throw new Error(`${key} is only supported in create mode.`);
			if (
				typeof rest.reason !== "string" ||
				!rest.reason.trim() ||
				[...rest.reason].length > 4096
			)
				throw new Error(
					"A nonempty reason of at most 4096 characters is required.",
				);
			if (!Object.hasOwn(rest, "question") && !Object.hasOwn(rest, "done"))
				throw new Error("Criteria updates require question or done.");
			for (const key of ["question", "done"])
				if (Object.hasOwn(rest, key) && !(rest[key] as string).trim())
					throw new Error(`${key} must be nonempty in criteria mode.`);
			return callData("acceptance_set", rest);
		}
		case "search_claims": {
			const { verdict, resolution, ...rest } = args;
			const result = await callData("search", { full: true, ...rest });
			result.claims = result.claims.filter(
				(claim: { audit?: { verdict?: string; resolution?: string } }) =>
					(!verdict || claim.audit?.verdict === verdict) &&
					(!resolution || claim.audit?.resolution === resolution),
			);
			result.count = result.claims.length;
			return result;
		}
		case "inspect_sprint": {
			const report: Record<string, unknown> = {};
			for (const [section, name] of [
				["sprint", "status"],
				["evidence", "evidence_health"],
				["acceptance", "acceptance_check"],
				["duplicates", "duplicate_candidates"],
			] as const)
				report[section] = await callData(name, common);
			const truncated_paths: string[] = [];
			const limit = (args.limit ?? 20) as number;
			const result = bounded(report, limit, truncated_paths) as Record<
				string,
				unknown
			>;
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
			const names: Record<string, string> = {
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
			return callData(names[tool.name]!, args);
		}
	}
}
