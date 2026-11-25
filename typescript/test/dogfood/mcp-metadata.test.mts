import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isRecord } from "../../lib/contracts.js";
import { COMPACT_TOOLS, createHandler } from "../../lib/grainulator-mcp.js";
import { outputSchema, validateOutput } from "../../lib/mcp-contracts.js";

test("published compact examples execute a complete local evidence lifecycle and satisfy output contracts", async () => {
	const workspace = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-metadata-"),
	);
	const memory = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-metadata-memory-"),
	);
	try {
		fs.mkdirSync(path.join(workspace, "src"));
		fs.writeFileSync(
			path.join(workspace, "src/service.ts"),
			"const deadline = 30;\nexport { deadline };\n",
		);
		const handler = createHandler({
			dir: workspace,
			memoryDir: memory,
			toolset: "compact",
		});
		let id = 1;
		await handler(
			"initialize",
			{
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "metadata-test", version: "1" },
			},
			id++,
		);
		const used = new Set<string>();
		const call = async (name: string, args: Record<string, unknown>) => {
			const tool = COMPACT_TOOLS.find((candidate) => candidate.name === name);
			assert.ok(tool, name);
			const serialized = await handler(
				"tools/call",
				{ name, arguments: args },
				id++,
			);
			assert.equal(typeof serialized, "string");
			const response: unknown = JSON.parse(serialized!);
			assert.ok(
				isRecord(response) && isRecord(response.result),
				JSON.stringify(response),
			);
			assert.notEqual(
				response.result.isError,
				true,
				JSON.stringify(response.result),
			);
			const result = response.result.structuredContent;
			assert.ok(isRecord(result), name);
			validateOutput(result, tool.outputSchema);
			assert.notEqual(result.status, "error", JSON.stringify(result));
			return result;
		};
		const example = async (name: string) => {
			const tool = COMPACT_TOOLS.find((candidate) => candidate.name === name);
			assert.ok(tool?.inputSchema.examples?.[0], name);
			used.add(name);
			return call(name, tool.inputSchema.examples[0]);
		};
		await example("configure_sprint");
		await example("record_claim");
		await example("import_claims");
		await call("record_claim", {
			id: "r004",
			type: "factual",
			topic: "timeouts",
			content: "The incident report records a 30-second request deadline.",
		});
		await example("correct_claim");
		await call("record_claim", {
			id: "r003",
			type: "factual",
			topic: "timeouts",
			content: "The client request deadline is 60 seconds.",
			conflicts_with: ["r002"],
		});
		await example("resolve_conflict");
		await example("link_premises");
		const observation = await example("observe_source");
		assert.ok(isRecord(observation.observation));
		assert.equal(observation.observation.kind, "source");
		await example("update_finding");
		const claims = await example("search_claims");
		assert.ok(Array.isArray(claims.claims) && claims.claims.length > 0);
		await example("compile_sprint");
		await example("inspect_sprint");
		await example("store_memory");
		const hits = await example("search_memory");
		assert.ok(Array.isArray(hits.claims) && hits.claims.length > 0);
		await example("import_memory");
		await example("export_document");
		assert.equal(
			used.size,
			COMPACT_TOOLS.length,
			"every published example was invoked",
		);
		const catalogs = await call("search_memory", {});
		assert.ok(
			Array.isArray(catalogs.collections) && catalogs.collections.length > 0,
		);
		assert.ok(Array.isArray(catalogs.packs));
		const formats = await call("export_document", {});
		assert.ok(Array.isArray(formats.formats) && formats.formats.length > 0);
		const inline = await call("export_document", { format: "markdown" });
		assert.equal(typeof inline.output, "string");
		const saved = await call("export_document", {
			format: "markdown",
			output: "output/metadata-report.md",
		});
		assert.equal(typeof saved.outputPath, "string");
		assert.equal(
			fs.existsSync(path.join(workspace, "output/metadata-report.md")),
			true,
		);
		await call("configure_sprint", {
			mode: "criteria",
			done: "The deadline is observed and conflicting records are resolved.",
			reason: "Make completion observable.",
		});
	} finally {
		fs.rmSync(workspace, { recursive: true, force: true });
		fs.rmSync(memory, { recursive: true, force: true });
	}
});

test("published nested result contracts reject malformed successful payloads", () => {
	assert.throws(
		() => validateOutput({ claims: [{ id: 42 }] }, outputSchema("search")),
		/result\/claims\/0\/id/,
	);
	assert.throws(
		() =>
			validateOutput(
				{
					next_actions: {
						auto: [
							{
								command: 42,
								label: "Fixture",
								reason: "Fixture",
								claim_ids: [],
							},
						],
						manual: [],
					},
				},
				outputSchema("compile"),
			),
		/result\/next_actions\/auto\/0\/command/,
	);
	assert.throws(
		() =>
			validateOutput(
				{ premises: [{ claim_id: "r001", claim_sha256: 42 }] },
				outputSchema("premise_links"),
			),
		/result\/premises\/0\/claim_sha256/,
	);
	assert.throws(
		() =>
			validateOutput(
				{ collections: [{ claimCount: "many" }] },
				outputSchema("memory_list"),
			),
		/result\/collections\/0\/claimCount/,
	);
	assert.throws(
		() =>
			validateOutput(
				{ questions: [{ question: 42 }] },
				outputSchema("acceptance_check"),
			),
		/result\/questions\/0\/question/,
	);
	assert.throws(
		() =>
			validateOutput(
				{
					next_actions: {
						auto: [
							{ label: "Missing command", reason: "fixture", claim_ids: [] },
						],
						manual: [],
					},
				},
				outputSchema("compile"),
			),
		/missing command/,
	);
	validateOutput(
		{
			audit: {
				revision: 0,
				verdict: "unverified",
				resolution: "open",
				duplicate_of: null,
			},
		},
		outputSchema("finding_action"),
	);
	const preview = outputSchema("exports_preview").properties;
	assert.match(preview?.hasMore?.description ?? "", /content.*omitted/);
	assert.match(preview?.truncated?.description ?? "", /UTF-16/);
});
