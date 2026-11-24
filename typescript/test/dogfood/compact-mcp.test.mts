import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { test } from "node:test";
import { callCompact } from "../../lib/compact-mcp.js";
import {
	COMPACT_TOOLS,
	createHandler,
	TOOLS,
} from "../../lib/grainulator-mcp.js";
import {
	validateOutput,
	withStructuredResult,
} from "../../lib/mcp-contracts.js";
import { searchClaims } from "../../packages/evidence/lib/claims-ops.js";
import { correctClaim } from "../../packages/evidence/lib/maintenance.js";
import { handleRequest as evidenceRequest } from "../../packages/evidence/lib/serve-mcp.js";
import { Confluence } from "../../packages/memory/lib/confluence.js";
import { mcp } from "../../scripts/lib/local-checks.mjs";

type Handler = ReturnType<typeof createHandler>;
type OutputSchema = Parameters<typeof validateOutput>[1];
type Args = Record<string, unknown>;
type InputSchema =
	| boolean
	| {
			type?: string;
			minimum?: number;
			maximum?: number;
			minLength?: number;
			maxLength?: number;
			pattern?: string;
			enum?: unknown[];
			const?: unknown;
			required?: string[];
			oneOf?: InputSchema[];
			anyOf?: InputSchema[];
			not?: InputSchema;
			properties?: Record<string, InputSchema>;
			additionalProperties?: boolean;
	  };
type DiscoveredTool = {
	name: string;
	description: string;
	inputSchema: Exclude<InputSchema, boolean> & {
		properties: { done: { description: string } };
	};
	outputSchema?: NonNullable<OutputSchema> & {
		properties: NonNullable<NonNullable<OutputSchema>["properties"]>;
	};
};
type TextContent = { text: string };
type ToolCallResult = {
	content: TextContent[];
	isError?: boolean;
	structuredContent?: { status?: string; message?: string };
};
type RpcResults = {
	initialize: { protocolVersion: string };
	"tools/list": { tools: DiscoveredTool[] };
	"tools/call": ToolCallResult;
	"resources/read": { contents: TextContent[] };
};
type RpcResponse<Result> = { result: Result; error?: { code: number } };
type SearchClaim = {
	id: string;
	topic: string;
	content: string;
	status: string;
	evidence: string;
	audit: { revision: number };
	verification_observation_status: string;
	resolution_observation_status: string;
};
type Inspection = {
	sprint: unknown;
	evidence: unknown;
	acceptance: { clarification_needed: boolean; questions: { field: string }[] };
	duplicates: unknown;
	truncated_paths: string[];
	truncated_path_count: number;
};
type CountResult = { count: number };
type SearchResult = CountResult & { claims: SearchClaim[] };
type ObservationResult = { observation: { id: string } };
type ImportResult = { imported: number };
type MemoryCatalog = { collection_count: number; pack_count: number };
type FormatField = "id" | "name" | "extension" | "mimeType" | "description";
type ExportCatalog = CountResult & { formats: Record<FormatField, string>[] };

const initializeParams = (protocolVersion = "2025-06-18") => ({
	protocolVersion,
	capabilities: {},
	clientInfo: { name: "compact-test", version: "1" },
});

function readArtifactSnapshot(file: string) {
	const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
	try {
		const stat = fs.fstatSync(fd, { bigint: true });
		assert.ok(stat.isFile());
		const { dev, ino, mtimeNs } = stat;
		return { bytes: fs.readFileSync(fd), dev, ino, mtimeNs };
	} finally {
		fs.closeSync(fd);
	}
}

async function fixture(
	t: TestContext,
	toolset = "compact",
	protocolVersion: string | null = "2025-06-18",
) {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-compact-"));
	t.after(() => fs.rmSync(base, { recursive: true, force: true }));
	const dir = path.join(base, "workspace");
	fs.mkdirSync(dir);
	const handler = createHandler({
		dir,
		memoryDir: path.join(base, "memory"),
		toolset,
	});
	if (protocolVersion)
		await rpc(handler, "initialize", initializeParams(protocolVersion));
	return { base, dir, handler };
}
async function rpc<Method extends keyof RpcResults>(
	handler: Handler,
	method: Method,
	params: unknown = {},
): Promise<RpcResponse<RpcResults[Method]>> {
	return JSON.parse((await handler(method, params, 1))!) as RpcResponse<
		RpcResults[Method]
	>;
}
const emittedFields = new Map<string, Set<string>>();
async function call<Result = Record<string, unknown>>(
	handler: Handler,
	name: string,
	args: Args = {},
): Promise<Result> {
	const response = await rpc(handler, "tools/call", { name, arguments: args });
	assert.equal(response.error, undefined, JSON.stringify(response));
	const value = JSON.parse(response.result.content[0]!.text) as Record<
		string,
		unknown
	>;
	assert.equal(response.result.isError, false, JSON.stringify(value));
	assert.deepEqual(response.result.structuredContent, value);
	const schema = (await rpc(handler, "tools/list")).result.tools.find(
		(tool) => tool.name === name,
	)!.outputSchema!;
	validateOutput(value, schema);
	const seen = emittedFields.get(name) ?? new Set();
	for (const field of Object.keys(value)) seen.add(field);
	emittedFields.set(name, seen);
	// Every top-level operation-specific field must occur on its successful path.
	// Nested properties may be optional; the schema required list governs presence.
	// Composite tools publish unions whose alternatives are covered separately.
	if (
		!["configure_sprint", "search_memory", "export_document"].includes(name)
	) {
		assertDeclaredFields(value, schema, name);
	}
	return value as Result;
}
function assertDeclaredFields(
	value: unknown,
	schema: NonNullable<OutputSchema>,
	location: string,
	requireAdvertised = true,
) {
	for (const [field, child] of Object.entries(schema.properties || {})) {
		if (["status", "message", "error", "output"].includes(field)) continue;
		const present = Object.hasOwn(value as object, field);
		if (requireAdvertised || schema.required?.includes(field))
			assert.ok(present, `${location} advertises absent ${field}`);
		if (!present) continue;
		if (child.properties)
			assertDeclaredFields(
				(value as Record<string, unknown>)[field],
				child,
				`${location}/${field}`,
				false,
			);
	}
}
const claim = {
	id: "r1",
	type: "factual",
	topic: "contracts",
	content: "A locally recorded claim.",
	evidence: "tested",
};
const names = [
	"configure_sprint",
	"record_claim",
	"import_claims",
	"correct_claim",
	"resolve_conflict",
	"search_claims",
	"compile_sprint",
	"inspect_sprint",
	"link_premises",
	"observe_source",
	"update_finding",
	"search_memory",
	"import_memory",
	"store_memory",
	"export_document",
];

test("compact profile advertises exactly fifteen operations and rejects unadvertised legacy calls", async (t) => {
	const { dir, handler } = await fixture(t);
	assert.deepEqual(
		(await rpc(handler, "tools/list")).result.tools.map((tool) => tool.name),
		names,
	);
	assert.equal(TOOLS.length, 29);
	for (const tool of [...TOOLS, ...COMPACT_TOOLS]) {
		assert.equal(Object.keys(tool.annotations!).length, 4, tool.name);
		assert.ok(
			Object.keys(tool.outputSchema!.properties!).length >= 5,
			tool.name,
		);
	}
	for (const name of [
		"add_claim",
		"init",
		"memory_confluence",
		"memory_graph",
		"deepwiki",
	])
		assert.equal(
			(await rpc(handler, "tools/call", { name, arguments: {} })).error!.code,
			-32602,
		);
	assert.deepEqual(fs.readdirSync(dir), []);
	assert.throws(() => createHandler({ toolset: "unknown" }), /toolset/);
});

test("protocol negotiation is per connection and old hosts retain text-only contracts", async (t) => {
	const legacy = (await fixture(t, "legacy", null)).handler;
	const modern = (await fixture(t, "legacy", null)).handler;
	assert.ok(
		(await rpc(modern, "tools/list")).result.tools.every(
			(tool) => !Object.hasOwn(tool, "outputSchema"),
		),
	);
	assert.equal(
		(await rpc(legacy, "initialize", initializeParams("2024-11-05"))).result
			.protocolVersion,
		"2024-11-05",
	);
	assert.equal(
		(await rpc(modern, "initialize", initializeParams("2025-06-18"))).result
			.protocolVersion,
		"2025-06-18",
	);
	assert.ok(
		(await rpc(legacy, "tools/list")).result.tools.every(
			(tool) => !Object.hasOwn(tool, "outputSchema"),
		),
	);
	assert.ok(
		(await rpc(modern, "tools/list")).result.tools.every(
			(tool) => tool.outputSchema,
		),
	);
	const params = {
		name: "init",
		arguments: { question: "Preserve protocol contracts" },
	};
	assert.equal(
		Object.hasOwn(
			(await rpc(legacy, "tools/call", params)).result,
			"structuredContent",
		),
		false,
	);
	assert.equal(
		(await rpc(modern, "tools/call", params)).result.structuredContent!.status,
		"ok",
	);
	const failure = await rpc(modern, "tools/call", {
		name: "init",
		arguments: {},
	});
	assert.equal(failure.result.isError, true);
	assert.equal(failure.result.structuredContent!.status, "error");
	assert.equal(
		(
			await rpc(
				(
					await fixture(t, "legacy", null)
				).handler,
				"initialize",
				initializeParams("2099-01-01"),
			)
		).result.protocolVersion,
		"2025-06-18",
	);
	assert.throws(
		() =>
			withStructuredResult(
				JSON.stringify({
					result: {
						content: [{ type: "text", text: '{"claimCount":"wrong"}' }],
					},
				}),
				TOOLS.find((tool) => tool.name === "memory_store")!.outputSchema!,
			),
		/contract violation/,
	);
});

for (const toolset of ["legacy", "compact"]) {
	for (const version of ["2024-11-05", "2025-03-26", "2025-06-18"]) {
		test(`${toolset} commits ${version} once despite repeated initialization`, async (t) => {
			const { handler } = await fixture(t, toolset, version);
			const before = (await rpc(handler, "tools/list")).result;
			await rpc(handler, "tools/call", {
				name: toolset === "compact" ? "configure_sprint" : "init",
				arguments: { dir: ".", mode: "create", question: "Stable connection" },
			});
			const name = toolset === "compact" ? "search_claims" : "search";
			const args = { dir: "." };
			const resultBefore = (
				await rpc(handler, "tools/call", { name, arguments: args })
			).result;
			assert.equal(resultBefore.isError, false);
			for (const requested of ["2099-01-01", "2025-06-18", "2024-11-05"]) {
				assert.equal(
					(await rpc(handler, "initialize", initializeParams(requested))).result
						.protocolVersion,
					version,
				);
				assert.deepEqual((await rpc(handler, "tools/list")).result, before);
				assert.deepEqual(
					(await rpc(handler, "tools/call", { name, arguments: args })).result,
					resultBefore,
				);
			}
			assert.equal(
				Object.hasOwn(resultBefore, "structuredContent"),
				version === "2025-06-18",
			);
		});
	}
}

// Evaluate the JSON Schema keywords used by compact tools independently of
// the dispatcher's validation. Boolean schemas prohibit cross-mode properties.
function accepts(schema: InputSchema, value: unknown): boolean {
	if (typeof schema === "boolean") return schema;
	if (
		schema.type === "object" &&
		(!value || typeof value !== "object" || Array.isArray(value))
	)
		return false;
	if (
		schema.type === "number" &&
		(typeof value !== "number" || !Number.isFinite(value))
	)
		return false;
	if (schema.type === "integer" && !Number.isInteger(value)) return false;
	if (schema.minimum !== undefined && (value as number) < schema.minimum)
		return false;
	if (schema.maximum !== undefined && (value as number) > schema.maximum)
		return false;
	if (schema.type === "string" && typeof value !== "string") return false;
	if (typeof value === "string") {
		if (schema.minLength !== undefined && [...value].length < schema.minLength)
			return false;
		if (schema.maxLength !== undefined && [...value].length > schema.maxLength)
			return false;
		if (schema.pattern && !new RegExp(schema.pattern, "u").test(value))
			return false;
	}
	if (schema.type === "boolean" && typeof value !== "boolean") return false;
	if (schema.enum && !schema.enum.includes(value)) return false;
	if (Object.hasOwn(schema, "const") && schema.const !== value) return false;
	if (schema.required?.some((key) => !Object.hasOwn(value as object, key)))
		return false;
	if (
		schema.oneOf &&
		schema.oneOf.filter((branch) => accepts(branch, value)).length !== 1
	)
		return false;
	if (schema.anyOf && !schema.anyOf.some((branch) => accepts(branch, value)))
		return false;
	if (schema.not && accepts(schema.not, value)) return false;
	if (schema.properties) {
		for (const [key, item] of Object.entries(value as object)) {
			if (Object.hasOwn(schema.properties, key)) {
				if (!accepts(schema.properties[key]!, item)) return false;
			} else if (schema.additionalProperties === false) return false;
		}
	}
	return true;
}

test("configure discovery and dispatch agree on mode-specific arguments", async (t) => {
	const { dir, handler } = await fixture(t);
	const schema = (await rpc(handler, "tools/list")).result.tools.find(
		(tool) => tool.name === "configure_sprint",
	)!.inputSchema;
	for (const args of [
		{ mode: "create", question: "Rejected", reason: "Wrong mode" },
		...[{ force: false }, { audience: "reader" }, { constraints: "Local" }].map(
			(extra) => ({
				mode: "criteria",
				done: "Rejected",
				reason: "Wrong mode",
				...extra,
			}),
		),
		{ mode: "create" },
		{ mode: "criteria", done: "Missing reason" },
		{ mode: "criteria", reason: "Missing criteria" },
	]) {
		assert.equal(accepts(schema, args), false, JSON.stringify(args));
		assert.equal(
			(
				await rpc(handler, "tools/call", {
					name: "configure_sprint",
					arguments: args,
				})
			).result.isError,
			true,
		);
	}
	assert.deepEqual(fs.readdirSync(dir), []);
	for (const args of [
		{
			mode: "create",
			question: "Created",
			audience: "reader",
			constraints: "Local",
			force: false,
		},
		{ mode: "criteria", question: "Updated", reason: "Changed goal" },
		{ mode: "criteria", done: "Checked", reason: "Changed completion" },
	]) {
		assert.equal(accepts(schema, args), true, JSON.stringify(args));
		await call(handler, "configure_sprint", args);
	}
});

test("compact compiler failures preserve backend fields and exact text in both protocols", async (t) => {
	for (const protocolVersion of ["2024-11-05", "2025-06-18"]) {
		const { dir, handler } = await fixture(t, "compact", protocolVersion);
		const legacy = createHandler({ dir, memoryDir: path.join(dir, "memory") });
		await rpc(legacy, "initialize", initializeParams(protocolVersion));
		// Invalid user input triggers the real compiler catch path, without
		// modifying any repository sprint or bypassing its validation gates.
		fs.writeFileSync(path.join(dir, "claims.json"), "{");
		const expected = (
			await rpc(legacy, "tools/call", {
				name: "compile",
				arguments: { dir: "." },
			})
		).result;
		const actual = (
			await rpc(handler, "tools/call", {
				name: "compile_sprint",
				arguments: { dir: "." },
			})
		).result;
		assert.equal(actual.isError, true);
		assert.deepEqual(actual, expected);
		const value = JSON.parse(actual.content[0]!.text) as {
			status: string;
			output: string;
			error: string;
		};
		assert.equal(value.status, "error");
		assert.equal(value.output, "");
		assert.equal(typeof value.error, "string");
		assert.ok(value.error.length > 0);
		if (protocolVersion === "2025-06-18")
			assert.deepEqual(actual.structuredContent, value);
		else assert.equal(Object.hasOwn(actual, "structuredContent"), false);
	}
});

test("correction and preview discovery describe successful results in both profiles", async (t) => {
	for (const profile of ["legacy", "compact"]) {
		const { handler } = await fixture(t, profile);
		const tools = (await rpc(handler, "tools/list")).result.tools;
		async function run<Result = unknown>(
			name: string,
			args: Args,
		): Promise<Result> {
			const response = (
				await rpc(handler, "tools/call", {
					name,
					arguments: { dir: ".", ...args },
				})
			).result;
			assert.equal(response.isError, false, response.content[0]!.text);
			assert.deepEqual(
				response.structuredContent,
				JSON.parse(response.content[0]!.text) as unknown,
			);
			return response.structuredContent as Result;
		}
		await run(profile === "compact" ? "configure_sprint" : "init", {
			mode: "create",
			question: "Contracts",
		});
		const add = profile === "compact" ? "record_claim" : "add_claim";
		await run(add, claim);
		await run(add, { ...claim, id: "dependent" });
		await run(profile === "compact" ? "link_premises" : "premise_links", {
			claim_id: "dependent",
			premises: ["r1"],
			reason: "Necessary premise",
		});
		const correction = await run<{
			previous: string;
			replacement: string;
			needs_reverification: { claim_id: string }[];
		}>("correct_claim", {
			claim_id: "r1",
			id: "r2",
			content: "Corrected",
			reason: "Rechecked",
		});
		assert.equal(correction.previous, "r1");
		assert.equal(correction.replacement, "r2");
		assert.equal(correction.needs_reverification[0]!.claim_id, "dependent");
		const previewName =
			profile === "compact" ? "export_document" : "exports_preview";
		const preview = await run<{
			showing: number;
			totalLines: number;
			hasMore: boolean;
		}>(previewName, { format: "markdown", lines: 1 });
		assert.equal(preview.showing, 1);
		assert.ok(preview.totalLines > preview.showing);
		assert.equal(preview.hasMore, true);
		for (const [name, result, present, absent] of [
			[
				"correct_claim",
				correction,
				["previous", "replacement", "needs_reverification"],
				["claim", "predecessor"],
			],
			[previewName, preview, ["totalLines", "showing", "hasMore"], ["lines"]],
		] as const) {
			const schema = tools.find((tool) => tool.name === name)!.outputSchema!;
			validateOutput(result, schema);
			for (const field of present) {
				assert.ok(Object.hasOwn(schema.properties, field), field);
				assert.ok(Object.hasOwn(result, field), field);
			}
			for (const field of absent)
				assert.equal(Object.hasOwn(schema.properties, field), false, field);
		}
	}
});

test("Confluence discovery reports retrieved claimCount independently of import deduplication", async (t) => {
	t.mock.method(Confluence.prototype, "isConfigured", () => true);
	t.mock.method(Confluence.prototype, "pull", async () => ({
		pageId: "123",
		title: "Fixture",
		claims: [claim],
	}));
	const { dir, handler } = await fixture(t, "legacy");
	await rpc(handler, "tools/call", {
		name: "init",
		arguments: { dir: ".", question: "Retrieval counts" },
	});
	const schema = (await rpc(handler, "tools/list")).result.tools.find(
		(tool) => tool.name === "memory_confluence",
	)!.outputSchema!;
	assert.equal(schema.properties.claimCount!.type, "number");
	assert.match(
		schema.properties.claimCount!.description!,
		/retrieved.*not an imported count/,
	);
	assert.equal(Object.hasOwn(schema.properties, "imported"), false);
	assert.equal(Object.hasOwn(schema.properties, "pageId"), false);
	for (const into of [undefined, "claims.json", "claims.json"]) {
		const before = fs.readFileSync(path.join(dir, "claims.json"), "utf8");
		const response = (
			await rpc(handler, "tools/call", {
				name: "memory_confluence",
				arguments: {
					dir: ".",
					action: "pull",
					pageId: "123",
					...(into ? { into } : {}),
				},
			})
		).result;
		assert.equal(response.isError, false, response.content[0]!.text);
		assert.deepEqual(response.structuredContent, {
			status: "ok",
			title: "Fixture",
			claimCount: 1,
		});
		validateOutput(response.structuredContent, schema);
		if (!into)
			assert.equal(
				fs.readFileSync(path.join(dir, "claims.json"), "utf8"),
				before,
			);
	}
	assert.equal(
		(
			JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8")) as {
				claims: unknown[];
			}
		).claims.length,
		1,
	);
});

test("inspection bounds all arrays including truncation paths and reports omitted path counts", async (t) => {
	const { handler } = await fixture(t);
	await call(handler, "configure_sprint", {
		mode: "create",
		question: "Bound diagnostics",
	});
	for (let index = 0; index < 4; index++)
		await call(handler, "record_claim", {
			...claim,
			id: `r${index}`,
			topic: `topic${index}`,
		});
	await call(handler, "compile_sprint");
	const full = await call<Inspection>(handler, "inspect_sprint", {
		limit: 100,
	});
	const small = await call<Inspection>(handler, "inspect_sprint", { limit: 1 });
	const shortened: string[] = [];
	function inspect(value: unknown, bounded: unknown, location = "") {
		if (Array.isArray(value)) {
			const items = bounded as unknown[];
			assert.ok(items.length <= 1, location);
			if (value.length > 1) shortened.push(location);
			value.slice(0, 1).forEach((item, index) => {
				inspect(item, items[index], `${location}/${index}`);
			});
		} else if (value && typeof value === "object") {
			for (const [key, item] of Object.entries(value))
				inspect(
					item,
					(bounded as Record<string, unknown>)[key],
					`${location}/${key}`,
				);
		}
	}
	for (const section of [
		"sprint",
		"evidence",
		"acceptance",
		"duplicates",
	] as const)
		inspect(full[section], small[section], `/${section}`);
	assert.ok(shortened.length > 1);
	assert.equal(small.truncated_paths.length, 1);
	assert.equal(small.truncated_path_count, shortened.length);
	assert.deepEqual(small.truncated_paths, shortened.slice(0, 1));
	assert.equal(full.truncated_path_count, 0);
});

test("compact evidence operations preserve import provenance, corrections and revision guards", async (t) => {
	const { dir, handler } = await fixture(t);
	await call(handler, "configure_sprint", {
		mode: "create",
		question: "Can evidence survive the compact interface?",
		done: "Validated evidence routes",
	});
	await call(handler, "record_claim", claim);
	await call(handler, "record_claim", {
		...claim,
		id: "conflicting",
		conflicts_with: ["r1"],
	});
	await call(handler, "link_premises", {
		claim_id: "conflicting",
		premises: ["r1"],
		reason: "Necessary premise",
	});
	await call(handler, "resolve_conflict", {
		winner: "r1",
		loser: "conflicting",
		reason: "Reviewed conflict",
	});
	const imported = await call<ImportResult>(handler, "import_claims", {
		source: "document:one",
		claims: [{ ...claim, id: "external", evidence: "production" }],
	});
	assert.equal(imported.imported, 1);
	assert.equal(
		(
			await call<ImportResult>(handler, "import_claims", {
				source: "document:one",
				claims: [{ ...claim, id: "external", evidence: "production" }],
			})
		).imported,
		0,
	);
	let records = (await call<SearchResult>(handler, "search_claims")).claims;
	assert.equal(
		records.find((record) => record.id.startsWith("imp-"))!.evidence,
		"stated",
	);
	assert.equal(records.find((record) => record.id === "r1")!.audit.revision, 0);
	fs.writeFileSync(path.join(dir, "source.txt"), "Current source evidence.\n");
	const observation = (
		await call<ObservationResult>(handler, "observe_source", {
			claim_id: "r1",
			path: "source.txt",
		})
	).observation;
	await call(handler, "update_finding", {
		claim_id: "r1",
		action: "verify",
		expected_revision: 0,
		reason: "Read the current source",
		verdict: "confirmed",
		observation_id: observation.id,
	});
	assert.equal(
		(
			await call<CountResult>(handler, "search_claims", {
				verdict: "confirmed",
			})
		).count,
		1,
	);
	const stale = await rpc(handler, "tools/call", {
		name: "update_finding",
		arguments: {
			claim_id: "r1",
			action: "reopen",
			expected_revision: 0,
			reason: "Must reject stale revision",
		},
	});
	assert.equal(stale.result.isError, true);
	await call(handler, "correct_claim", {
		claim_id: "r1",
		id: "r2",
		content: "An explicitly corrected claim.",
		reason: "Rechecked the premise",
	});
	records = (
		await call<SearchResult>(handler, "search_claims", {
			include_inactive: true,
		})
	).claims;
	assert.equal(
		records.find((record) => record.id === "r1")!.status,
		"superseded",
	);
	assert.equal(
		records.find((record) => record.id === "r2")!.evidence,
		"stated",
	);
	await call(handler, "configure_sprint", {
		mode: "criteria",
		done: "Revised completion",
		reason: "The requirement changed",
	});
	assert.equal(
		(
			await call<SearchResult>(handler, "search_claims", {
				include_inactive: true,
			})
		).claims.find((record) => record.id === "r2")!.content,
		"An explicitly corrected claim.",
	);
	await call(handler, "compile_sprint");
	const before = fs.readFileSync(path.join(dir, "claims.json"), "utf8");
	const inspection = await call<Inspection>(handler, "inspect_sprint", {
		limit: 1,
	});
	assert.ok(
		inspection.sprint &&
			inspection.evidence &&
			inspection.acceptance &&
			inspection.duplicates,
	);
	assert.equal(fs.readFileSync(path.join(dir, "claims.json"), "utf8"), before);
});

test("compact memory, exports and catalogs remain usable without relaxing output confinement", async (t) => {
	const { base, dir, handler } = await fixture(t);
	await call(handler, "configure_sprint", {
		mode: "create",
		question: "Test local reuse",
	});
	await call(handler, "record_claim", claim);
	await call(handler, "compile_sprint");
	await call(handler, "store_memory", { name: "Reusable" });
	const catalog = await call<MemoryCatalog>(handler, "search_memory");
	assert.equal(catalog.collection_count, 1);
	assert.ok(catalog.pack_count > 0);
	assert.equal(
		(await call<CountResult>(handler, "search_memory", { query: "locally" }))
			.count,
		1,
	);
	await call(handler, "configure_sprint", {
		mode: "create",
		dir: "child",
		question: "Reuse stored evidence",
	});
	assert.equal(
		(
			await call<ImportResult>(handler, "import_memory", {
				dir: "child",
				pack: "Reusable",
			})
		).imported,
		1,
	);
	assert.match(
		(
			await call<{ output: string }>(handler, "export_document", {
				format: "markdown",
			})
		).output,
		/locally recorded/,
	);
	assert.ok(
		(await call(handler, "export_document", { format: "markdown", lines: 2 }))
			.preview,
	);
	await call(handler, "export_document", {
		format: "markdown",
		output: "report.md",
	});
	assert.match(
		fs.readFileSync(path.join(dir, "report.md"), "utf8"),
		/locally recorded/,
	);
	for (const uri of [
		"grainulator://memory/index",
		"grainulator://memory/packs",
		"grainulator://exports/formats",
	])
		assert.ok(
			(await rpc(handler, "resources/read", { uri })).result.contents[0]!.text,
		);
	const outside = path.join(base, "outside");
	fs.mkdirSync(outside);
	fs.symlinkSync(outside, path.join(dir, "escape"));
	const ledger = path.join(dir, "claims.json");
	const previous = readArtifactSnapshot(ledger);
	for (const args of [
		{ format: "markdown", output: "claims.json" },
		{ format: "markdown", output: "escape/new/report.md" },
		{ format: "markdown", output: "report.md", lines: 2 },
	]) {
		assert.equal(
			(
				await rpc(handler, "tools/call", {
					name: "export_document",
					arguments: args,
				})
			).result.isError,
			true,
		);
		assert.deepEqual(readArtifactSnapshot(ledger), previous);
	}
	assert.deepEqual(fs.readdirSync(outside), []);
	for (const args of [
		{
			mode: "criteria",
			force: true,
			done: "Must not replace",
			reason: "Rejected",
		},
		{ mode: "unknown", question: "Rejected" },
		{ mode: "create", question: "Rejected", arbitrary: true },
	]) {
		assert.equal(
			(
				await rpc(handler, "tools/call", {
					name: "configure_sprint",
					arguments: args,
				})
			).result.isError,
			true,
		);
		assert.deepEqual(readArtifactSnapshot(ledger), previous);
	}
});

test("CLI compact startup performs real stdio discovery and calls", async (t) => {
	const { dir } = await fixture(t);
	const client = mcp(
		[
			process.execPath,
			path.resolve("bin/grainulator.js"),
			"mcp",
			"--dir",
			dir,
			"--toolset",
			"compact",
		],
		{ cwd: dir },
	);
	t.after(() => client.close());
	assert.equal(
		(
			(await client.request(
				"initialize",
				initializeParams("2025-06-18"),
			)) as RpcResults["initialize"]
		).protocolVersion,
		"2025-06-18",
	);
	assert.deepEqual(
		(await client.request("tools/list")).tools.map((tool) => tool.name),
		names,
	);
	const result = (await client.request("tools/call", {
		name: "configure_sprint",
		arguments: { mode: "create", question: "Real compact stdio" },
	})) as ToolCallResult;
	assert.equal(result.structuredContent!.status, "ok");
});

test("malformed initialize never pins either profile before a valid old handshake", async (t) => {
	for (const profile of ["legacy", "compact"]) {
		const { handler } = await fixture(t, profile, null);
		for (const params of [
			null,
			[],
			{},
			{ protocolVersion: "2099-01-01" },
			{ ...initializeParams(), protocolVersion: 1 },
			{ ...initializeParams(), capabilities: [] },
			{ ...initializeParams(), clientInfo: {} },
			{ ...initializeParams(), clientInfo: { name: "test", version: 1 } },
			{
				...initializeParams(),
				clientInfo: { name: "test", version: "1", title: null },
			},
			...["roots", "sampling", "elicitation", "experimental"].flatMap((key) =>
				[false, null, [], "invalid"].map((value) => ({
					...initializeParams(),
					capabilities: { [key]: value },
				})),
			),
			{
				...initializeParams(),
				capabilities: { roots: { listChanged: "true" } },
			},
			{ ...initializeParams(), capabilities: { roots: { listChanged: null } } },
			...[null, false, [], "invalid"].map((value) => ({
				...initializeParams(),
				capabilities: { experimental: { extension: value } },
			})),
		]) {
			const response = await rpc(handler, "initialize", params);
			assert.equal(response.error!.code, -32602);
			assert.ok(
				(await rpc(handler, "tools/list")).result.tools.every(
					(tool) => !tool.outputSchema,
				),
			);
		}
		assert.equal(
			(await rpc(handler, "initialize", initializeParams("2024-11-05"))).result
				.protocolVersion,
			"2024-11-05",
		);
		assert.ok(
			(await rpc(handler, "tools/list")).result.tools.every(
				(tool) => !tool.outputSchema,
			),
		);
		const result = (
			await rpc(handler, "tools/call", {
				name: profile === "compact" ? "configure_sprint" : "init",
				arguments: {
					dir: ".",
					...(profile === "compact" ? { mode: "create" } : {}),
					question: "Valid old handshake",
				},
			})
		).result;
		assert.equal(result.isError, false);
		assert.equal(Object.hasOwn(result, "structuredContent"), false);
	}
});

test("initialize accepts known nested capabilities and extension fields in both profiles", async (t) => {
	for (const profile of ["legacy", "compact"]) {
		for (const listChanged of [undefined, false, true]) {
			const { handler } = await fixture(t, profile, null);
			const response = await rpc(handler, "initialize", {
				...initializeParams("2099-01-01"),
				capabilities: {
					roots: {
						...(listChanged === undefined ? {} : { listChanged }),
						extension: false,
					},
					sampling: { extension: "allowed" },
					elicitation: {},
					experimental: { vendor: { enabled: true } },
					vendor: ["allowed"],
				},
				clientInfo: {
					name: "test",
					version: "1",
					title: "Test",
					vendor: false,
				},
				extension: true,
			});
			assert.equal(response.error, undefined);
			assert.equal(response.result.protocolVersion, "2025-06-18");
			assert.ok(
				(await rpc(handler, "tools/list")).result.tools.every(
					(tool) => tool.outputSchema,
				),
			);
		}
	}
});

test("catalog and query/render schemas agree with dispatch including tool-only formats", async (t) => {
	const { handler } = await fixture(t);
	const tools = (await rpc(handler, "tools/list")).result.tools;
	for (const [name, valid, invalid] of [
		[
			"search_memory",
			[
				{ dir: "." },
				{
					dir: ".",
					query: "locally",
					limit: 5,
					type: "factual",
					evidence: "tested",
				},
			],
			[
				{ dir: ".", limit: 5 },
				{ dir: ".", type: "factual" },
				{ dir: ".", evidence: "tested" },
			],
		],
		[
			"export_document",
			[{}, { dir: "." }],
			[
				{ dir: ".", lines: 1 },
				{ dir: ".", output: "report.md" },
				{ dir: ".", source: "claims.json" },
				{ dir: ".", format: "markdown", lines: 1, output: "report.md" },
			],
		],
	] satisfies [string, Args[], Args[]][]) {
		const schema = tools.find((tool) => tool.name === name)!.inputSchema;
		for (const args of valid) {
			assert.equal(accepts(schema, args), true, JSON.stringify(args));
			await call(handler, name, args);
		}
		for (const args of invalid) {
			assert.equal(accepts(schema, args), false, JSON.stringify(args));
			assert.equal(
				(await rpc(handler, "tools/call", { name, arguments: args })).result
					.isError,
				true,
			);
		}
	}
	const catalog = await call<ExportCatalog>(handler, "export_document", {
		dir: ".",
	});
	assert.equal(catalog.count, catalog.formats.length);
	assert.ok(catalog.count > 0);
	for (const format of catalog.formats) {
		for (const field of [
			"id",
			"name",
			"extension",
			"mimeType",
			"description",
		] as const)
			assert.equal(typeof format[field], "string");
	}
	assert.equal(
		(
			await rpc(handler, "tools/call", {
				name: "exports_formats",
				arguments: { dir: "." },
			})
		).error!.code,
		-32602,
	);
	for (const profile of ["legacy", "compact"]) {
		const h =
			profile === "compact" ? handler : (await fixture(t, "legacy")).handler;
		const result = (
			await rpc(h, "tools/call", {
				name: profile === "compact" ? "export_document" : "exports_convert",
				arguments: { dir: ".", format: "not-a-format" },
			})
		).result;
		assert.equal(result.isError, true);
		const message = result.structuredContent!.message!;
		assert.match(message, /grainulator:\/\/exports\/formats/);
		assert.doesNotMatch(message, /exports_formats/);
		const resource = (
			await rpc(h, "resources/read", { uri: "grainulator://exports/formats" })
		).result;
		assert.deepEqual(
			JSON.parse(resource.contents[0]!.text) as unknown,
			catalog.formats,
		);
	}
});

test("omitted done reports its acceptance gap and criteria updates preserve history", async (t) => {
	const { handler } = await fixture(t);
	const tool = (await rpc(handler, "tools/list")).result.tools.find(
		(tool) => tool.name === "configure_sprint",
	)!;
	assert.doesNotMatch(
		tool.inputSchema.properties.done.description,
		/default:/i,
	);
	assert.match(
		tool.description,
		/done replaces active completion criteria with preserved history/,
	);
	assert.match(
		tool.inputSchema.properties.done.description,
		/creates no done-criteria claim/,
	);
	for (const text of [
		/In create mode, omission.*acceptance gap/,
		/In criteria mode, omission preserves existing completion criteria/,
		/supplied update must be nonempty/,
		/inspect_sprint\.acceptance/,
	])
		assert.match(tool.inputSchema.properties.done.description, text);
	assert.doesNotMatch(
		tool.inputSchema.properties.done.description,
		/acceptance_check/,
	);
	await call(handler, "configure_sprint", {
		dir: ".",
		mode: "create",
		question: "Explicit acceptance",
	});
	const inspection = await call<Inspection>(handler, "inspect_sprint", {
		dir: ".",
	});
	assert.equal(inspection.acceptance.clarification_needed, true);
	assert.deepEqual(
		inspection.acceptance.questions.map((item) => item.field),
		["done"],
	);
	await call(handler, "configure_sprint", {
		dir: ".",
		mode: "criteria",
		done: "First",
		reason: "Set criteria",
	});
	await call(handler, "configure_sprint", {
		dir: ".",
		mode: "criteria",
		done: "Second",
		reason: "Revise criteria",
	});
	await call(handler, "configure_sprint", {
		dir: ".",
		mode: "criteria",
		question: "Updated question",
		reason: "Clarify goal",
	});
	for (const done of ["", "   "]) {
		const response = await rpc(handler, "tools/call", {
			name: "configure_sprint",
			arguments: { dir: ".", mode: "criteria", done, reason: "Empty update" },
		});
		assert.equal(response.result.isError, true);
	}
	const criteria = (
		await call<SearchResult>(handler, "search_claims", {
			dir: ".",
			include_inactive: true,
		})
	).claims.filter((item) => item.topic === "done-criteria");
	assert.equal(
		criteria.find((item) => item.content === "First")!.status,
		"superseded",
	);
	assert.equal(
		criteria.find((item) => item.content === "Second")!.status,
		"active",
	);
	assert.equal(
		(await call<Inspection>(handler, "inspect_sprint", { dir: "." })).acceptance
			.clarification_needed,
		false,
	);
});

test("compact search projects the selected snapshot when a correction interleaves", async (t) => {
	for (const verdict of [undefined, "confirmed"]) {
		const { dir, handler } = await fixture(t);
		await call(handler, "configure_sprint", {
			dir: ".",
			mode: "create",
			question: "Snapshot search",
		});
		await call(handler, "record_claim", { dir: ".", ...claim });
		fs.writeFileSync(path.join(dir, "source.txt"), "Snapshot source.\n");
		const { observation } = await call<ObservationResult>(
			handler,
			"observe_source",
			{
				dir: ".",
				claim_id: "r1",
				path: "source.txt",
			},
		);
		await call(handler, "update_finding", {
			dir: ".",
			claim_id: "r1",
			action: "verify",
			expected_revision: 0,
			reason: "Verified before selection",
			verdict: "confirmed",
			observation_id: observation.id,
		});
		const selected = searchClaims(dir, { full: true }).claims![0]!;
		const legacyAuditArgs = { full: true, includeAudit: true };
		assert.equal(
			Object.hasOwn(selected, "verification_observation_status"),
			false,
		);
		assert.equal(
			Object.hasOwn(
				searchClaims(dir, legacyAuditArgs).claims![0]!,
				"verification_observation_status",
			),
			false,
		);
		let selections = 0;
		const result = await callCompact(
			COMPACT_TOOLS.find((tool) => tool.name === "search_claims")!,
			{ dir: ".", ...(verdict ? { verdict } : {}) },
			async (method, params, id) => {
				assert.equal(
					params.name,
					"search",
					"one search; no separate findings read",
				);
				return evidenceRequest(
					dir,
					method,
					{
						...params,
						arguments: {
							...(params.arguments as Record<string, unknown>),
							dir,
						},
					},
					id,
					{
						includeAudit: true,
						afterSelect() {
							selections++;
							assert.equal(
								correctClaim(dir, {
									claim_id: "r1",
									id: "r2",
									content: "Corrected after selection",
									reason: "Interleaving writer",
								}).status,
								"ok",
							);
						},
					},
				);
			},
		);
		assert.equal(selections, 1);
		assert.equal(result.count, 1);
		assert.deepEqual(result.claims, [
			{
				...selected,
				verification_observation_status: "intact",
				resolution_observation_status: "not_recorded",
			},
		]);
		assert.deepEqual(
			searchClaims(dir, {}).claims!.map((item) => item.id),
			["r2"],
		);
	}
});

test("initialization returns configured artifact paths and confines writes in both profiles", async (t) => {
	for (const profile of ["legacy", "compact"]) {
		for (const custom of [false, true]) {
			const { dir, handler } = await fixture(t, profile);
			const files = custom
				? ["data/ledger.json", "reports/report.json"]
				: ["claims.json", "compilation.json"];
			if (custom)
				fs.writeFileSync(
					path.join(dir, "grainulator.config.json"),
					JSON.stringify({
						schema_version: 1,
						evidence: { compiler: { claims: files[0], compilation: files[1] } },
					}),
				);
			const result = await call<{ files_created: string[]; directory: string }>(
				handler,
				profile === "compact" ? "configure_sprint" : "init",
				{
					dir: ".",
					...(profile === "compact" ? { mode: "create" } : {}),
					question: "Artifact paths",
				},
			);
			assert.deepEqual(result.files_created, files);
			for (const file of result.files_created) {
				assert.ok(
					JSON.parse(
						readArtifactSnapshot(
							path.resolve(result.directory, file),
						).bytes.toString("utf8"),
					),
				);
			}
			if (custom)
				assert.equal(fs.existsSync(path.join(dir, "claims.json")), false);
		}
		for (const compilerKey of ["claims", "compilation"]) {
			for (const escapedPath of [
				"../outside/artifact.json",
				"escape/artifact.json",
			]) {
				const { base, dir, handler } = await fixture(t, profile);
				const outside = path.join(base, "outside");
				fs.mkdirSync(outside);
				fs.symlinkSync(outside, path.join(dir, "escape"));
				fs.writeFileSync(
					path.join(dir, "grainulator.config.json"),
					JSON.stringify({
						schema_version: 1,
						evidence: { compiler: { [compilerKey]: escapedPath } },
					}),
				);
				const result = await rpc(handler, "tools/call", {
					name: profile === "compact" ? "configure_sprint" : "init",
					arguments: {
						dir: ".",
						...(profile === "compact" ? { mode: "create" } : {}),
						question: "Confined artifacts",
					},
				});
				assert.equal(result.result.isError, true);
				assert.match(result.result.structuredContent!.message!, /outside/);
				assert.deepEqual(fs.readdirSync(outside), []);
				assert.equal(fs.existsSync(path.join(dir, "claims.json")), false);
			}
		}
	}
});

test("historical verified and unaudited findings retain shared defaults and freshness", async (t) => {
	const { dir, handler } = await fixture(t);
	await call(handler, "configure_sprint", {
		dir: ".",
		mode: "create",
		question: "Historical projections",
	});
	for (const id of ["verified", "unaudited"])
		await call(handler, "record_claim", { dir: ".", ...claim, id });
	fs.writeFileSync(path.join(dir, "source.txt"), "Current source.\n");
	const observation = (
		await call<ObservationResult>(handler, "observe_source", {
			dir: ".",
			claim_id: "verified",
			path: "source.txt",
		})
	).observation;
	await call(handler, "update_finding", {
		dir: ".",
		claim_id: "verified",
		action: "verify",
		expected_revision: 0,
		reason: "Checked",
		verdict: "confirmed",
		observation_id: observation.id,
	});
	for (const id of ["verified", "unaudited"])
		await call(handler, "correct_claim", {
			dir: ".",
			claim_id: id,
			id: `${id}-new`,
			content: "Corrected",
			reason: "Rechecked",
		});
	const historical = (
		await call<SearchResult>(handler, "search_claims", {
			dir: ".",
			include_inactive: true,
			verdict: "confirmed",
		})
	).claims;
	assert.equal(historical.length, 1);
	assert.equal(historical[0]!.status, "superseded");
	assert.equal(historical[0]!.verification_observation_status, "intact");
	fs.writeFileSync(path.join(dir, "source.txt"), "Changed source.\n");
	assert.equal(
		(
			await call<SearchResult>(handler, "search_claims", {
				dir: ".",
				id: "verified",
				include_inactive: true,
			})
		).claims[0]!.verification_observation_status,
		"changed",
	);
	const unaudited = (
		await call<SearchResult>(handler, "search_claims", {
			dir: ".",
			id: "unaudited",
			include_inactive: true,
			verdict: "unverified",
			resolution: "open",
		})
	).claims;
	assert.equal(unaudited.length, 1);
	assert.equal(unaudited[0]!.status, "superseded");
	assert.deepEqual(unaudited[0]!.audit, {
		revision: 0,
		verdict: "unverified",
		resolution: "open",
		duplicate_of: null,
	});
	assert.equal(unaudited[0]!.verification_observation_status, "not_recorded");
	assert.equal(unaudited[0]!.resolution_observation_status, "not_recorded");
	const legacy = createHandler({ dir });
	for (const include_inactive of ["true", 1, null]) {
		assert.equal(
			(
				await rpc(legacy, "tools/call", {
					name: "findings",
					arguments: { dir: ".", include_inactive },
				})
			).result.isError,
			true,
		);
	}
	const active = JSON.parse(
		(
			await rpc(legacy, "tools/call", {
				name: "findings",
				arguments: { dir: "." },
			})
		).result.content[0]!.text,
	) as { findings: { claim_id: string }[] };
	assert.equal(
		active.findings.some((item) => item.claim_id === "verified"),
		false,
	);
});

test("historical projections and catalog fallback retain project scope and confinement", async (t) => {
	const { base, dir, handler } = await fixture(t);
	fs.writeFileSync(
		path.join(dir, "grainulator.config.json"),
		JSON.stringify({
			schema_version: 1,
			evidence: {
				compiler: {
					claims: "data/claims.json",
					compilation: "data/compilation.json",
				},
			},
		}),
	);
	await call(handler, "configure_sprint", {
		dir: ".",
		mode: "create",
		question: "Configured projections",
	});
	await call(handler, "record_claim", { dir: ".", ...claim });
	await call(handler, "correct_claim", {
		dir: ".",
		claim_id: "r1",
		id: "r2",
		content: "Corrected",
		reason: "Updated",
	});
	const found = await call<SearchResult>(handler, "search_claims", {
		dir: ".",
		id: "r1",
		include_inactive: true,
		verdict: "unverified",
		resolution: "open",
	});
	assert.equal(found.count, 1);
	assert.equal(
		found.claims[0]!.verification_observation_status,
		"not_recorded",
	);
	assert.equal(fs.existsSync(path.join(dir, "claims.json")), false);
	assert.ok(fs.existsSync(path.join(dir, "data/claims.json")));
	const outside = path.join(base, "outside");
	fs.mkdirSync(outside);
	fs.symlinkSync(outside, path.join(dir, "escape"));
	for (const name of ["search_claims", "export_document"]) {
		for (const selected of ["escape", "../outside"]) {
			const result = (
				await rpc(handler, "tools/call", {
					name,
					arguments: {
						dir: selected,
						...(name === "search_claims" ? { include_inactive: true } : {}),
					},
				})
			).result;
			assert.equal(result.isError, true);
			assert.match(result.structuredContent!.message!, /outside workspace/);
		}
	}
	assert.deepEqual(fs.readdirSync(outside), []);
});

test("memory graph discovery names the actual results of every supported action", async (t) => {
	const { handler } = await fixture(t, "legacy");
	async function run<Result = unknown>(
		name: string,
		args: Args = {},
	): Promise<Result> {
		const result = (
			await rpc(handler, "tools/call", {
				name,
				arguments: { dir: ".", ...args },
			})
		).result;
		assert.equal(result.isError, false, result.content[0]!.text);
		return result.structuredContent as Result;
	}
	await run("init", { question: "Graph contracts" });
	for (let index = 0; index < 21; index++)
		await run("add_claim", {
			...claim,
			id: `graph-${index}`,
			topic: `graph-topic-${index}`,
		});
	await run("memory_store", { name: "Graph contracts" });
	const schema = (await rpc(handler, "tools/list")).result.tools.find(
		(tool) => tool.name === "memory_graph",
	)!.outputSchema!;
	for (const [args, fields] of [
		[{ action: "build" }, ["nodes", "edges", "sources", "topics", "tags"]],
		[{ action: "stats" }, ["nodes", "edges", "sources", "topics", "tags"]],
		[{ action: "related", claimId: "graph-0" }, ["related", "count"]],
		[{ action: "topic", topic: "graph-topic-0" }, ["claims", "count"]],
		[{ action: "clusters", minSize: 1 }, ["clusters", "count"]],
	] satisfies [Args & { action: string }, string[]][]) {
		const result = await run<Record<string, unknown>>("memory_graph", args);
		validateOutput(result, schema);
		for (const field of fields) {
			assert.ok(Object.hasOwn(schema.properties, field), field);
			assert.ok(Object.hasOwn(result, field), field);
		}
		if (args.action === "clusters") {
			const clustered = result as CountResult & { clusters: unknown[] };
			assert.equal(clustered.clusters.length, 20);
			assert.ok(clustered.count > 20);
			assert.match(
				schema.properties.count!.description!,
				/total clusters found before.*20/,
			);
		}
	}
});

test("every compact output field has a successful runtime example, including composite modes", () => {
	for (const tool of COMPACT_TOOLS) {
		const seen = emittedFields.get(tool.name);
		assert.ok(seen, `Missing successful fixture for ${tool.name}`);
		for (const field of Object.keys(tool.outputSchema!.properties!)) {
			if (["status", "message", "error", "output"].includes(field)) continue;
			assert.ok(seen.has(field), `${tool.name} advertises unreturned ${field}`);
		}
	}
});

for (const toolset of ["legacy", "compact"]) {
	test(`${toolset}: invalid request metadata does not negotiate a protocol`, async (t) => {
		for (const bad of [
			false,
			null,
			[],
			{ progressToken: false },
			{ progressToken: 0.5 },
			{ progressToken: null },
			{ progressToken: {} },
		]) {
			const { handler } = await fixture(t, toolset, null);
			const invalid = await rpc(handler, "initialize", {
				...initializeParams(),
				_meta: bad,
			});
			assert.equal(invalid.error?.code, -32602);
			const valid = await rpc(handler, "initialize", {
				...initializeParams("2024-11-05"),
				_meta: { progressToken: 0, custom: "allowed" },
			});
			assert.equal(valid.result.protocolVersion, "2024-11-05");
			assert.ok(
				(await rpc(handler, "tools/list")).result.tools.every(
					(tool) => !Object.hasOwn(tool, "outputSchema"),
				),
			);
		}
	});
	test(`${toolset}: explicit null arguments cannot compile or change artifacts`, async (t) => {
		const { handler, dir } = await fixture(t, toolset);
		const name = toolset === "compact" ? "configure_sprint" : "init";
		await call(handler, name, {
			...(toolset === "compact" ? { mode: "create" } : {}),
			question: "No null mutations",
			done: "Evidence preserved",
		});
		const file = path.join(dir, "compilation.json"),
			before = readArtifactSnapshot(file);
		const response = await rpc(handler, "tools/call", {
			name: toolset === "compact" ? "compile_sprint" : "compile",
			arguments: null,
		});
		assert.ok(response.error || response.result?.isError);
		assert.deepEqual(readArtifactSnapshot(file), before);
	});
	test(`${toolset}: existing sprint recovery is profile-neutral`, async (t) => {
		const { handler, dir } = await fixture(t, toolset);
		const name = toolset === "compact" ? "configure_sprint" : "init",
			args = {
				...(toolset === "compact" ? { mode: "create" } : {}),
				question: "Existing sprint",
				done: "Keep evidence",
			};
		await call(handler, name, args);
		const before = fs.readFileSync(path.join(dir, "claims.json"));
		const response = await rpc(handler, "tools/call", {
			name,
			arguments: args,
		});
		assert.equal(response.result.isError, true);
		const { message } = JSON.parse(response.result.content[0]!.text) as {
			message: string;
		};
		assert.match(message, /existing evidence was preserved/i);
		assert.doesNotMatch(message, /Continue with compile/);
		assert.deepEqual(fs.readFileSync(path.join(dir, "claims.json")), before);
	});
}
test("legacy init describes configured artifact paths as defaults", async (t) => {
	const { handler } = await fixture(t, "legacy");
	const tool = (await rpc(handler, "tools/list")).result.tools.find(
		(tool) => tool.name === "init",
	)!;
	assert.match(
		tool.description,
		/defaults: claims\.json and compilation\.json/,
	);
	assert.match(tool.description, /files_created/);
});

for (const toolset of ["legacy", "compact"]) {
	test(`${toolset}: invalid request IDs cannot commit negotiation`, async (t) => {
		for (const id of [false, true, {}, [], NaN, Infinity, 1.5]) {
			const { handler } = await fixture(t, toolset, null);
			const invalid = JSON.parse(
				(await handler("initialize", initializeParams(), id))!,
			) as { error: { code: number } };
			assert.equal(invalid.error.code, -32600);
			const valid = await rpc(
				handler,
				"initialize",
				initializeParams("2024-11-05"),
			);
			assert.equal(valid.result.protocolVersion, "2024-11-05");
			assert.ok(
				(await rpc(handler, "tools/list")).result.tools.every(
					(tool) => !Object.hasOwn(tool, "outputSchema"),
				),
			);
			const response = await rpc(handler, "tools/call", {
				name: toolset === "compact" ? "export_document" : "exports_formats",
				arguments: {},
			});
			assert.notEqual(response.result.isError, true);
			assert.ok(response.result.content.length > 0);
			assert.equal(Object.hasOwn(response.result, "structuredContent"), false);
		}
	});
	test(`${toolset}: malformed tool-call metadata cannot mutate compilation`, async (t) => {
		const { handler, dir } = await fixture(t, toolset);
		await call(handler, toolset === "compact" ? "configure_sprint" : "init", {
			...(toolset === "compact" ? { mode: "create" } : {}),
			question: "Keep metadata out",
			done: "No writes on malformed requests",
		});
		const file = path.join(dir, "compilation.json"),
			before = readArtifactSnapshot(file);
		for (const meta of [
			false,
			null,
			[],
			{ progressToken: false },
			{ progressToken: 0.5 },
			{ progressToken: {} },
		]) {
			const response = await rpc(handler, "tools/call", {
				name: toolset === "compact" ? "compile_sprint" : "compile",
				arguments: {},
				_meta: meta,
			});
			assert.equal(response.error?.code, -32602);
			assert.deepEqual(readArtifactSnapshot(file), before);
		}
	});
}
test("criteria discovery and dispatch reject blank and oversized reasons", async (t) => {
	const { handler } = await fixture(t);
	await call(handler, "configure_sprint", {
		mode: "create",
		question: "Criteria limits",
		done: "Keep this",
	});
	const schema = (await rpc(handler, "tools/list")).result.tools.find(
		(tool) => tool.name === "configure_sprint",
	)!.inputSchema;
	for (const args of [
		{ mode: "criteria", reason: "reviewed", done: "   " },
		{ mode: "criteria", reason: "  ", done: "new" },
		{ mode: "criteria", reason: "x".repeat(4097), done: "new" },
		{ mode: "criteria", reason: "🌾".repeat(4097), done: "new" },
		{ mode: "criteria", reason: "reviewed", question: "  " },
	]) {
		assert.equal(accepts(schema, args), false);
		const response = await rpc(handler, "tools/call", {
			name: "configure_sprint",
			arguments: args,
		});
		assert.equal(response.result.isError, true);
	}
	for (const args of [
		{ mode: "criteria", reason: "x".repeat(4096), done: "new" },
		{ mode: "criteria", reason: "🌾".repeat(4096), done: "new" },
	]) {
		assert.equal(accepts(schema, args), true);
		const response = await rpc(handler, "tools/call", {
			name: "configure_sprint",
			arguments: args,
		});
		assert.notEqual(response.result.isError, true);
	}
	const create = {
		mode: "create",
		question: "Empty done is allowed",
		done: "",
	};
	assert.equal(accepts(schema, create), true);
	const fresh = await fixture(t);
	const response = await rpc(fresh.handler, "tools/call", {
		name: "configure_sprint",
		arguments: create,
	});
	assert.notEqual(response.result.isError, true);
});

test("Docker discovery selects the supported compact profile while CLI compatibility stays legacy", async (t) => {
	const root = path.resolve(import.meta.dirname, "../..");
	const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
	const commandLine = dockerfile.match(/^CMD (\[[^\n]+\])$/m)?.[1];
	assert.ok(
		commandLine,
		"Docker must expose an explicit inspectable JSON command",
	);
	const parsed: unknown = JSON.parse(commandLine);
	assert.ok(
		Array.isArray(parsed) && parsed.every((value) => typeof value === "string"),
	);
	const command = parsed as string[];
	assert.deepEqual(command, ["mcp", "--dir", "/app", "--toolset", "compact"]);
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-docker-discovery-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const client = mcp(
		[
			process.execPath,
			path.join(root, "bin/grainulator.js"),
			...command.map((arg) => (arg === "/app" ? dir : arg)),
		],
		{ cwd: dir },
	);
	t.after(() => client.close());
	await client.request("initialize", {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "docker-command-contract", version: "1" },
	});
	const listed = (await client.request("tools/list")).tools;
	assert.deepEqual(
		listed.map((tool) => tool.name),
		COMPACT_TOOLS.map((tool) => tool.name),
	);
	assert.equal(listed.length, 15);
	const legacy = createHandler({ dir });
	const discovered = await rpc(legacy, "tools/list");
	assert.deepEqual(
		discovered.result.tools.map((tool) => tool.name),
		TOOLS.map((tool) => tool.name),
	);
	assert.equal(discovered.result.tools.length, 29);
	assert.deepEqual(
		fs.readdirSync(dir),
		[],
		"discovery must not create a sprint or memory",
	);
});
