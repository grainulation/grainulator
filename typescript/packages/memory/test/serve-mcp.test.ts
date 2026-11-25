/**
 * Integration test: silo MCP server — tool-call handlers
 *
 * Spawns `node bin/memory.js serve-mcp` as a child process over stdio,
 * performs JSON-RPC 2.0 initialize, and issues tools/call for each of
 * silo's MCP tools. Asserts on response shape, content payload, and at
 * least one error path per tool.
 *
 * Isolation: every spawn sets HOME to a per-test temp directory so that
 * silo's Store (rooted at os.homedir()/.silo) does not touch the user's
 * real ~/.silo data. External-service tools (confluence, smart-fetch)
 * are covered only on error/unset paths — no network I/O.
 *
 * Modeled on wheat/test/mcp.test.js. Zero dependencies.
 */

import assert from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SILO_BIN = path.resolve(__dirname, "../../..", "bin", "grainulator.js");

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number;
	method: "initialize" | "tools/list" | "tools/call";
	params: Record<string, unknown>;
}

interface InitializeResult {
	serverInfo: { name: string };
	protocolVersion: string;
}

interface ToolResult {
	content: { type: string; text: string }[];
	isError?: boolean;
}

interface JsonRpcResponse<Result> {
	jsonrpc: string;
	id: number;
	result?: Result;
	error?: { code: number };
}

interface ToolPayload {
	status: "ok" | "error";
	message?: string;
	collections?: unknown[];
	packs?: unknown[];
	claims?: unknown[];
	count?: number;
	id?: string;
	claimCount?: number;
}

function sendJsonRpc(
	child: ChildProcessWithoutNullStreams,
	obj: JsonRpcRequest,
) {
	child.stdin.write(JSON.stringify(obj) + "\n");
}

/**
 * Build a child-process env that:
 *   - redirects $HOME to `fakeHome` so silo's Store roots at <fakeHome>/.silo
 *   - clears Confluence env vars so toolConfluence reports unconfigured
 */
function buildEnv(fakeHome: string) {
	const env: NodeJS.ProcessEnv = { ...process.env, HOME: fakeHome };
	delete env.CONFLUENCE_BASE_URL;
	delete env.CONFLUENCE_TOKEN;
	delete env.CONFLUENCE_EMAIL;
	delete env.CONFLUENCE_SPACE_KEY;
	return env;
}

function spawnAndInitialize(cwd: string, fakeHome: string) {
	return new Promise<{
		response: JsonRpcResponse<InitializeResult>;
		child: ChildProcessWithoutNullStreams;
	}>((resolve, reject) => {
		const child = spawn(process.execPath, [SILO_BIN, "mcp"], {
			cwd,
			env: buildEnv(fakeHome),
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

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
			const [line] = stdout.split("\n").filter((l) => l.trim());
			if (line !== undefined && !resolved) {
				resolved = true;
				clearTimeout(timer);
				try {
					const response = JSON.parse(
						line,
					) as JsonRpcResponse<InitializeResult>;
					resolve({ response, child });
				} catch (err) {
					child.kill();
					reject(
						new Error(
							`Failed to parse initialize: ${(err as SyntaxError).message}`,
						),
					);
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

function waitForResponse<Result = unknown>(
	child: ChildProcessWithoutNullStreams,
	timeout = 10_000,
) {
	return new Promise<JsonRpcResponse<Result>>((resolve, reject) => {
		let buf = "";
		const timer = setTimeout(
			() => reject(new Error("Timed out waiting for response")),
			timeout,
		);

		function onData(chunk: Buffer) {
			buf += chunk.toString();
			// Only resolve when we have a COMPLETE newline-terminated line.
			// Large responses (e.g. memory_packs with many packs) span multiple
			// stdout chunks; early resolution on a partial buffer yields a
			// truncated string that JSON.parse rejects.
			const newlineIdx = buf.indexOf("\n");
			if (newlineIdx === -1) return;
			const line = buf.slice(0, newlineIdx).trim();
			if (!line) {
				// Strip leading blank line(s) and keep accumulating.
				buf = buf.slice(newlineIdx + 1);
				return;
			}
			clearTimeout(timer);
			child.stdout.removeListener("data", onData);
			try {
				resolve(JSON.parse(line) as JsonRpcResponse<Result>);
			} catch (err) {
				reject(
					new Error(
						`Parse error: ${(err as SyntaxError).message}\nRaw: ${line}`,
					),
				);
			}
		}

		child.stdout.on("data", onData);
	});
}

function cleanup(child: ChildProcessWithoutNullStreams) {
	try {
		child.kill();
	} catch {
		/* already dead */
	}
}

async function callTool(
	child: ChildProcessWithoutNullStreams,
	id: number,
	name: string,
	args: Record<string, unknown>,
) {
	const responsePromise = waitForResponse<ToolResult>(child);
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
	assert.ok(textBlock);
	assert.equal(textBlock.type, "text");
	assert.ok(
		typeof textBlock.text === "string" && textBlock.text.length > 0,
		"content[0].text should be a non-empty string",
	);
	const payload = JSON.parse(textBlock.text) as ToolPayload;
	return { response: { ...response, result: response.result }, payload };
}

function makeWorkspace(prefix: string) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	// Fake HOME for silo store isolation
	const fakeHome = path.join(root, "home");
	fs.mkdirSync(fakeHome, { recursive: true });
	// Workspace with a claims.json for store/pull tests
	const workspace = path.join(root, "workspace");
	fs.mkdirSync(workspace, { recursive: true });
	const claims = {
		meta: { question: "MCP handler test", audience: ["ci"] },
		claims: [
			{
				id: "r001",
				type: "factual",
				topic: "test-topic",
				content: "A sample claim for silo MCP tests.",
				evidence: "documented",
				status: "active",
				tags: ["fixture"],
			},
			{
				id: "r002",
				type: "recommendation",
				topic: "test-topic",
				content: "Use MCP tests to protect handlers.",
				evidence: "stated",
				status: "active",
				tags: ["fixture"],
			},
		],
	};
	fs.writeFileSync(
		path.join(workspace, "claims.json"),
		JSON.stringify(claims, null, 2) + "\n",
	);
	return { root, fakeHome, workspace };
}

// ─── Protocol basics ────────────────────────────────────────────────────────

describe("silo MCP server — protocol basics", () => {
	let ws: ReturnType<typeof makeWorkspace>;
	before(() => {
		ws = makeWorkspace("silo-mcp-proto-");
	});
	after(() => {
		fs.rmSync(ws.root, { recursive: true, force: true });
	});

	it("responds to initialize with serverInfo", async () => {
		const { response, child } = await spawnAndInitialize(
			ws.workspace,
			ws.fakeHome,
		);
		try {
			assert.equal(response.jsonrpc, "2.0");
			assert.equal(response.id, 1);
			assert.ok(response.result);
			assert.equal(response.result.serverInfo.name, "grainulator");
			assert.ok(response.result.protocolVersion);
		} finally {
			cleanup(child);
		}
	});

	it("tools/list returns all 8 expected silo tools", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const responsePromise = waitForResponse<{ tools: { name: string }[] }>(
				child,
			);
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			});
			const response = await responsePromise;
			assert.ok(response.result);
			const names = response.result.tools.map((t) => t.name);
			for (const expected of [
				"memory_search",
				"memory_list",
				"memory_pull",
				"memory_store",
				"memory_packs",
				"memory_graph",
				"memory_confluence",
				"memory_smart_fetch",
			]) {
				assert.ok(names.includes(expected), `should list ${expected}`);
			}
		} finally {
			cleanup(child);
		}
	});

	it("no stdout pollution before first JSON-RPC response", async () => {
		const child = spawn(process.execPath, [SILO_BIN, "mcp"], {
			cwd: ws.workspace,
			env: buildEnv(ws.fakeHome),
			stdio: ["pipe", "pipe", "pipe"],
		});
		try {
			let stdout = "";
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("timeout")), 5_000);
				child.stdout.on("data", (chunk: Buffer) => {
					stdout += chunk.toString();
					if (stdout.length > 0) {
						clearTimeout(timer);
						resolve();
					}
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
			});
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

// ─── Tool handlers ──────────────────────────────────────────────────────────

describe("silo MCP tool handlers", () => {
	let ws: ReturnType<typeof makeWorkspace>;
	before(() => {
		ws = makeWorkspace("silo-mcp-tools-");
	});
	after(() => {
		fs.rmSync(ws.root, { recursive: true, force: true });
	});

	// ── memory_list ────────────────────────────────────────────────────────────
	it("memory_list — returns empty collection list on clean silo", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 10, "memory_list", {});
			assert.equal(payload.status, "ok");
			assert.ok(Array.isArray(payload.collections));
		} finally {
			cleanup(child);
		}
	});

	// ── memory_packs ───────────────────────────────────────────────────────────
	it("memory_packs — lists built-in knowledge packs", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 20, "memory_packs", {});
			assert.equal(payload.status, "ok");
			assert.ok(Array.isArray(payload.packs));
			// Built-in packs ship with the package; expect at least one
			assert.ok(
				payload.packs.length > 0,
				"silo ships with built-in packs — list should be non-empty",
			);
		} finally {
			cleanup(child);
		}
	});

	// ── memory_search ──────────────────────────────────────────────────────────
	it("memory_search — returns ok with empty results on clean silo", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 30, "memory_search", {
				query: "anything",
			});
			assert.equal(payload.status, "ok");
			assert.ok(Array.isArray(payload.claims));
			// Clean silo has no stored collections — expect zero results
			assert.equal(payload.count, 0);
		} finally {
			cleanup(child);
		}
	});

	it("memory_search — errors when query missing", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { response, payload } = await callTool(
				child,
				31,
				"memory_search",
				{},
			);
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" && /query/i.test(payload.message),
			);
			assert.ok(response.result.isError);
		} finally {
			cleanup(child);
		}
	});

	// ── memory_store (happy) + memory_pull (happy) ───────────────────────────────
	it("memory_store — stores claims from workspace claims.json", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 40, "memory_store", {
				name: "test-collection",
			});
			assert.equal(payload.status, "ok");
			assert.ok(payload.id, "should return collection id");
			assert.ok(
				typeof payload.claimCount === "number" && payload.claimCount >= 2,
				"should store all 2 claims",
			);
		} finally {
			cleanup(child);
		}
	});

	it("memory_store — errors when name missing", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 41, "memory_store", {});
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" && /name/i.test(payload.message),
			);
		} finally {
			cleanup(child);
		}
	});

	it("memory_store — rejects path traversal in `from`", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 42, "memory_store", {
				name: "bad",
				from: "../../../etc/passwd",
			});
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" &&
					/outside workspace|escapes workspace/i.test(payload.message),
			);
		} finally {
			cleanup(child);
		}
	});

	// ── memory_pull ────────────────────────────────────────────────────────────
	it("memory_pull — errors when pack missing (required)", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 50, "memory_pull", {});
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" && /pack/i.test(payload.message),
			);
		} finally {
			cleanup(child);
		}
	});

	it("memory_pull — errors on unknown pack", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 51, "memory_pull", {
				pack: "definitely-not-a-real-pack-xyz",
			});
			assert.equal(payload.status, "error");
		} finally {
			cleanup(child);
		}
	});

	// ── memory_graph ───────────────────────────────────────────────────────────
	it("memory_graph — build returns stats", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 60, "memory_graph", {
				action: "build",
			});
			assert.equal(payload.status, "ok");
			// graph.build returns stats — merged spread into payload
			assert.equal(typeof payload.message, "string");
		} finally {
			cleanup(child);
		}
	});

	it("memory_graph — stats action succeeds on empty graph", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 61, "memory_graph", {
				action: "stats",
			});
			assert.equal(payload.status, "ok");
		} finally {
			cleanup(child);
		}
	});

	it("memory_graph — rejects unknown action", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 62, "memory_graph", {
				action: "definitely-not-a-real-action",
			});
			assert.equal(payload.status, "error");
		} finally {
			cleanup(child);
		}
	});

	it("memory_graph — related requires claimId", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 63, "memory_graph", {
				action: "related",
			});
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" && /claimId/i.test(payload.message),
			);
		} finally {
			cleanup(child);
		}
	});

	// ── memory_confluence (error-only, no external service) ────────────────────
	it("memory_confluence — errors when env vars unset", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 70, "memory_confluence", {
				action: "list",
			});
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" &&
					/not configured|CONFLUENCE_/i.test(payload.message),
				`expected config-missing error, got: ${payload.message}`,
			);
		} finally {
			cleanup(child);
		}
	});

	// ── memory_smart_fetch (error-only, no network) ────────────────────────────
	it("memory_smart_fetch — errors on missing url", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 80, "memory_smart_fetch", {});
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" && /url/i.test(payload.message),
			);
		} finally {
			cleanup(child);
		}
	});

	it("memory_smart_fetch — errors on non-http(s) URL", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const { payload } = await callTool(child, 81, "memory_smart_fetch", {
				url: "file:///etc/passwd",
			});
			assert.equal(payload.status, "error");
			assert.ok(
				typeof payload.message === "string" && /http/i.test(payload.message),
			);
		} finally {
			cleanup(child);
		}
	});

	// ── unknown tool ─────────────────────────────────────────────────────────
	it("unknown tool — returns JSON-RPC method-not-found error", async () => {
		const { child } = await spawnAndInitialize(ws.workspace, ws.fakeHome);
		try {
			const responsePromise = waitForResponse(child);
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 90,
				method: "tools/call",
				params: { name: "silo/does-not-exist", arguments: {} },
			});
			const response = await responsePromise;
			assert.ok(response.error, "should return JSON-RPC error");
			assert.equal(response.error.code, -32602);
		} finally {
			cleanup(child);
		}
	});
});
