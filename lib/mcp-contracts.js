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
const list = (description) => ({
	type: "array",
	description,
});
const record = (description) => ({
	type: "object",
	description,
});
const fields = {
	init: {
		directory: text("Initialized sprint directory."),
		claims_seeded: number("Number of initial stated constraints."),
		files_created: list(
			"Created ledger artifact paths relative to directory, resolved from sprint configuration.",
		),
		next_actions: record(
			"Suggested follow-up actions grouped Auto and Manual; the caller determines authorization.",
		),
	},
	compile: {
		compilation_status: text("Compiler verdict; not semantic verification."),
		errors: list("Structural blockers."),
		warnings: list("Non-blocking evidence diagnostics."),
		next_actions: record("Auto and Manual suggestions."),
	},
	add_claim: {
		claim: record("Newly recorded typed claim with provenance."),
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
		claims: list("Matching recorded claims; compact results may be truncated."),
		count: number("Returned record count."),
	},
	status: {
		next_actions: record("Current Auto and Manual suggestions."),
		conflicts: { description: "Recorded unresolved conflicts." },
		total_claims: number("Total recorded claims, including history."),
		active_claims: number("Active recorded claims."),
		evidence_distribution: record("Recorded active evidence-tier counts."),
	},
	deepwiki: {
		repo: text("Public repository identifier."),
		url: text("DeepWiki source URL."),
		sections: list("Bounded extracted headings."),
		content_preview: list("Bounded extracted paragraph text."),
	},
	sync_log: {
		entries: list(
			"Recorded local synchronization events; not remote-state verification.",
		),
	},
	evidence_health: {
		coverage: { description: "Necessary-premise and observation coverage." },
		needs_reverification: list("Affected conclusions and premise blockers."),
		observations: {
			description:
				"Recorded source and execution observations with freshness diagnostics.",
		},
	},
	premise_links: {
		claim_id: text("Conclusion whose necessary premises were bound."),
		premises: { description: "Explicit premise version bindings." },
	},
	correct_claim: {
		previous: text("Superseded predecessor identifier."),
		replacement: text("Stated-tier successor identifier."),
		needs_reverification: list("Affected conclusions and premise blockers."),
	},
	observe_source: {
		observation: record(
			"Source observation and content digests; no tier promotion.",
		),
	},
	findings: {
		findings: list(
			"Selected active or historical findings with audit revision, verdict, resolution and observation freshness.",
		),
	},
	finding_action: {
		audit: record("Recorded audit transition with revision guard."),
	},
	duplicate_candidates: {
		candidates: list(
			"Possible overlaps on current source anchors; no automatic merging.",
		),
	},
	acceptance_check: {
		questions: list("Material missing goal/completion criteria."),
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
		claims: list("Ranked local memory hits with source provenance."),
		count: number("Returned hit count."),
	},
	memory_list: {
		collections: list("Stored local collections."),
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
		packs: list("Available local knowledge-pack metadata."),
		count: number("Pack count."),
	},
	memory_graph: {
		sources: number("Distinct sources in build/stats."),
		topics: number("Distinct topics in build/stats."),
		tags: number("Distinct tags in build/stats."),
		related: list("Related claims returned by the related action, up to 20."),
		claims: list("Matching claims returned by the topic action."),
		clusters: list(
			"First 20 matching clusters returned by the clusters action.",
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
		pages: list("Remote page metadata returned by list."),
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
		warnings: list("Retrieval or truncation warnings."),
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
			...list("Available export formats, extensions and MIME types."),
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
		totalLines: number("Lines in the bounded inline conversion."),
		showing: number("Returned preview lines."),
		hasMore: {
			type: "boolean",
			description: "Whether more lines exist in the bounded inline conversion.",
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
	if (
		!isRecord(response) ||
		!isRecord(response.result) ||
		!response.result.content
	)
		return serialized;
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
	if (schema.enum && !schema.enum.includes(value))
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
			if (schema.properties?.[key])
				validateOutput(item, schema.properties[key], `${location}/${key}`);
			else if (schema.additionalProperties === false)
				throw new Error(
					`Output contract violation at ${location}: unexpected ${key}.`,
				);
		}
	}
}
