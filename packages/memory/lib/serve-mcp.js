// Generated from typescript/packages/memory/lib/serve-mcp.ts; edit that source and run npm run build:types.
/** Private Grainulator memory MCP handlers; only the root server owns stdio/discovery. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonRpcError, jsonRpcResponse } from "../../shared/lib/mcp.js";
import { isInsideDir } from "../../shared/lib/paths.js";
import { Confluence } from "./confluence.js";
import { Graph } from "./graph.js";
import { ImportExport } from "./import-export.js";
import { Packs } from "./packs.js";
import { Search } from "./search.js";
import { smartFetch } from "./smart-fetch.js";
import { Store } from "./store.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ─── Constants ──────────────────────────────────────────────────────────────
const SERVER_NAME = "grainulator";
const { version: SERVER_VERSION } = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
);
const PROTOCOL_VERSION = "2024-11-05";
// ─── Initialize memory components ─────────────────────────────────────────────
export const TOOLS = [
	{
		name: "memory_search",
		description:
			'Search locally stored collections for reusable claims; returns ranked hits, source provenance and content snippets capped at 200 characters. May initialize the local index; no network or sprint import. Missing query returns an error. Use memory_list or memory_packs to discover sources, then memory_pull to import. Example: {"query":"security architecture","limit":5}.',
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description:
						"Required nonempty search text. Space-separated terms use OR matching and relevance ranking across stored claims; this does not search the current sprint ledger.",
					examples: ["security architecture"],
				},
				type: {
					type: "string",
					enum: [
						"constraint",
						"factual",
						"estimate",
						"risk",
						"recommendation",
						"feedback",
					],
					description:
						"Optional claim-type filter applied to stored hits; omit to include all supported claim types.",
					examples: ["risk"],
				},
				evidence: {
					type: "string",
					enum: ["stated", "web", "documented", "tested", "production"],
					description:
						"Optional recorded evidence-tier filter; tiers are stored labels, not independently verified proof.",
					examples: ["tested"],
				},
				limit: {
					type: "number",
					description:
						"Maximum returned ranked hits; omitted or zero uses 20. Prefer a positive whole number. Returned content is a 200-character snippet.",
					examples: [5],
					default: 20,
				},
			},
			required: ["query"],
			description:
				"Arguments for memory_search. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					query: "security architecture",
					limit: 5,
				},
			],
		},
	},
	{
		name: "memory_list",
		description:
			"List stored local collections with IDs, names, claim counts and stored timestamps; returns collections and count. May initialize the local index without changing sprint claims. Use memory_search for content or memory_packs for pack metadata. Example: {}.",
		inputSchema: {
			type: "object",
			properties: {},
			description:
				"Arguments for memory_list. Paths resolve within the selected sprint unless described otherwise.",
			examples: [{}],
		},
	},
	{
		name: "memory_pull",
		description:
			'Import a named local pack or stored collection into an existing sprint ledger; returns imported and skipped counts after deduplication and ID remapping. Writes the destination ledger; missing sources, invalid ledgers or escaping paths return errors. Discover names with memory_list or memory_packs; use memory_store to save a collection. Example: {"pack":"security","into":"claims.json"}.',
		inputSchema: {
			type: "object",
			properties: {
				pack: {
					type: "string",
					description:
						"Required knowledge-pack name or stored collection ID discovered with memory_packs or memory_list. File paths are not supported by the unified MCP entry point.",
					examples: ["security"],
				},
				into: {
					type: "string",
					description:
						"Existing destination claims ledger inside the selected sprint; relative paths resolve from dir. Default is claims.json; pass a custom configured ledger filename explicitly.",
					examples: ["claims.json"],
					default: "claims.json",
				},
			},
			required: ["pack"],
			description:
				"Arguments for memory_pull. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					pack: "security",
					into: "claims.json",
				},
			],
		},
	},
	{
		name: "memory_store",
		description:
			'Save sprint claims as a named reusable local collection; returns its id, claimCount and integrity hash. Writes memory data and index under a lock; an existing name may be replaced. Invalid source JSON or escaping paths return errors. No upload; use memory_search to find saved claims. Example: {"name":"security-review","from":"claims.json"}.',
		inputSchema: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description:
						"Required reusable local collection name. Reusing an existing name can replace that saved collection.",
					examples: ["security-review"],
				},
				from: {
					type: "string",
					description:
						"Source claims ledger or claims-array JSON inside the selected sprint, relative to dir unless absolute. Default is claims.json; pass custom configured filenames explicitly.",
					examples: ["claims.json"],
					default: "claims.json",
				},
			},
			required: ["name"],
			description:
				"Arguments for memory_store. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					name: "security-review",
					from: "claims.json",
				},
			],
		},
	},
	{
		name: "memory_packs",
		description:
			"List available local knowledge packs with names, descriptions, claim counts and source metadata; returns packs and count without importing claims or using the network. Use memory_pull with a returned name to import, or memory_list for saved collections. Example: {}.",
		inputSchema: {
			type: "object",
			properties: {},
			description:
				"Arguments for memory_packs. Paths resolve within the selected sprint unless described otherwise.",
			examples: [{}],
		},
	},
	{
		name: "memory_graph",
		description:
			'Build or inspect the local memory relationship graph; action selects build, related, topic, clusters or stats. Returns action-specific statistics or matching claim snippets; missing claimId/topic and unknown actions return errors. Build refreshes the in-memory graph and may initialize local memory storage; similarity is not verified evidence or necessary-premise dependency. Use memory_search for text search. Example: {"action":"related","claimId":"r001"}.',
		inputSchema: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["build", "related", "topic", "clusters", "stats"],
					description:
						"Required operation: build refreshes the in-memory graph; related requires claimId; topic requires topic; clusters groups by topic using minSize; stats reads the current graph totals, so build first to refresh.",
					examples: ["related", "stats"],
				},
				claimId: {
					type: "string",
					description:
						"Existing claim ID or collection-qualified graph node key required only for action=related; returns up to 20 related claim snippets with relationship weights.",
					examples: ["r001"],
				},
				topic: {
					type: "string",
					description:
						"Topic to inspect, required for action=topic. Case-insensitive topic substring matching returns up to 50 claim snippets; use memory_search for free-text matching.",
					examples: ["security"],
				},
				minSize: {
					type: "number",
					description:
						"Minimum claims per topic cluster for action=clusters; omitted or zero uses 3. At most 20 clusters are returned.",
					examples: [3],
					default: 3,
				},
			},
			required: ["action"],
			description:
				"Arguments for memory_graph. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					action: "related",
					claimId: "r001",
				},
			],
		},
	},
	{
		name: "memory_confluence",
		description:
			'List, pull or publish Confluence pages using the configured service credentials. Returns page metadata or claim counts; pull writes a local ledger only when into is supplied, and publish writes remotely. Requires CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN and CONFLUENCE_EMAIL; configuration, identity and HTTP failures return errors. Authorize external writes before publish. Use memory_store for local reuse. Example: {"action":"list","spaceKey":"ENG"}.',
		inputSchema: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["publish", "pull", "list"],
					description:
						"Required operation: list reads pages; pull requires pageId or title and optionally merges into a local ledger; publish requires title and writes a remote page.",
					examples: ["list", "pull"],
				},
				title: {
					type: "string",
					description:
						"Required page title for publish, including updates. For pull, used only when pageId is omitted; pageId takes precedence.",
					examples: ["Security review"],
				},
				from: {
					type: "string",
					description:
						"Local source ledger for action=publish, relative to dir unless absolute and confined to the selected sprint. Defaults to claims.json; custom configured filenames must be supplied.",
					examples: ["claims.json"],
					default: "claims.json",
				},
				into: {
					type: "string",
					description:
						"Optional local target ledger for action=pull, confined to the selected sprint and relative to dir unless absolute. Omit to return page title/count without importing claims.",
					examples: ["claims.json"],
				},
				sourceId: {
					type: "string",
					description:
						"Stable reviewed source or collection identity for publishing an existing migrated source; must match its confirmed remote destination.",
					examples: ["security-review:claims"],
				},
				newSource: {
					type: "string",
					description:
						"Explicit stable identity for a genuinely new collection after remote migration is reconciled. Do not combine with an existing pageId or use to bypass a mapped source.",
					examples: ["new-security-review:claims"],
				},
				pageId: {
					type: "string",
					description:
						"Confluence page ID: selects a page for pull or an existing page to update for publish. Omit on publish to create a new page subject to migration checks.",
					examples: ["12345"],
				},
				spaceKey: {
					type: "string",
					description:
						"Confluence space key for list, pull or publish. Omission uses CONFLUENCE_SPACE_KEY when configured.",
					examples: ["ENG"],
				},
				parentId: {
					type: "string",
					description:
						"Parent page ID when creating a new page with action=publish; omit for a top-level page. Does not select the page being updated.",
					examples: ["10001"],
				},
			},
			required: ["action"],
			description:
				"Arguments for memory_confluence. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					action: "list",
					spaceKey: "ENG",
				},
			],
		},
	},
	{
		name: "memory_smart_fetch",
		description:
			'Fetch one HTTP(S) URL and return bounded extracted text, metadata, HTTP status, quality, warnings and truncation flags. Uses network and optionally local cache; records no claims and proves no source truth. Invalid URLs, blocked destinations or retrieval failures return errors. Inspect warnings/truncated before citing. Use memory_search for stored evidence. Example: {"url":"https://example.com/","mode":"concise","privacy":true}.',
		inputSchema: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description:
						"Required absolute http:// or https:// URL. Network policy rejects private or otherwise blocked destinations; local files are not supported.",
					examples: ["https://example.com/"],
				},
				mode: {
					type: "string",
					enum: ["auto", "full", "concise", "meta-only"],
					description:
						"Extraction mode: auto defaults to concise and retries failed extraction after body truncation; concise returns a 2,048-character text slice; meta-only omits body text; full remains bounded. Inspect quality, warnings and truncated.",
					examples: ["concise"],
					default: "auto",
				},
				cache: {
					type: "boolean",
					description:
						"Read/write the local fetch cache when true. Set false to force retrieval; privacy=true overrides this and skips cache entirely.",
					examples: [false],
					default: true,
				},
				timeout: {
					type: "number",
					description:
						"Network request timeout in milliseconds; omission uses 15000. This does not guarantee complete extracted evidence.",
					examples: [15000],
					default: 15000,
				},
				privacy: {
					type: "boolean",
					description:
						"Skip all fetch-cache reads and writes when true; this still contacts the remote HTTP(S) server. Omission permits the normal cache behavior.",
					examples: [true],
					default: false,
				},
			},
			required: ["url"],
			description:
				"Arguments for memory_smart_fetch. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					url: "https://example.com/",
					mode: "concise",
					privacy: true,
				},
			],
		},
	},
];
export const RESOURCES = [
	{
		uri: "grainulator://memory/index",
		name: "Grainulator memory Index",
		description:
			"All stored collections — IDs, names, claim counts, timestamps.",
		mimeType: "application/json",
	},
	{
		uri: "grainulator://memory/packs",
		name: "Knowledge Packs",
		description: "Available built-in and local knowledge packs.",
		mimeType: "application/json",
	},
];
export function createHandler({ storeDir } = {}) {
	const store = new Store(storeDir);
	const search = new Search(store);
	const io = new ImportExport(store);
	const packs = new Packs(store);
	const graph = new Graph(store);
	const confluence = new Confluence({
		baseUrl: process.env.CONFLUENCE_BASE_URL,
		token: process.env.CONFLUENCE_TOKEN,
		email: process.env.CONFLUENCE_EMAIL,
		spaceKey: process.env.CONFLUENCE_SPACE_KEY,
	});
	// ─── Tool implementations ───────────────────────────────────────────────────
	function toolSearch(args) {
		const { query, type, evidence, limit } = args;
		if (!query) {
			return { status: "error", message: "Required field: query" };
		}
		const results = search.query(query, {
			type: type || null,
			tier: evidence || null,
			limit: limit || 20,
		});
		return {
			status: "ok",
			count: results.length,
			claims: results.map((r) => ({
				id: r.claim.id,
				status: r.claim.status || "active",
				resolved_by: r.claim.resolved_by ?? null,
				resolution: r.claim.resolution ?? null,
				type: r.claim.type,
				topic: r.claim.topic,
				evidence: r.claim.evidence,
				content:
					(r.claim.content || r.claim.text || "").slice(0, 200) +
					((r.claim.content || r.claim.text || "").length > 200 ? "..." : ""),
				source: r.claim.source ?? null,
				tags: r.claim.tags || [],
				conflicts_with: r.claim.conflicts_with || [],
				timestamp: r.claim.timestamp || r.claim.created || null,
				score: r.score,
				collection: r.collection,
			})),
		};
	}
	function toolList() {
		const collections = store.list();
		return {
			status: "ok",
			count: collections.length,
			collections: collections.map((c) => ({
				id: c.id,
				name: c.name,
				claimCount: c.claimCount,
				storedAt: c.storedAt,
			})),
		};
	}
	function toolPull(dir, args) {
		const { pack, into } = args;
		if (!pack) {
			return {
				status: "error",
				message: "Required field: pack (pack name or collection ID)",
			};
		}
		const targetFile = into
			? path.resolve(dir, into)
			: path.join(dir, "claims.json");
		// Prevent path traversal — target must stay within workspace
		if (!isInsideDir(targetFile, dir)) {
			return {
				status: "error",
				message: `Target path escapes workspace directory.`,
			};
		}
		if (!fs.existsSync(targetFile)) {
			return {
				status: "error",
				message: `Target file not found: ${targetFile}. Run grainulator init first.`,
			};
		}
		try {
			const result = io.pull(pack, targetFile, {});
			return {
				status: "ok",
				message: `Pulled ${result.imported} claims from "${pack}" into ${path.basename(targetFile)}.`,
				imported: result.imported,
				skipped: 0,
			};
		} catch (err) {
			return { status: "error", message: err.message };
		}
	}
	function toolStore(dir, args) {
		const { name, from } = args;
		if (!name) {
			return { status: "error", message: "Required field: name" };
		}
		const sourceFile = from
			? path.resolve(dir, from)
			: path.join(dir, "claims.json");
		// Prevent path traversal — source must stay within workspace
		if (!isInsideDir(sourceFile, dir)) {
			return {
				status: "error",
				message: `Source path escapes workspace directory.`,
			};
		}
		if (!fs.existsSync(sourceFile)) {
			return {
				status: "error",
				message: `Source file not found: ${sourceFile}`,
			};
		}
		try {
			const data = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
			const claims = data.claims || data;
			const meta = data.meta || {};
			const result = store.storeClaims(name, claims, meta);
			return {
				status: "ok",
				message: `Stored ${result.claimCount} claims as "${name}".`,
				id: result.id,
				claimCount: result.claimCount,
				hash: result.hash,
			};
		} catch (err) {
			return { status: "error", message: err.message };
		}
	}
	function toolPacks() {
		const available = packs.list();
		return {
			status: "ok",
			count: available.length,
			packs: available.map((p) => ({
				name: p.name,
				description: p.description || "",
				claimCount: p.claimCount || 0,
				source: p.source || "unknown",
			})),
		};
	}
	function toolGraph(args) {
		const { action, claimId, topic, minSize } = args;
		switch (action) {
			case "build": {
				const stats = graph.build();
				return { status: "ok", message: "Knowledge graph built.", ...stats };
			}
			case "related": {
				if (!claimId)
					return { status: "error", message: "Required field: claimId" };
				const results = graph.related(claimId, { limit: 20 });
				return {
					status: "ok",
					count: results.length,
					related: results.map((r) => ({
						id: r.claim.id,
						status: r.claim.status || "active",
						resolved_by: r.claim.resolved_by ?? null,
						resolution: r.claim.resolution ?? null,
						type: r.claim.type,
						topic: r.claim.topic,
						content: (r.claim.content || "").slice(0, 200),
						source: r.source,
						relation: r.relation,
						weight: r.weight,
					})),
				};
			}
			case "topic": {
				if (!topic)
					return { status: "error", message: "Required field: topic" };
				const results = graph.byTopic(topic);
				return {
					status: "ok",
					count: results.length,
					claims: results.map((r) => ({
						id: r.claim.id,
						status: r.claim.status || "active",
						resolved_by: r.claim.resolved_by ?? null,
						resolution: r.claim.resolution ?? null,
						type: r.claim.type,
						content: (r.claim.content || "").slice(0, 200),
						source: r.source,
					})),
				};
			}
			case "clusters": {
				const clusters = graph.clusters(minSize || 3);
				return {
					status: "ok",
					count: clusters.length,
					clusters: clusters.slice(0, 20).map((c) => ({
						topic: c.topic,
						claimCount: c.claimCount,
						edgeCount: c.edgeCount,
					})),
				};
			}
			case "stats": {
				return { status: "ok", ...graph.stats() };
			}
			default:
				return {
					status: "error",
					message:
						"Unknown action. Use: build, related, topic, clusters, stats",
				};
		}
	}
	function toolConfluence(dir, args) {
		const { action } = args;
		if (!confluence.isConfigured()) {
			return {
				status: "error",
				message:
					"Confluence not configured. Set CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN, and CONFLUENCE_EMAIL environment variables.",
			};
		}
		switch (action) {
			case "publish": {
				const { title, from, spaceKey, parentId, pageId, sourceId, newSource } =
					args;
				if (!title)
					return { status: "error", message: "Required field: title" };
				const sourceFile = from
					? path.resolve(dir, from)
					: path.join(dir, "claims.json");
				// Prevent path traversal — source must stay within workspace
				if (!isInsideDir(sourceFile, dir)) {
					return {
						status: "error",
						message: `Source path escapes workspace directory.`,
					};
				}
				if (!fs.existsSync(sourceFile))
					return {
						status: "error",
						message: `Source file not found: ${sourceFile}`,
					};
				const raw = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
				const claims = Array.isArray(raw) ? raw : raw.claims || [];
				return confluence
					.publish(title, claims, {
						dir,
						workspace: args.workspace,
						spaceKey,
						parentId,
						pageId,
						sourceId,
						newSource,
					})
					.then((result) => ({
						status: "ok",
						message: `Published to Confluence: ${result.title}`,
						...result,
					}))
					.catch((err) => ({ status: "error", message: err.message }));
			}
			case "pull": {
				const { pageId: pid, title: searchTitle, into, spaceKey } = args;
				const target = pid || searchTitle;
				if (!target)
					return { status: "error", message: "Required: pageId or title" };
				// Prevent path traversal — target must stay within workspace
				if (into) {
					const checkPath = path.resolve(dir, into);
					if (!isInsideDir(checkPath, dir)) {
						return {
							status: "error",
							message: `Target path escapes workspace directory.`,
						};
					}
				}
				return confluence
					.pull(target, { spaceKey })
					.then((result) => {
						if (into) {
							const targetFile = path.resolve(dir, into);
							io.mergeClaims(result.claims, targetFile, {
								source: `confluence:${JSON.stringify([confluence.baseUrl, spaceKey || confluence.spaceKey, result.pageId])}`,
							});
						}
						return {
							status: "ok",
							title: result.title,
							claimCount: result.claims.length,
						};
					})
					.catch((err) => ({ status: "error", message: err.message }));
			}
			case "list": {
				const { spaceKey } = args;
				return confluence
					.listPages({ dir, workspace: args.workspace, spaceKey })
					.then((result) => ({ status: "ok", ...result }))
					.catch((err) => ({ status: "error", message: err.message }));
			}
			default:
				return {
					status: "error",
					message: "Unknown action. Use: publish, pull, list",
				};
		}
	}
	// ─── smart-fetch tool ───────────────────────────────────────────────────────
	function toolSmartFetch(args) {
		const url = args && args.url;
		if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
			return {
				status: "error",
				message: "Required: url (must start with http:// or https://)",
			};
		}
		// Return the promise so the async handler in tools/call unwraps it
		return smartFetch(url, {
			mode: args.mode,
			cache: args.cache,
			timeout: args.timeout,
			privacy: args.privacy,
		})
			.then((r) => ({
				...r,
				status: r.ok ? "ok" : "error",
				http_status: r.status,
			}))
			.catch((err) => ({ status: "error", message: err.message }));
	}
	// ─── Tool & Resource definitions ────────────────────────────────────────────
	function handleRequest(dir, method, params, id) {
		switch (method) {
			case "initialize":
				return jsonRpcResponse(id, {
					protocolVersion: PROTOCOL_VERSION,
					capabilities: { tools: {}, resources: {} },
					serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
				});
			case "notifications/initialized":
				return null;
			case "tools/list":
				return jsonRpcResponse(id, { tools: TOOLS });
			case "tools/call": {
				const toolName = params.name;
				const toolArgs = params.arguments || {};
				let result;
				switch (toolName) {
					case "memory_search":
						result = toolSearch(toolArgs);
						break;
					case "memory_list":
						result = toolList();
						break;
					case "memory_pull":
						result = toolPull(dir, toolArgs);
						break;
					case "memory_store":
						result = toolStore(dir, toolArgs);
						break;
					case "memory_packs":
						result = toolPacks();
						break;
					case "memory_graph":
						result = toolGraph(toolArgs);
						break;
					case "memory_confluence":
						result = toolConfluence(dir, toolArgs);
						break;
					case "memory_smart_fetch":
						result = toolSmartFetch(toolArgs);
						break;
					default:
						return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
				}
				// Handle async tool results (e.g., confluence)
				if (result instanceof Promise) {
					return result.then((r) =>
						jsonRpcResponse(id, {
							content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
							isError: r.status === "error",
						}),
					);
				}
				return jsonRpcResponse(id, {
					content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
					isError: result.status === "error",
				});
			}
			case "resources/list":
				return jsonRpcResponse(id, { resources: RESOURCES });
			case "resources/read": {
				const uri = params.uri;
				let text;
				switch (uri) {
					case "grainulator://memory/index":
						text = JSON.stringify(store.list(), null, 2);
						break;
					case "grainulator://memory/packs":
						text = JSON.stringify(
							packs.list().map((p) => ({
								name: p.name,
								description: p.description,
								claimCount: 0,
								source: p.source,
							})),
							null,
							2,
						);
						break;
					default:
						return jsonRpcError(id, -32602, `Unknown resource: ${uri}`);
				}
				return jsonRpcResponse(id, {
					contents: [{ uri, mimeType: "application/json", text }],
				});
			}
			case "ping":
				return jsonRpcResponse(id, {});
			default:
				if (id === undefined || id === null) return null;
				return jsonRpcError(id, -32601, `Method not found: ${method}`);
		}
	}
	return handleRequest;
}
let defaultHandler;
export function handleRequest(...args) {
	defaultHandler ||= createHandler();
	return defaultHandler(...args);
}
// ─── Stdio transport ────────────────────────────────────────────────────────
