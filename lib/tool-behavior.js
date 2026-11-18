/** Public capability descriptions reflect actual component behavior, not a score target. */
const rules = {
	compile: [
		"Compile the sprint ledger into compilation.json and update its topic manifest. Returns blockers, current evidence health and Auto/Manual next actions. Does not execute verifiers or establish semantic truth. Use status for inspection without compilation writes.",
		false,
		false,
	],
	add_claim: [
		"Append a typed claim to claims.json and optionally store a quoted passage under evidence/passages. Validates fields and unique IDs under the ledger lock. Use correct_claim to replace a premise; evidence labels are recorded assertions, not independently executed proof.",
		false,
		false,
	],
	resolve: [
		"Resolve an explicit conflict between existing claims. Writes claims.json, supersedes the loser and records the rationale. Does not verify the winner or rebind dependent conclusions. Use correct_claim for a correction without a conflict relationship.",
		false,
		false,
	],
	search: [
		"Search recorded claims by topic, type, evidence tier or text. Read-only; returns matching records, not independent verification. Use evidence_health to recheck declared premises and local observations.",
		true,
		false,
	],
	status: [
		"Read sprint status and compilation freshness without modifying the ledger. Returns Auto/Manual next actions; stale source observations require a new compile. Use compile to regenerate artifacts.",
		true,
		false,
	],
	import_claims: [
		"Import validated claims into the selected ledger with collision handling and provenance. Writes claims.json under its lock. Use add_claim for one new finding; an imported tier does not attest that its tests ran here.",
		false,
		false,
	],
	deepwiki: [
		"Fetch public DeepWiki repository documentation over HTTPS. Makes an external network request; returns bounded text or an indexing/HTTP error and does not write the ledger. Use as a source pointer, then inspect primary code before asserting behavior.",
		true,
		true,
	],
	sync_log: [
		"Read the local sync/publish history, returning recorded events without publishing or changing files. Use this to inspect earlier activity; it does not attest remote state.",
		true,
		false,
	],
	memory_search: [
		"Search stored collections and knowledge packs with ranked text results. May initialize the local memory index/acquire a local lock; does not import results into the sprint or make network requests. Use memory_pull for explicit import.",
		false,
		false,
	],
	memory_list: [
		"List stored memory collections. May initialize local memory directories/index and acquire its local lock. Does not change sprint claims. Use memory_search for content queries.",
		false,
		false,
	],
	memory_pull: [
		"Import a named pack or stored collection into the selected claims.json, deduplicating and remapping IDs. Writes the destination ledger and may initialize memory storage. Not a network fetch; use memory_smart_fetch for a URL.",
		false,
		false,
	],
	memory_store: [
		"Store the selected sprint as a named reusable local memory collection. Writes collection data and index under the memory lock; existing collection names can be replaced. Does not publish or upload.",
		false,
		false,
	],
	memory_packs: [
		"List available local knowledge packs and metadata. Read-only; no network or import. Use memory_pull to import a selected pack.",
		true,
		false,
	],
	memory_graph: [
		"Inspect cross-sprint relationships or build the local memory graph according to action. May initialize memory storage and write graph artifacts. Relationships indicate similarity, not necessary-premise dependencies or verified truth.",
		false,
		false,
	],
	memory_confluence: [
		"Access the configured Confluence service: list/pull reads remote content; publish creates or updates pages; pull may write a local destination. Requires CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN and CONFLUENCE_EMAIL. External writes need authorization; use memory_store for local-only reuse.",
		false,
		true,
	],
	memory_smart_fetch: [
		"Fetch a URL and extract bounded text/metadata. Makes a network request; inspect truncation and warnings. Does not record a claim or verify the source. Use only for external retrieval; existing local files need no fetch.",
		true,
		true,
	],
	exports_convert: [
		"Convert local claims/compilation into a supported export format. Returns text inline, or writes the specified output file inside the workspace (existing outputs may be replaced subject to output protection). No remote publication. Use exports_preview to inspect without writing.",
		false,
		false,
	],
	exports_formats: [
		"List available local export formats, extensions and MIME types. Read-only; no conversion, file writes or network requests.",
		true,
		false,
	],
	exports_preview: [
		"Preview the first requested lines of a local conversion. Returns bounded text without writing an output file or publishing. Use exports_convert with output for a full saved artifact.",
		true,
		false,
	],
};
export function toolBehavior(name) {
	const rule = rules[name];
	if (!rule) return {};
	return {
		description: rule[0],
		annotations: {
			readOnlyHint: rule[1],
			openWorldHint: rule[2],
			destructiveHint: [
				"memory_store",
				"memory_confluence",
				"exports_convert",
			].includes(name),
			idempotentHint: rule[1],
		},
	};
}
