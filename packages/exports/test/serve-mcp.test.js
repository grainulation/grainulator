// Generated from typescript/packages/exports/test/serve-mcp.test.ts; edit that source and run npm run build:types.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Integration test: mill MCP server — tool-call handlers
 *
 * Spawns `node bin/exports.js serve-mcp` as a child process over stdio,
 * performs JSON-RPC 2.0 initialize, and issues tools/call for each of
 * mill's MCP tools (exports_convert, exports_formats, exports_preview). Asserts
 * on response shape, content payload, and at least one error path per
 * tool. Zero dependencies — uses node:test + node:assert.
 *
 * Modeled on wheat/test/mcp.test.js.
 */
const importedModule1 = require("node:test");
const { describe, it, before, after } = importedModule1;
const assert = require("node:assert/strict");
const importedModule2 = require("node:child_process");
const { spawn } = importedModule2;
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const importedModule3 = require("node:url");
const { fileURLToPath } = importedModule3;
const MILL_BIN = path.resolve(__dirname, "../../..", "bin", "grainulator.js");
function sendJsonRpc(child, obj) {
	child.stdin.write(JSON.stringify(obj) + "\n");
}
function spawnAndInitialize(cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [MILL_BIN, "mcp"], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let resolved = false;
		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				child.kill();
				reject(new Error("Timed out waiting for initialize response"));
			}
		}, 5_000);
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
			const lines = stdout.split("\n").filter((l) => l.trim());
			if (lines.length > 0 && !resolved) {
				resolved = true;
				clearTimeout(timer);
				try {
					const response = JSON.parse(lines[0]);
					resolve({ response, child });
				} catch (caughterr) {
					const err =
						caughterr instanceof Error
							? caughterr
							: new Error(String(caughterr));
					child.kill();
					reject(new Error(`Failed to parse initialize: ${err.message}`));
				}
			}
		});
		child.on("error", (err) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timer);
				reject(err);
			}
		});
		sendJsonRpc(child, {
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "test", version: "0.0.0" },
			},
		});
	});
}
function waitForResponse(child, timeout = 5_000) {
	return new Promise((resolve, reject) => {
		let buf = "";
		const timer = setTimeout(
			() => reject(new Error("Timed out waiting for response")),
			timeout,
		);
		function onData(chunk) {
			buf += chunk.toString();
			// Only resolve on a COMPLETE newline-terminated line. Partial
			// buffer would JSON.parse-fail for any response > 1 stdout chunk.
			const newlineIdx = buf.indexOf("\n");
			if (newlineIdx === -1) return;
			const line = buf.slice(0, newlineIdx).trim();
			if (!line) {
				buf = buf.slice(newlineIdx + 1);
				return;
			}
			clearTimeout(timer);
			child.stdout.removeListener("data", onData);
			try {
				resolve(JSON.parse(line));
			} catch (caughterr) {
				const err =
					caughterr instanceof Error ? caughterr : new Error(String(caughterr));
				reject(new Error(`Parse error: ${err.message}\nRaw: ${line}`));
			}
		}
		child.stdout.on("data", onData);
	});
}
function cleanup(child) {
	try {
		child.kill();
	} catch {
		/* already dead */
	}
}
async function callTool(child, id, name, args) {
	const responsePromise = waitForResponse(child);
	sendJsonRpc(child, {
		jsonrpc: "2.0",
		id,
		method: "tools/call",
		params: { name, arguments: args },
	});
	const response = await responsePromise;
	assert.equal(response.jsonrpc, "2.0");
	assert.equal(response.id, id);
	assert.ok(response.result, "response should have result");
	assert.ok(
		Array.isArray(response.result.content),
		"result.content should be an array",
	);
	const textBlock = response.result.content[0];
	assert.equal(textBlock.type, "text");
	assert.ok(
		typeof textBlock.text === "string" && textBlock.text.length > 0,
		"content[0].text should be a non-empty string",
	);
	const payload = JSON.parse(textBlock.text);
	return { response, payload };
}
/** Create a workspace with a minimal claims.json that any format can consume. */
function makeWorkspace(prefix = "mill-mcp-test-") {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	const claims = {
		meta: {
			question: "MCP handler test sprint",
			audience: ["ci"],
			phase: "research",
		},
		claims: [
			{
				id: "r001",
				type: "factual",
				topic: "test-topic",
				content: "A sample claim for mill MCP tests.",
				evidence: "stated",
				status: "active",
				tags: ["fixture"],
			},
			{
				id: "r002",
				type: "recommendation",
				topic: "test-topic",
				content: "Another claim to exercise conversion.",
				evidence: "documented",
				status: "active",
				tags: ["fixture"],
			},
		],
	};
	fs.writeFileSync(
		path.join(dir, "claims.json"),
		JSON.stringify(claims, null, 2) + "\n",
	);
	// compilation.json is the preferred source — write a compiled shape too
	const compilation = {
		status: "clean",
		sprint_meta: claims.meta,
		resolved_claims: claims.claims,
		coverage: { "test-topic": { count: 2 } },
	};
	fs.writeFileSync(
		path.join(dir, "compilation.json"),
		JSON.stringify(compilation, null, 2) + "\n",
	);
	return dir;
}
describe("mill MCP server — protocol basics", () => {
	let dir;
	before(() => {
		dir = makeWorkspace();
	});
	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});
	it("responds to initialize with serverInfo", async () => {
		const { response, child } = await spawnAndInitialize(dir);
		try {
			assert.equal(response.jsonrpc, "2.0");
			assert.equal(response.id, 1);
			assert.equal(response.result.serverInfo.name, "grainulator");
			assert.ok(response.result.protocolVersion);
		} finally {
			cleanup(child);
		}
	});
	it("tools/list returns exports_convert, exports_formats, exports_preview", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const responsePromise = waitForResponse(child);
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			});
			const response = await responsePromise;
			const names = response.result.tools.map((t) => t.name);
			assert.ok(names.includes("exports_convert"));
			assert.ok(names.includes("exports_formats"));
			assert.ok(names.includes("exports_preview"));
		} finally {
			cleanup(child);
		}
	});
	it("no stdout pollution before first JSON-RPC response", async () => {
		const child = spawn(process.execPath, [MILL_BIN, "mcp"], {
			cwd: dir,
			stdio: ["pipe", "pipe", "pipe"],
		});
		try {
			let stdout = "";
			const firstChunk = new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("timeout")), 5_000);
				child.stdout.on("data", (chunk) => {
					stdout += chunk.toString();
					if (stdout.length > 0) {
						clearTimeout(timer);
						resolve();
					}
				});
			});
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "t", version: "0" },
				},
			});
			await firstChunk;
			const trimmed = stdout.trimStart();
			assert.ok(
				trimmed.startsWith("{"),
				`stdout should start with JSON object, got: ${trimmed.slice(0, 100)}`,
			);
		} finally {
			cleanup(child);
		}
	});
});
describe("mill MCP tool handlers", () => {
	let dir;
	before(() => {
		dir = makeWorkspace();
	});
	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});
	// ── exports_formats ─────────────────────────────────────────────────────────
	it("exports_formats — returns non-empty format catalog", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { payload } = await callTool(child, 10, "exports_formats", {});
			assert.equal(payload.status, "ok");
			assert.ok(Array.isArray(payload.formats));
			assert.ok(payload.formats.length > 0, "should have at least one format");
			assert.ok(
				payload.formats.every(
					(f) => typeof f.id === "string" && typeof f.mimeType === "string",
				),
				"every format should have id and mimeType",
			);
		} finally {
			cleanup(child);
		}
	});
	// ── exports_convert — happy path ────────────────────────────────────────────
	it("exports_convert — converts to a known format inline", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			// Pick a format that is guaranteed to exist; discover via formats first
			const { payload: formatsPayload } = await callTool(
				child,
				20,
				"exports_formats",
				{},
			);
			const candidate =
				formatsPayload.formats.find((f) => f.id === "markdown") ||
				formatsPayload.formats[0];
			assert.ok(candidate);
			const { payload } = await callTool(child, 21, "exports_convert", {
				format: candidate.id,
			});
			assert.equal(payload.status, "ok");
			assert.equal(payload.format, candidate.id);
			assert.ok(
				typeof payload.output === "string" && payload.output.length > 0,
				"inline output should be a non-empty string",
			);
			assert.ok(typeof payload.bytes === "number");
		} finally {
			cleanup(child);
		}
	});
	it("exports_convert — writes to file when output path given", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { payload: formatsPayload } = await callTool(
				child,
				22,
				"exports_formats",
				{},
			);
			const candidate =
				formatsPayload.formats.find((f) => f.id === "markdown") ||
				formatsPayload.formats[0];
			assert.ok(candidate);
			const outRel = "artifacts/out.txt";
			const { payload } = await callTool(child, 23, "exports_convert", {
				format: candidate.id,
				output: outRel,
			});
			assert.equal(payload.status, "ok");
			const outAbs = path.join(dir, outRel);
			assert.ok(fs.existsSync(outAbs), "output file should exist");
			assert.ok(fs.statSync(outAbs).size > 0, "output should be non-empty");
		} finally {
			cleanup(child);
		}
	});
	// ── exports_convert — error paths ───────────────────────────────────────────
	it("exports_convert — errors when format missing", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { response, payload } = await callTool(
				child,
				30,
				"exports_convert",
				{},
			);
			assert.equal(payload.status, "error");
			assert.ok(/format/i.test(payload.message || ""));
			assert.ok(response.result.isError);
		} finally {
			cleanup(child);
		}
	});
	it("exports_convert — errors on unknown format", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { payload } = await callTool(child, 31, "exports_convert", {
				format: "definitely-not-a-real-format-xyz",
			});
			assert.equal(payload.status, "error");
			assert.ok(/unknown format/i.test(payload.message || ""));
		} finally {
			cleanup(child);
		}
	});
	it("exports_convert — rejects path traversal in source", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { payload } = await callTool(child, 32, "exports_convert", {
				format: "markdown",
				source: "../../../etc/passwd",
			});
			assert.equal(payload.status, "error");
			assert.ok(
				/outside workspace|escapes workspace/i.test(payload.message || ""),
			);
		} finally {
			cleanup(child);
		}
	});
	// ── exports_preview ─────────────────────────────────────────────────────────
	it("exports_preview — returns first N lines without writing", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { payload: formatsPayload } = await callTool(
				child,
				40,
				"exports_formats",
				{},
			);
			const candidate =
				formatsPayload.formats.find((f) => f.id === "markdown") ||
				formatsPayload.formats[0];
			assert.ok(candidate);
			const { payload } = await callTool(child, 41, "exports_preview", {
				format: candidate.id,
				lines: 5,
			});
			assert.equal(payload.status, "ok");
			assert.ok(typeof payload.preview === "string");
			assert.ok(payload.showing <= 5);
			assert.ok(typeof payload.totalLines === "number");
		} finally {
			cleanup(child);
		}
	});
	it("exports_preview — errors when format missing", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { payload } = await callTool(child, 42, "exports_preview", {});
			assert.equal(payload.status, "error");
			assert.ok(/format/i.test(payload.message || ""));
		} finally {
			cleanup(child);
		}
	});
	it("unknown tool — returns JSON-RPC method-not-found error", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const responsePromise = waitForResponse(child);
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 50,
				method: "tools/call",
				params: { name: "mill/does-not-exist", arguments: {} },
			});
			const response = await responsePromise;
			assert.ok(response.error, "should return JSON-RPC error");
			assert.equal(response.error.code, -32602);
		} finally {
			cleanup(child);
		}
	});
});
describe("export source integrity", () => {
	let dir;
	before(() => {
		dir = makeWorkspace("grainulator-export-integrity-");
	});
	after(() => fs.rmSync(dir, { recursive: true, force: true }));
	it("does not replace an explicitly missing source with another ledger", async () => {
		const { child } = await spawnAndInitialize(dir);
		try {
			const { response, payload } = await callTool(
				child,
				201,
				"exports_convert",
				{ format: "markdown", source: "missing.json" },
			);
			assert.equal(response.result.isError, true);
			assert.equal(payload.status, "error");
			assert.match(payload.message || "", /No source file/);
		} finally {
			cleanup(child);
		}
	});
	it("rejects content-less compilation without reading a sibling symlink", async () => {
		const nested = path.join(dir, "nested");
		fs.mkdirSync(nested);
		fs.writeFileSync(
			path.join(nested, "compilation.json"),
			JSON.stringify({ resolved_claims: [{ id: "r001", type: "factual" }] }),
		);
		fs.symlinkSync(
			path.join(dir, "claims.json"),
			path.join(nested, "claims.json"),
		);
		const { child } = await spawnAndInitialize(nested);
		try {
			const { response, payload } = await callTool(
				child,
				201,
				"exports_convert",
				{ format: "markdown", output: "report.md" },
			);
			assert.equal(response.result.isError, true);
			assert.match(
				payload.message || "",
				/grainulator compile --dir|outside workspace/i,
			);
			assert.ok(!fs.existsSync(path.join(nested, "report.md")));
		} finally {
			cleanup(child);
		}
	});
	it("rejects a symlink fallback outside the MCP workspace", async () => {
		const nested = path.join(dir, "fallback");
		fs.mkdirSync(nested);
		fs.symlinkSync(
			path.join(dir, "claims.json"),
			path.join(nested, "claims.json"),
		);
		const { child } = await spawnAndInitialize(nested);
		try {
			const { response, payload } = await callTool(
				child,
				201,
				"exports_convert",
				{ format: "markdown" },
			);
			assert.equal(response.result.isError, true);
			assert.equal(payload.status, "error");
			assert.ok(!payload.output);
		} finally {
			cleanup(child);
		}
	});
});
describe("export premortem regressions", () => {
	it("selects configured compilation and claims paths instead of default decoys", async () => {
		const dir = makeWorkspace("grainulator-export-configured-");
		fs.mkdirSync(path.join(dir, "data"));
		fs.writeFileSync(
			path.join(dir, "grainulator.config.json"),
			JSON.stringify({
				schema_version: 1,
				evidence: {
					compiler: {
						claims: "data/ledger.json",
						compilation: "data/compiled.json",
					},
				},
			}),
		);
		fs.writeFileSync(
			path.join(dir, "data/ledger.json"),
			JSON.stringify({
				claims: [
					{
						id: "configured",
						type: "factual",
						content: "Configured ledger content",
					},
				],
			}),
		);
		const { child } = await spawnAndInitialize(dir);
		try {
			const fallback = await callTool(child, 601, "exports_convert", {
				format: "markdown",
			});
			assert.equal(
				fallback.payload.status,
				"ok",
				fallback.payload.message || "",
			);
			assert.match(fallback.payload.output, /Configured ledger content/);
			assert.doesNotMatch(fallback.payload.output, /A sample claim/);
			fs.writeFileSync(
				path.join(dir, "data/compiled.json"),
				JSON.stringify({
					resolved_claims: [
						{
							id: "compiled",
							type: "factual",
							content: "Configured compilation content",
						},
					],
				}),
			);
			const preferred = await callTool(child, 602, "exports_convert", {
				format: "markdown",
			});
			assert.equal(
				preferred.payload.status,
				"ok",
				preferred.payload.message || "",
			);
			assert.match(preferred.payload.output, /Configured compilation content/);
			assert.doesNotMatch(
				preferred.payload.output,
				/Configured ledger content/,
			);
		} finally {
			cleanup(child);
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
	it("returns structured tool errors for unwritable output destinations", async () => {
		const dir = makeWorkspace("grainulator-export-io-");
		fs.writeFileSync(path.join(dir, "blocker"), "keep me");
		const { child } = await spawnAndInitialize(dir);
		try {
			const failed = await callTool(child, 605, "exports_convert", {
				format: "markdown",
				output: "blocker/report.md",
			});
			assert.equal(failed.response.result.isError, true);
			assert.equal(failed.payload.status, "error");
			assert.match(failed.payload.message || "", /Cannot write export|ENOTDIR/);
			fs.mkdirSync(path.join(dir, "occupied-directory"));
			const server = (await import("../lib/serve-mcp.js")).default;
			const direct = JSON.parse(
				await server.handleRequest(
					dir,
					"tools/call",
					{
						name: "exports_convert",
						arguments: { format: "markdown", output: "occupied-directory" },
					},
					606,
				),
			);
			assert.equal(direct.result.isError, true);
			assert.match(
				JSON.parse(direct.result.content[0].text).message,
				/Cannot write export/,
			);
			assert.equal(
				fs.readFileSync(path.join(dir, "blocker"), "utf8"),
				"keep me",
			);
		} finally {
			cleanup(child);
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
	it("preview reports full line counts and character truncation without writing", async () => {
		const dir = makeWorkspace("grainulator-export-preview-");
		const data = {
			claims: Array.from({ length: 600 }, (_, index) => ({
				id: `r${index}`,
				type: "factual",
				content: "x".repeat(100),
				status: "active",
			})),
		};
		fs.writeFileSync(path.join(dir, "many.json"), JSON.stringify(data));
		fs.writeFileSync(
			path.join(dir, "long.json"),
			JSON.stringify({
				claims: [{ id: "long", content: "漢字".repeat(10000) }],
			}),
		);
		const ndjson = await import("../lib/formats/ndjson.mjs");
		const { child } = await spawnAndInitialize(dir);
		try {
			const many = await callTool(child, 603, "exports_preview", {
				format: "ndjson",
				source: "many.json",
				lines: 200,
			});
			assert.equal(many.payload.status, "ok", many.payload.message || "");
			assert.equal(
				many.payload.totalLines,
				ndjson.convert(data).split("\n").length,
			);
			assert.equal(many.payload.hasMore, true);
			assert.equal(many.payload.truncated, true);
			assert.ok(many.payload.preview.length <= 10000);
			const long = await callTool(child, 604, "exports_preview", {
				format: "ndjson",
				source: "long.json",
				lines: 200,
			});
			assert.equal(
				long.payload.hasMore,
				true,
				"A single shortened source line must not look complete",
			);
			assert.equal(long.payload.truncated, true);
			assert.deepEqual(fs.readdirSync(dir).sort(), [
				"claims.json",
				"compilation.json",
				"long.json",
				"many.json",
			]);
		} finally {
			cleanup(child);
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
