// Generated from typescript/lib/mcp-contracts.ts; edit that source and run npm run build:types.
import { isRecord } from "./contracts.js";
/** Output fields describe recorded results, not verification of their truth. */
const text = (description) => ({
	type: "string",
	description,
});
const number = (description) => ({
	type: "number",
	description,
});
const list = (description, items) => ({
	type: "array",
	description,
	items,
});
const record = (description) => ({
	type: "object",
	description,
});
const strings = (description) =>
	list(description, text("Recorded text value."));
const shape = (description, properties, required = []) => ({
	type: "object",
	description,
	properties,
	required,
	additionalProperties: true,
});
const audit = shape(
	"Independent audit state; labels do not establish semantic truth.",
	{
		revision: number("Optimistic concurrency revision used by update_finding."),
		verdict: text(
			"Recorded verdict: unverified, confirmed, partial or refuted.",
		),
		resolution: text(
			"Recorded resolution: open, fixed, already_fixed or wont_fix.",
		),
		duplicate_of: {
			type: ["string", "null"],
			description:
				"Canonical finding ID when explicitly reconciled as a duplicate.",
		},
		observation_id: text("Observation supporting the recorded verdict."),
		resolution_observation_id: text(
			"Observation supporting a fixed resolution.",
		),
	},
	["revision", "verdict", "resolution", "duplicate_of"],
);
const claim = shape(
	"Recorded claim; fields vary with projection and preserved source metadata.",
	{
		id: text("Stable claim identifier."),
		type: text("Recorded claim type."),
		topic: text("Topic slug used for filtering and coverage."),
		content: text(
			"Finding text; memory search shortens text after 200 UTF-16 code units and appends ... when shortened.",
		),
		evidence: text(
			"Recorded evidence tier; not an independent verification result.",
		),
		status: text("Recorded lifecycle state, such as active or superseded."),
		source: {
			type: ["object", "string", "null"],
			description:
				"Preserved source provenance; historical or memory records may use a string or null.",
		},
		tags: strings("Recorded classification tags."),
		conflicts_with: strings("Claim IDs declared contradictory."),
		audit,
	},
);
const diagnostic = shape("Compiler or evidence diagnostic.", {
	code: text("Stable diagnostic code."),
	message: text("Explanation of the blocker or warning."),
	claims: strings("Affected claim IDs, when provided."),
});
const action = shape(
	"Suggested follow-up; the caller separately determines authorization.",
	{
		command: text("Suggested CLI command or skill invocation."),
		label: text("Short action label."),
		reason: text("Evidence gap motivating the action."),
		claim_ids: strings("Claims associated with this suggestion."),
	},
	["command", "label", "reason", "claim_ids"],
);
const nextActions = shape(
	"Follow-up suggestions grouped by execution responsibility.",
	{
		auto: list(
			"Actions the agent may carry out when already authorized.",
			action,
		),
		manual: list("Decisions or access requiring human input.", action),
	},
	["auto", "manual"],
);
const reverification = list(
	"Active conclusions affected by changed premises or evidence.",
	shape("Conclusion and its dependency blockers.", {
		claim_id: text("Affected active conclusion ID."),
		blockers: list(
			"Reasons the conclusion needs rechecking.",
			shape("Changed premise or evidence and its propagation path.", {
				premise: text("Originating premise or finding ID."),
				reason: text("Machine-readable cause."),
				path: strings("Dependency path from the cause to this conclusion."),
			}),
		),
	}),
);
const collection = shape("Stored local collection metadata.", {
	id: text("Collection identifier accepted by import_memory.pack."),
	name: text("Human-readable collection name."),
	claimCount: number("Number of stored claims."),
	storedAt: text("Recorded storage timestamp."),
});
const pack = shape("Local knowledge-pack metadata.", {
	name: text("Pack name accepted by import_memory.pack."),
	description: text("Scope of the reusable knowledge."),
	claimCount: number("Number of included claims."),
	source: text("Pack source label."),
});
const fields = {
	init: {
		directory: text("Initialized sprint directory."),
		claims_seeded: number("Number of initial stated constraints."),
		files_created: strings(
			"Created ledger artifact paths relative to directory, resolved from sprint configuration.",
		),
		next_actions: nextActions,
	},
	compile: {
		compilation_status: text("Compiler verdict; not semantic verification."),
		errors: list("Structural blockers.", diagnostic),
		warnings: list("Non-blocking evidence diagnostics.", diagnostic),
		next_actions: nextActions,
	},
	add_claim: {
		claim,
	},
	import_claims: {
		imported: number("Number of newly imported active document findings."),
		existing: number("Unchanged records already imported from this source."),
		skipped_inactive: number("Inactive source records skipped."),
		id_map: record("Source identifiers mapped to local identifiers."),
		mode: text("Import policy: active-findings."),
	},
	resolve: {
		winner: text("Claim retained as active."),
		loser: text("Superseded claim; history is retained."),
	},
	search: {
		claims: list(
			"Matching recorded claims; search_claims returns complete records by default.",
			claim,
		),
		count: number("Returned record count."),
	},
	status: {
		next_actions: nextActions,
		conflicts: list(
			"Recorded active conflict pairs.",
			strings("The two contradictory claim IDs."),
		),
		total_claims: number("Total recorded claims, including history."),
		active_claims: number("Active recorded claims."),
		evidence_distribution: record("Recorded active evidence-tier counts."),
	},
	deepwiki: {
		repo: text("Public repository identifier."),
		url: text("DeepWiki source URL."),
		sections: list(
			"Bounded extracted headings.",
			shape("Extracted heading.", {
				level: number("Heading depth from 1 to 3."),
				title: text("Heading text."),
			}),
		),
		content_preview: strings("Bounded extracted paragraph text."),
	},
	sync_log: {
		entries: list(
			"Recorded local synchronization events; not remote-state verification.",
			record("Stored synchronization event; fields depend on the connector."),
		),
	},
	evidence_health: {
		coverage: shape(
			"Necessary-premise and local observation coverage; not semantic truth.",
			{
				total: number("Active findings inspected."),
				declared: number("Findings with observations."),
				source_intact: number("Findings with intact source observations."),
				executed_pass: number("Findings with passing execution observations."),
				resolved: number(
					"Findings with current required support and no dependency blockers.",
				),
				unresolved: number("Findings without current required support."),
				effective_coverage: number(
					"Resolved divided by total, or zero for an empty ledger.",
				),
			},
		),
		needs_reverification: reverification,
		observations: list(
			"Recorded observation freshness by active finding.",
			shape("Finding and its current observation checks.", {
				claim_id: text("Finding ID."),
				required_support: text(
					"Required observation kind: source or execution.",
				),
				checks: list(
					"Current source and execution check results.",
					shape("Observation freshness result.", {
						id: text("Observation ID."),
						kind: text("Observation kind."),
						status: text(
							"Freshness or execution verdict, such as intact, changed or passed.",
						),
					}),
				),
			}),
		),
	},
	premise_links: {
		claim_id: text("Conclusion whose necessary premises were bound."),
		premises: list(
			"Explicit necessary-premise version bindings.",
			shape("Premise bound to its current content digest.", {
				claim_id: text("Necessary premise ID."),
				claim_sha256: text("SHA-256 of the bound premise content."),
			}),
		),
	},
	correct_claim: {
		previous: text("Superseded predecessor identifier."),
		replacement: text("Stated-tier successor identifier."),
		needs_reverification: reverification,
	},
	observe_source: {
		observation: shape(
			"Recorded local source observation; no tier promotion.",
			{
				id: text("Observation UUID."),
				kind: {
					type: "string",
					enum: ["source"],
					description: "Local source observation.",
				},
				captured_at: text("Capture timestamp."),
				path: text("Sprint-relative file path."),
				start_line: number("First captured line, one-based inclusive."),
				end_line: number("Last captured line, one-based inclusive."),
				file_sha256: text("Full-file SHA-256 digest."),
				excerpt_sha256: text("Selected-line SHA-256 digest."),
				supersedes: text("Earlier observation replaced on the same binding."),
			},
			[
				"id",
				"kind",
				"captured_at",
				"path",
				"start_line",
				"end_line",
				"file_sha256",
				"excerpt_sha256",
			],
		),
	},
	findings: {
		findings: list(
			"Selected active or historical findings with audit revision, verdict, resolution and observation freshness.",
			shape("Finding audit projection.", {
				claim_id: text("Finding ID."),
				content: text("Finding text."),
				audit,
				verification_observation_status: {
					type: ["string", "null"],
					description: "Current support status when available.",
				},
				resolution_observation_status: {
					type: ["string", "null"],
					description:
						"Current fixed-resolution support status when available.",
				},
			}),
		),
	},
	finding_action: {
		audit,
	},
	duplicate_candidates: {
		candidates: list(
			"Possible overlaps on current source anchors; no automatic merging.",
			shape("Pair sharing an overlapping range of one current file version.", {
				claim_ids: strings("Two candidate claim IDs."),
				path: text("Sprint-relative source path."),
				file_sha256: text("Shared current file digest."),
				overlap: shape("Shared inclusive line interval.", {
					start_line: number("First overlapping line."),
					end_line: number("Last overlapping line."),
				}),
			}),
		),
	},
	acceptance_check: {
		questions: list(
			"Material missing goal/completion criteria.",
			shape("One missing explicit acceptance field.", {
				field: text("Missing field: question or done."),
				question: text("Concrete clarification to obtain if material."),
			}),
		),
		clarification_needed: {
			type: "boolean",
			description: "Whether explicit missing criteria were found.",
		},
	},
	acceptance_set: {
		question: text("Current research outcome."),
		done: {
			type: ["string", "null"],
			description: "Updated completion criterion when provided.",
		},
	},
	memory_search: {
		claims: list(
			"Ranked local memory hits; content is a 200-unit snippet, with ... appended when shortened.",
			shape("Memory hit, ranking and source collection.", {
				...claim.properties,
				score: number(
					"Local search relevance score; not confidence or evidence strength.",
				),
				collection: text("Source collection name."),
			}),
		),
		count: number("Returned hit count."),
	},
	memory_list: {
		collections: list("Stored local collections.", collection),
		count: number("Collection count."),
	},
	memory_pull: {
		imported: number(
			"New local claims imported from the selected collection/pack.",
		),
		skipped: number("Deduplicated or skipped records."),
	},
	memory_store: {
		id: text("Stored collection identity."),
		hash: text("Stored collection integrity digest."),
		claimCount: number("Stored claim count."),
	},
	memory_packs: {
		packs: list("Available local knowledge-pack metadata.", pack),
		count: number("Pack count."),
	},
	memory_graph: {
		sources: number("Distinct sources in build/stats."),
		topics: number("Distinct topics in build/stats."),
		tags: number("Distinct tags in build/stats."),
		related: list(
			"Related claims returned by the related action, up to 20.",
			claim,
		),
		claims: list("Matching claims returned by the topic action.", claim),
		clusters: list(
			"First 20 matching clusters returned by the clusters action.",
			record("Recorded graph cluster metadata."),
		),
		count: number(
			"Returned related/topic record count; for clusters, total clusters found before the list is capped at 20.",
		),
		nodes: number("Graph node count returned by build/stats."),
		edges: number(
			"Similarity edge count returned by build/stats; not logical premises.",
		),
	},
	memory_confluence: {
		id: text("Remote page identifier returned by publish."),
		title: text("Page title returned by publish or pull."),
		url: text("Remote page URL returned by publish."),
		version: number("Page version returned by publish."),
		pages: list(
			"Remote page metadata returned by list.",
			record("Remote page metadata returned by the configured connector."),
		),
		claimCount: number(
			"Claims retrieved by pull, regardless of whether into imports or deduplicates them; not an imported count.",
		),
	},
	memory_smart_fetch: {
		url: text("Requested source URL."),
		content: { description: "Bounded extracted content." },
		truncated: {
			type: "boolean",
			description: "Whether extraction omitted content.",
		},
		warnings: strings("Retrieval or truncation warnings."),
	},
	exports_convert: {
		format: text("Resolved export format identifier."),
		output: text("Inline rendered content when no output path was supplied."),
		outputPath: text("Written local path when saving."),
		bytes: number("Full rendered byte length."),
		truncated: {
			type: "boolean",
			description: "Whether inline content was shortened.",
		},
	},
	exports_formats: {
		formats: {
			...list(
				"Available export formats, extensions and MIME types.",
				record("Format metadata."),
			),
			items: {
				type: "object",
				properties: {
					id: text("Format identifier used for rendering."),
					name: text("Display name."),
					extension: text("File extension."),
					mimeType: text("Rendering MIME type."),
					description: text("Format description."),
				},
				required: ["id", "name", "extension", "mimeType", "description"],
			},
		},
		count: number("Format count."),
	},
	exports_preview: {
		format: text("Resolved format identifier."),
		preview: text("Bounded rendered preview."),
		totalLines: number(
			"Lines in the complete rendered export before preview limits.",
		),
		showing: number("Returned preview lines."),
		hasMore: {
			type: "boolean",
			description:
				"Whether any rendered content was omitted by the requested line count or the preview character limit.",
		},
		truncated: {
			type: "boolean",
			description:
				"Whether the preview was shortened after 10,000 UTF-16 code units; hasMore is also true in this case.",
		},
	},
};
export function outputSchema(name, properties = fields[name]) {
	return {
		type: "object",
		description:
			"Operation result. Failure results set status to error and explain the failure; additional recorded fields vary by operation and backend.",
		properties: {
			status: text(
				"Operation status or recorded compiler state; error indicates failure.",
			),
			message: text("Human-readable operation or failure explanation."),
			error: {
				description:
					"Recorded error detail when supplied by the underlying operation.",
			},
			output: {
				description: "Text rendering or next-action text when supplied.",
			},
			...properties,
		},
		additionalProperties: true,
	};
}
export const SUPPORTED_PROTOCOL_VERSIONS = [
	"2024-11-05",
	"2025-03-26",
	"2025-06-18",
];
export function negotiateProtocolVersion(requested) {
	return typeof requested === "string" &&
		SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
		? requested
		: "2025-06-18";
}
export function supportsStructuredResults(protocolVersion) {
	return protocolVersion === "2025-06-18";
}
/** Preserve legacy text results while exposing the same JSON as structured data. */
export function withStructuredResult(serialized, schema) {
	const response = JSON.parse(serialized);
	// JSON-RPC errors have no tool result to convert. A present but malformed
	// result must fail instead of bypassing the structured-output boundary.
	if (
		isRecord(response) &&
		Object.hasOwn(response, "error") &&
		!Object.hasOwn(response, "result")
	)
		return serialized;
	if (!isRecord(response) || !isRecord(response.result))
		throw new Error("Expected one JSON tool result.");
	const content = response.result.content;
	if (!Array.isArray(content))
		throw new Error("Expected one JSON tool result.");
	const texts = content.filter(
		(item) => isRecord(item) && item.type === "text",
	);
	if (texts.length !== 1 || typeof texts[0]?.text !== "string")
		throw new Error("Expected one JSON tool result.");
	const value = JSON.parse(texts[0].text);
	if (!isRecord(value)) throw new Error("Expected an object tool result.");
	if (schema) validateOutput(value, schema);
	response.result.structuredContent = value;
	return JSON.stringify(response);
}
/** JSON Schema enum values compare by JSON structure, not object identity. */
function equalJson(left, right) {
	if (left === right) return true;
	if (Array.isArray(left) && Array.isArray(right))
		return (
			left.length === right.length &&
			left.every((item, index) => equalJson(item, right[index]))
		);
	if (isRecord(left) && isRecord(right)) {
		const keys = Object.keys(left);
		return (
			keys.length === Object.keys(right).length &&
			keys.every(
				(key) => Object.hasOwn(right, key) && equalJson(left[key], right[key]),
			)
		);
	}
	return false;
}
/** Validate the published field contracts before advertising structured output. */
export function validateOutput(value, schema, location = "result") {
	const types =
		schema.type === undefined
			? []
			: Array.isArray(schema.type)
				? schema.type
				: [schema.type];
	const matches = (type) =>
		type === "null"
			? value === null
			: type === "array"
				? Array.isArray(value)
				: type === "object"
					? value !== null && typeof value === "object" && !Array.isArray(value)
					: type === "integer"
						? Number.isInteger(value)
						: type === "number"
							? typeof value === "number" && Number.isFinite(value)
							: typeof value === type;
	if (types.length && !types.some(matches))
		throw new Error(
			`Output contract violation at ${location}: expected ${types.join(" or ")}.`,
		);
	if (
		schema.enum &&
		!schema.enum.some((candidate) => equalJson(value, candidate))
	)
		throw new Error(
			`Output contract violation at ${location}: unsupported value.`,
		);
	const itemSchema = schema.items;
	if (Array.isArray(value) && itemSchema)
		value.forEach((item, index) => {
			validateOutput(item, itemSchema, `${location}/${index}`);
		});
	if (isRecord(value)) {
		for (const key of schema.required || [])
			if (!Object.hasOwn(value, key))
				throw new Error(
					`Output contract violation at ${location}: missing ${key}.`,
				);
		for (const [key, item] of Object.entries(value)) {
			const property =
				schema.properties && Object.hasOwn(schema.properties, key)
					? schema.properties[key]
					: undefined;
			if (property) validateOutput(item, property, `${location}/${key}`);
			else if (schema.additionalProperties === false)
				throw new Error(
					`Output contract violation at ${location}: unexpected ${key}.`,
				);
		}
	}
}
