// Generated from typescript/lib/tool-behavior.ts; edit that source and run npm run build:types.
/** Public capability descriptions reflect actual component behavior, not a score target. */
const rules = {
	init: [
		'Initialize one evidence sprint using configured paths (defaults: claims.json and compilation.json); files_created reports actual artifact paths. Use for new research; acceptance_set updates an existing goal. Existing data is refused unless force explicitly requests replacement with a unique backup. Leaves host settings and hooks untouched. Example: {"dir":"sprints/migration","question":"Should we migrate?","done":"A verified recommendation"}',
		false,
		false,
	],
	compile: [
		'Validate the recorded ledger and regenerate its configured compilation and topic manifest. Returns structural blockers, evidence freshness and Auto/Manual next actions; blockers require repair, not automatic tier promotion. No verifier or model runs. Use status for read-only freshness inspection. Example: {"dir":"sprints/migration"}',
		false,
		false,
	],
	add_claim: [
		'Record one authored finding with a unique ID, type, evidence tier and provenance in the locked ledger. Optional quoted passages are stored under evidence/passages. Invalid records or reused IDs fail without replacing a claim. Use import_claims for document batches, correct_claim for a successor, or observe_source for a current file snapshot. Recorded tiers do not independently prove truth. Example: {"id":"r001","type":"factual","topic":"migration","content":"The service uses PostgreSQL.","evidence":"stated"}',
		false,
		false,
	],
	resolve: [
		'Resolve an existing contradictory pair by retaining winner and superseding loser with history. Invalid IDs or a missing conflict are rejected; this neither verifies the winner nor rebinds dependent conclusions. Use correct_claim for correction without a recorded conflict. Example: {"winner":"r002","loser":"r001","reason":"The newer primary source corrects the date."}',
		false,
		false,
	],
	search: [
		'Read matching sprint claims using exact ID, text, topic, type or evidence filters. Returns records and count; active records are the default, full includes unabridged content, and include_inactive adds history. Use evidence_health to recheck premises/observations or memory_search for stored collections. Example: {"id":"r001","full":true,"include_inactive":true}',
		true,
		false,
	],
	status: [
		'Inspect recorded sprint counts, conflicts, compilation freshness and Auto/Manual next actions without writing. Use after resuming work; stale compilation requires compile, while source freshness requires evidence_health. Results describe recorded state rather than independent verification. Example: {"dir":"sprints/migration"}',
		true,
		false,
	],
	import_claims: [
		'Import active document findings using stable source identity; returns imported/existing counts and source-to-local IDs. Writes stated-tier claims atomically, retaining original provenance as metadata; unchanged repeat imports are no-ops and changed source findings require reviewed correction. Use add_claim for one authored finding. This does not restore historical ledgers. Example: {"source":"design-review","claims":[{"id":"doc1","type":"factual","topic":"migration","content":"Migration needs a rehearsal."}]}',
		false,
		false,
	],
	deepwiki: [
		'Retrieve bounded public DeepWiki documentation for one GitHub repository over HTTPS, returning the source URL, headings and text preview or an indexing/HTTP error. Use to locate relevant code, then inspect primary sources before asserting behavior; no ledger write occurs. For arbitrary URLs use memory_smart_fetch. Example: {"repo":"grainulation/grainulator"}',
		true,
		true,
	],
	sync_log: [
		'Read recorded local synchronization and publication events without contacting remote services or changing files. Use to trace earlier activity; it does not establish current remote state. Use memory_confluence for an explicit remote operation. Example: {"dir":"sprints/migration"}',
		true,
		false,
	],
	memory_search: [
		'Search stored local collections with ranked terms and optional claim filters; returns hits, provenance and count. May initialize the local index and acquire its lock, but never imports hits or fetches the network. Use search for current sprint claims, memory_list/memory_packs for catalogs, or memory_pull to import selected evidence. Example: {"query":"migration rollback","limit":10}',
		false,
		false,
	],
	memory_list: [
		"List stored local memory collections and their metadata, returning collections and count. May initialize memory directories/index and acquire its local lock; sprint claims are unchanged. Use memory_search for content, memory_packs for built-in packs, or memory_pull to import a selected collection. Example: {}",
		false,
		false,
	],
	memory_pull: [
		'Import one named local knowledge pack or stored collection, deduplicating and remapping claim IDs. Returns imported/skipped counts and writes the destination ledger; unknown pack names fail. It may initialize local memory but makes no network request. Use memory_search/memory_packs to discover candidates or import_claims for document findings. Example: {"pack":"security","into":"claims.json"}',
		false,
		false,
	],
	memory_store: [
		'Save a sprint ledger as a named reusable local collection under the memory lock; returns its identity, integrity hash and claim count. Reusing a name replaces that collection. Nothing is uploaded. Use memory_search to find saved content or memory_pull to reuse it in a sprint. Example: {"name":"migration-review","from":"claims.json"}',
		false,
		false,
	],
	memory_packs: [
		"Read the available local knowledge-pack catalog with metadata and count, without importing or fetching anything. Use memory_pull with a returned pack name to copy its claims, or memory_list for user-stored collections. Example: {}",
		true,
		false,
	],
	memory_graph: [
		'Build or inspect in-memory cross-sprint similarity relationships according to action; returns graph counts or bounded related/topic/cluster records. May initialize local memory storage, but graph construction writes no graph artifact. Related/topic queries build on demand; stats reports the current graph without building it. Relationships are similarity signals, not necessary premises or verified truth. Use premise_links for logical dependencies and memory_search for ranked text. Example: {"action":"related","claimId":"r001"}',
		false,
		false,
	],
	memory_confluence: [
		'List or pull configured Confluence content, or explicitly publish a page. Requires CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN and CONFLUENCE_EMAIL; missing credentials or HTTP failures return errors. Pull with into writes local data; publish creates/updates remote pages and needs authorization. Use memory_store for local reuse. Example: {"action":"list","spaceKey":"ENG"}',
		false,
		true,
	],
	memory_smart_fetch: [
		'Fetch an absolute URL and extract bounded source text/metadata; returns content, cache/truncation details and warnings, or a network/extraction error. Use for external retrieval, then record relevant evidence separately. It does not write sprint claims or verify source truth. Privacy bypasses cache reads/writes; local files need no network fetch. Example: {"url":"https://example.com/design","mode":"concise","privacy":true}',
		true,
		true,
	],
	exports_convert: [
		'Render local evidence into a supported data or Markdown format; returns inline content unless output names an allowed local artifact. Saving can replace that artifact but cannot overwrite protected evidence/configuration. Unknown formats or unsafe paths fail; no remote publication occurs. Use exports_formats to discover IDs or exports_preview for bounded inspection. Example: {"format":"markdown"}',
		false,
		false,
	],
	exports_formats: [
		"Read the supported local export catalog: each format includes ID, display name, extension, MIME type and description. Makes no conversion, write or network request. Use a returned ID with exports_preview for inspection or exports_convert for inline/saved output. Example: {}",
		true,
		false,
	],
	exports_preview: [
		'Preview the first lines of a local evidence conversion without saving or publishing. Returns preview text, complete totalLines, showing, hasMore and character-limit truncation status; unknown formats or invalid source paths fail. Use exports_formats for format IDs or exports_convert with output for a complete saved artifact. Example: {"format":"markdown","lines":20}',
		true,
		false,
	],
};
const titles = {
	evidence_health: "Inspect evidence and premise freshness",
	premise_links: "Link necessary claim premises",
	correct_claim: "Correct a recorded evidence claim",
	observe_source: "Capture a current local source snapshot",
	findings: "List findings and audit revisions",
	finding_action: "Update a finding audit decision",
	duplicate_candidates: "Find overlapping source observations",
	acceptance_check: "Inspect missing acceptance criteria",
	acceptance_set: "Update sprint acceptance criteria",
	compile: "Compile recorded sprint evidence",
	add_claim: "Record one authored evidence claim",
	import_claims: "Import active document findings",
	resolve: "Resolve a recorded claim conflict",
	search: "Search recorded sprint claims",
	status: "Inspect the current sprint status",
	init: "Initialize a local evidence sprint",
	deepwiki: "Fetch public repository documentation",
	sync_log: "Read local synchronization history",
	memory_search: "Search reusable local knowledge",
	memory_list: "List stored memory collections",
	memory_pull: "Import reusable local evidence",
	memory_store: "Store a reusable evidence collection",
	memory_packs: "List available local knowledge packs",
	memory_graph: "Inspect local evidence relationships",
	memory_confluence: "Read or publish Confluence evidence",
	memory_smart_fetch: "Fetch bounded external source content",
	exports_convert: "Convert evidence into a local document",
	exports_formats: "List supported evidence export formats",
	exports_preview: "Preview a local evidence export",
};
const destructive = new Set([
	"init",
	"compile",
	"resolve",
	"correct_claim",
	"premise_links",
	"observe_source",
	"finding_action",
	"acceptance_set",
	"memory_store",
	"memory_confluence",
	"exports_convert",
]);
export function toolBehavior(name) {
	const rule = Object.hasOwn(rules, name) ? rules[name] : undefined;
	const title = Object.hasOwn(titles, name)
		? titles[name]
		: name.replaceAll("_", " ");
	if (!rule)
		return destructive.has(name)
			? {
					title,
					annotations: {
						readOnlyHint: false,
						destructiveHint: true,
						idempotentHint: false,
						openWorldHint: false,
					},
				}
			: { title };
	return {
		title,
		description: rule[0],
		annotations: {
			readOnlyHint: rule[1],
			openWorldHint: rule[2],
			destructiveHint: destructive.has(name),
			idempotentHint: rule[1],
		},
	};
}
