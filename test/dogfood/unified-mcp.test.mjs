import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHandler, RESOURCES, TOOLS } from "../../lib/grainulator-mcp.js";
import sharedPathsCjs from "../../packages/shared/lib/paths.cjs";
import * as sharedPaths from "../../packages/shared/lib/paths.js";
import { command, mcp, toolJSON } from "../../scripts/lib/local-checks.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-unified-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const workspace = path.join(dir, "workspace");
	fs.mkdirSync(workspace);
	const memoryDir = path.join(dir, "memory");
	return { dir, workspace, memoryDir };
}
function seed(workspace) {
	fs.writeFileSync(
		path.join(workspace, "claims.json"),
		JSON.stringify({
			schema_version: "1.0",
			meta: { question: "Does this portable interface work?" },
			claims: [],
		}),
	);
}
const claim = {
	id: "r001",
	type: "factual",
	topic: "integration",
	content:
		"Wheat, Silo, and Mill are literal user content; preserve these words.",
	evidence: "tested",
};
function rpc(handler, method, params = {}) {
	return handler(method, params, 1).then(JSON.parse);
}

test("one server exposes canonical metadata with no startup filesystem writes", async (t) => {
	const { workspace, memoryDir } = fixture(t);
	const handle = createHandler({ dir: workspace, memoryDir });
	assert.equal(
		(await rpc(handle, "initialize")).result.serverInfo.name,
		"grainulator",
	);
	assert.equal((await rpc(handle, "tools/list")).result.tools.length, 19);
	assert.ok(TOOLS.every((tool) => /^[a-z][a-z_]+$/.test(tool.name)));
	assert.doesNotMatch(JSON.stringify(TOOLS), /\bwheat\b|\bsilo\b|\bmill\b/i);
	assert.ok(
		RESOURCES.every((resource) => resource.uri.startsWith("grainulator://")),
	);
	assert.deepEqual(fs.readdirSync(workspace), []);
	assert.equal(fs.existsSync(memoryDir), false);
	assert.equal(
		await handle("tools/call", {
			name: "init",
			arguments: { question: "Notification must never execute a mutation" },
		}),
		null,
	);
	assert.deepEqual(fs.readdirSync(workspace), []);
});

test("stdio performs evidence, reusable memory, exports, resources and hidden aliases end to end", async (t) => {
	const { workspace, memoryDir } = fixture(t);
	seed(workspace);
	const client = mcp(
		[
			process.execPath,
			path.join(root, "bin/grainulator.js"),
			"mcp",
			"--dir",
			workspace,
			"--memory-dir",
			memoryDir,
		],
		{ cwd: workspace },
	);
	t.after(() => client.close());
	assert.equal(
		(await client.request("initialize")).serverInfo.name,
		"grainulator",
	);
	client.notify("notifications/initialized");
	const names = (await client.request("tools/list")).tools.map(
		(tool) => tool.name,
	);
	assert.ok(
		names.includes("add_claim") &&
			names.includes("memory_search") &&
			names.includes("exports_convert"),
	);
	assert.ok(names.every((name) => !name.includes("/")));
	const call = async (name, args = {}) =>
		toolJSON(await client.request("tools/call", { name, arguments: args }));
	assert.equal((await call("add_claim", claim)).status, "ok");
	const compilation = await call("compile");
	assert.ok(Array.isArray(compilation.next_actions.auto));
	assert.ok(Array.isArray(compilation.next_actions.manual));
	assert.equal(
		(await call("search", { query: "literal" })).claims[0].content,
		claim.content,
	);
	assert.equal(
		(await call("wheat/search", { query: "literal" })).claims[0].content,
		claim.content,
	);
	assert.equal(
		(await call("memory_store", { name: "Integration" })).claimCount,
		1,
	);
	assert.equal(
		(await call("memory_search", { query: "literal" })).claims[0].content,
		claim.content,
	);
	assert.equal((await call("silo/list")).count, 1);
	await call("init", {
		dir: "second",
		question: "Can another sprint reuse the finding?",
	});
	assert.equal(
		(await call("memory_pull", { dir: "second", pack: "Integration" }))
			.imported,
		1,
	);
	assert.equal(
		(await call("search", { dir: "second", query: "literal" })).claims[0]
			.content,
		claim.content,
	);
	assert.equal((await call("search", { query: "literal" })).claims.length, 1);
	assert.ok((await call("exports_formats")).count > 0);
	assert.equal(
		(await call("mill/formats")).count,
		(await call("exports_formats")).count,
	);
	assert.match(
		(await call("exports_convert", { format: "markdown" })).output,
		/Wheat, Silo, and Mill/,
	);
	assert.equal(
		(await client.request("resources/read", { uri: "grainulator://claims" }))
			.contents[0].uri,
		"grainulator://claims",
	);
	assert.equal(
		(await client.request("resources/read", { uri: "wheat://claims" }))
			.contents[0].uri,
		"wheat://claims",
	);
	assert.equal(
		JSON.parse(
			(
				await client.request("resources/read", {
					uri: "grainulator://memory/index",
				})
			).contents[0].text,
		).length,
		1,
	);
	assert.ok(
		JSON.parse(
			(
				await client.request("resources/read", {
					uri: "grainulator://exports/formats",
				})
			).contents[0].text,
		).length > 0,
	);
});

test("all components reject outside paths, including new children beneath symlinks", async (t) => {
	const { dir, workspace, memoryDir } = fixture(t);
	seed(workspace);
	const outside = path.join(dir, "outside");
	fs.mkdirSync(outside);
	fs.symlinkSync(outside, path.join(workspace, "escape"), "dir");
	const handle = createHandler({ dir: workspace, memoryDir });
	for (const [name, args] of [
		["add_claim", { ...claim, dir: outside }],
		[
			"init",
			{
				question: "Must not create an outside sprint",
				dir: "escape/new-sprint",
			},
		],
		[
			"exports_convert",
			{ format: "markdown", output: "escape/new-dir/report.md" },
		],
		["memory_store", { name: "Outside", from: "../outside/claims.json" }],
		["memory_pull", { pack: "security", into: "escape/claims.json" }],
	]) {
		const response = await rpc(handle, "tools/call", { name, arguments: args });
		assert.equal(response.result.isError, true, name);
		assert.match(response.result.content[0].text, /outside workspace/);
	}
	assert.deepEqual(fs.readdirSync(outside), []);
	assert.match(
		(
			await rpc(handle, "tools/call", {
				name: "memory_pull",
				arguments: { pack: "../../outside" },
			})
		).result.content[0].text,
		/not a file path/,
	);
	fs.unlinkSync(path.join(workspace, "claims.json"));
	fs.symlinkSync(
		path.join(outside, "claims.json"),
		path.join(workspace, "claims.json"),
	);
	assert.equal(
		(await rpc(handle, "resources/read", { uri: "grainulator://claims" })).error
			.code,
		-32602,
	);
});

test("separate in-process handlers do not share configured memory", async (t) => {
	const { workspace, memoryDir } = fixture(t);
	seed(workspace);
	const first = createHandler({ dir: workspace, memoryDir });
	const second = createHandler({
		dir: workspace,
		memoryDir: `${memoryDir}-second`,
	});
	const call = async (handle, name, args = {}) =>
		toolJSON(
			(await rpc(handle, "tools/call", { name, arguments: args })).result,
		);
	await call(first, "add_claim", claim);
	await call(first, "memory_store", { name: "Private collection" });
	assert.equal((await call(first, "memory_list")).count, 1);
	assert.equal((await call(second, "memory_list")).count, 0);
});

test("connect prints only the unified local server without changing host settings", (t) => {
	const { workspace } = fixture(t);
	const config = JSON.parse(
		command(
			[
				process.execPath,
				path.join(root, "bin/grainulator.js"),
				"connect",
				"--dir",
				workspace,
			],
			{ cwd: workspace },
		),
	);
	assert.deepEqual(Object.keys(config.mcpServers), ["grainulator"]);
	assert.equal(config.mcpServers.grainulator.args.at(-1), workspace);
	assert.deepEqual(fs.readdirSync(workspace), []);
});

test("canonical CLI and MCP init create data only, preserve settings, and require force for replacement", async (t) => {
	const { workspace, memoryDir } = fixture(t);
	const settings = {
		".mcp.json": '{"mcpServers":{"personal":{"command":"existing"}}}',
		"AGENTS.md": "My instructions",
		"CLAUDE.md": "My host instructions",
	};
	for (const [name, value] of Object.entries(settings))
		fs.writeFileSync(path.join(workspace, name), value);
	const handle = createHandler({ dir: workspace, memoryDir });
	const initial = toolJSON(
		(
			await rpc(handle, "tools/call", {
				name: "init",
				arguments: {
					question: "New sprint",
					constraints: "Local only; Preserve stars",
					done: "Working local build",
				},
			})
		).result,
	);
	assert.equal(initial.claims_seeded, 3);
	assert.deepEqual(initial.files_created, ["claims.json", "compilation.json"]);
	const original = fs.readFileSync(path.join(workspace, "claims.json"), "utf8");
	assert.equal(
		(
			await rpc(handle, "tools/call", {
				name: "init",
				arguments: { question: "Overwrite forbidden" },
			})
		).result.isError,
		true,
	);
	assert.equal(
		fs.readFileSync(path.join(workspace, "claims.json"), "utf8"),
		original,
	);
	const replacement = JSON.parse(
		command(
			[
				process.execPath,
				path.join(root, "bin/grainulator.js"),
				"init",
				"--dir",
				workspace,
				"--question",
				"Replacement",
				"--force",
				"--json",
			],
			{ cwd: workspace },
		),
	);
	assert.equal(replacement.status, "ok");
	assert.equal(fs.readFileSync(replacement.backup, "utf8"), original);
	for (const [name, value] of Object.entries(settings))
		assert.equal(fs.readFileSync(path.join(workspace, name), "utf8"), value);
	assert.equal(fs.existsSync(path.join(workspace, ".claude")), false);
	const child = toolJSON(
		(
			await rpc(handle, "tools/call", {
				name: "init",
				arguments: { question: "Child sprint", dir: "nested/sprint" },
			})
		).result,
	);
	assert.equal(child.directory, path.join(workspace, "nested/sprint"));
	assert.deepEqual(fs.readdirSync(child.directory).sort(), [
		"claims.json",
		"compilation.json",
	]);
});

test("provenance survives add/search/compile and independent sources clear single-origin warning", async (t) => {
	const { workspace, memoryDir } = fixture(t);
	seed(workspace);
	const handle = createHandler({ dir: workspace, memoryDir });
	const call = async (name, args = {}) =>
		toolJSON(
			(await rpc(handle, "tools/call", { name, arguments: args })).result,
		);
	for (const [id, origin] of [
		["r001", "Official docs"],
		["r002", "Independent test"],
		["r003", "Maintainer"],
	])
		await call("add_claim", {
			...claim,
			id,
			source: { origin, artifact: `evidence/${id}.md`, connector: null },
			tags: ["reviewed"],
		});
	await call("add_claim", {
		...claim,
		id: "r004",
		source: {
			origin: "Independent witness",
			artifact: "https://example.com/source",
			witnessed_claim: "r001",
			relationship: "full_support",
		},
		conflicts_with: ["r002"],
	});
	const found = await call("search", { query: "literal" });
	assert.equal(found.claims[0].source.origin, "Official docs");
	const result = await call("compile");
	assert.ok(
		!result.warnings.some((warning) => warning.code === "W_ECHO_CHAMBER"),
	);
	await call("resolve", {
		winner: "r004",
		loser: "r002",
		reason: "Independent witness supports the correction.",
	});
	const before = fs.readFileSync(path.join(workspace, "claims.json"), "utf8");
	for (const invalid of [
		{ tags: "invalid" },
		{ tags: [1] },
		{ source: { origin: "" } },
		{ source: { origin: "test", artifact: [] } },
		{ conflicts_with: "r001" },
		{ source: { origin: "test", relationship: "invented" } },
	]) {
		assert.equal(
			(
				await rpc(handle, "tools/call", {
					name: "add_claim",
					arguments: { ...claim, id: "bad", ...invalid },
				})
			).result.isError,
			true,
		);
		assert.equal(
			fs.readFileSync(path.join(workspace, "claims.json"), "utf8"),
			before,
		);
	}
	const fromCLI = JSON.parse(
		command([
			process.execPath,
			path.join(root, "bin/grainulator.js"),
			"add",
			"--dir",
			workspace,
			"--id",
			"r005",
			"--type",
			"factual",
			"--topic",
			"cli",
			"--content",
			"Source via CLI",
			"--source-origin",
			"Test suite",
			"--source-artifact",
			"test/results.json",
			"--json",
		]),
	);
	assert.equal(fromCLI.claim.source.origin, "Test suite");
	assert.equal(fromCLI.claim.source.artifact, "test/results.json");
});

test("exports preserve ledgers, host settings, sources, and symlink aliases", async (t) => {
	const { workspace, memoryDir } = fixture(t);
	seed(workspace);
	const handle = createHandler({ dir: workspace, memoryDir });
	toolJSON(
		(await rpc(handle, "tools/call", { name: "add_claim", arguments: claim }))
			.result,
	);
	toolJSON((await rpc(handle, "tools/call", { name: "compile" })).result);
	for (const name of ["AGENTS.md", "CLAUDE.md", ".mcp.json"])
		fs.writeFileSync(path.join(workspace, name), "Original settings");
	const original = Object.fromEntries(
		[
			"claims.json",
			"compilation.json",
			"AGENTS.md",
			"CLAUDE.md",
			".mcp.json",
		].map((name) => [
			name,
			fs.readFileSync(path.join(workspace, name), "utf8"),
		]),
	);
	fs.symlinkSync(
		path.join(workspace, "claims.json"),
		path.join(workspace, "renamed-export.md"),
	);
	for (const output of [
		...Object.keys(original),
		"renamed-export.md",
		".claude/settings.json",
	]) {
		const response = await rpc(handle, "tools/call", {
			name: "exports_convert",
			arguments: { format: "markdown", output },
		});
		assert.equal(response.result.isError, true, output);
		assert.match(response.result.content[0].text, /Protected output/);
	}
	fs.writeFileSync(
		path.join(workspace, "source.json"),
		original["claims.json"],
	);
	assert.equal(
		(
			await rpc(handle, "tools/call", {
				name: "mill/convert",
				arguments: {
					format: "markdown",
					source: "source.json",
					output: "source.json",
				},
			})
		).result.isError,
		true,
	);
	assert.throws(() =>
		command([
			process.execPath,
			path.join(root, "bin/grainulator.js"),
			"export",
			"export",
			"--format",
			"csv",
			path.join(workspace, "claims.json"),
			"-o",
			path.join(workspace, "claims.json"),
		]),
	);
	for (const [name, value] of Object.entries(original))
		assert.equal(fs.readFileSync(path.join(workspace, name), "utf8"), value);
	assert.equal(
		toolJSON(
			(
				await rpc(handle, "tools/call", {
					name: "exports_convert",
					arguments: { format: "markdown", output: "output/report.md" },
				})
			).result,
		).status,
		"ok",
	);
});

test("memory collection identity and integrity cannot be overridden by sprint metadata", async (t) => {
	const { workspace, memoryDir } = fixture(t);
	seed(workspace);
	const data = JSON.parse(fs.readFileSync(path.join(workspace, "claims.json")));
	data.meta = {
		...data.meta,
		id: "external-id",
		name: "External name",
		hash: "incorrect",
		claimCount: 999,
	};
	data.claims = [claim];
	fs.writeFileSync(path.join(workspace, "claims.json"), JSON.stringify(data));
	const handle = createHandler({ dir: workspace, memoryDir });
	const call = async (name, args = {}) =>
		toolJSON(
			(await rpc(handle, "tools/call", { name, arguments: args })).result,
		);
	const saved = await call("memory_store", { name: "Saved Sprint" });
	assert.equal(saved.id, "saved-sprint");
	assert.equal(saved.claimCount, 1);
	assert.notEqual(saved.hash, "incorrect");
	await call("init", {
		dir: "restored",
		question: "Can we restore by returned ID?",
	});
	assert.equal(
		(await call("memory_pull", { dir: "restored", pack: saved.id })).imported,
		1,
	);
	const stored = JSON.parse(
		fs.readFileSync(path.join(memoryDir, "claims", `${saved.id}.json`)),
	);
	assert.equal(stored.meta.sourceMeta.id, "external-id");
	assert.equal(stored.meta.sourceMeta.hash, "incorrect");
});

test("both shared path helpers handle missing descendants and dangling symlinks", (t) => {
	const { dir, workspace } = fixture(t);
	const outside = path.join(dir, "outside");
	fs.mkdirSync(outside);
	fs.symlinkSync(outside, path.join(workspace, "escape"));
	fs.symlinkSync(
		path.join(outside, "missing.json"),
		path.join(workspace, "dangling.json"),
	);
	for (const helper of [sharedPaths, sharedPathsCjs]) {
		assert.equal(
			helper.isInsideDir(path.join(workspace, "new", "report.md"), workspace),
			true,
		);
		assert.equal(
			helper.isInsideDir(
				path.join(workspace, "escape", "new", "report.md"),
				workspace,
			),
			false,
		);
		assert.equal(
			helper.isInsideDir(path.join(workspace, "dangling.json"), workspace),
			false,
		);
	}
});

test("CLI CSV exports preserve canonical claim content and evidence", (t) => {
	const { workspace } = fixture(t);
	fs.writeFileSync(
		path.join(workspace, "claims.json"),
		JSON.stringify({
			claims: [
				{
					...claim,
					source: { origin: "Test suite", artifact: "evidence/result.json" },
					timestamp: "2026-09-07T00:00:00Z",
				},
			],
		}),
	);
	const output = path.join(workspace, "report.csv");
	command([
		process.execPath,
		path.join(root, "bin/grainulator.js"),
		"export",
		"export",
		"--format",
		"csv",
		path.join(workspace, "claims.json"),
		"-o",
		output,
	]);
	const csv = fs.readFileSync(output, "utf8");
	assert.match(csv, /Wheat, Silo, and Mill/);
	assert.match(csv, /,tested,/);
	assert.match(csv, /evidence\/result.json/);
	assert.match(csv, /2026-09-07T00:00:00Z/);
	assert.doesNotMatch(csv, /\[object Object\]/);
});

test("canonical evidence prefix rejects unknown words without writes and uses minimal init", (t) => {
	const { workspace } = fixture(t);
	for (const args of [
		["evidence", "nonexistent"],
		["evidence", "connect", "farmer"],
		["evidence", "memory", "list"],
	]) {
		assert.throws(() =>
			command(
				[process.execPath, path.join(root, "bin/grainulator.js"), ...args],
				{ cwd: workspace },
			),
		);
		assert.deepEqual(fs.readdirSync(workspace), []);
	}
	const result = JSON.parse(
		command(
			[
				process.execPath,
				path.join(root, "bin/grainulator.js"),
				"evidence",
				"init",
				"--question",
				"Explicit canonical sprint",
				"--json",
			],
			{ cwd: workspace },
		),
	);
	assert.equal(result.status, "ok");
	assert.deepEqual(fs.readdirSync(workspace).sort(), [
		"claims.json",
		"compilation.json",
	]);
});
