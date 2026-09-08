/**
 * Integration test: wheat MCP server
 *
 * Verifies that the MCP server:
 *   - Binary exists and is executable
 *   - Responds to initialize within 5 seconds
 *   - Stays alive after initialize
 *   - Lists tools via tools/list
 *   - Produces no stdout pollution before first JSON-RPC response
 *   - Works via old path (wheat.js mcp)
 *   - Exits cleanly on stdin close
 *
 * Uses node:test + node:assert — zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MCP_BIN = path.resolve(__dirname, "..", "bin", "wheat-mcp.js");
const WHEAT_BIN = path.resolve(__dirname, "..", "bin", "wheat.js");

/**
 * Send a JSON-RPC message to a child process via stdin.
 */
function sendJsonRpc(child, obj) {
	child.stdin.write(JSON.stringify(obj) + "\n");
}

/**
 * Spawn the MCP server and collect the first JSON-RPC response from stdout.
 * Returns a promise that resolves with { response, child }.
 */
function spawnAndInitialize(bin, args = []) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [bin, ...args], {
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
					resolve({ response, child, rawStdout: stdout });
				} catch (err) {
					child.kill();
					reject(
						new Error(
							`Failed to parse response: ${err.message}\nRaw: ${stdout}`,
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

		// Send initialize request
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

/**
 * Collect the next JSON-RPC response from stdout after the initial one.
 */
function waitForResponse(child, timeout = 5_000) {
	return new Promise((resolve, reject) => {
		let buf = "";
		const timer = setTimeout(() => {
			reject(new Error("Timed out waiting for response"));
		}, timeout);

		function onData(chunk) {
			buf += chunk.toString();
			const lines = buf.split("\n").filter((l) => l.trim());
			if (lines.length > 0) {
				clearTimeout(timer);
				child.stdout.removeListener("data", onData);
				try {
					resolve(JSON.parse(lines[0]));
				} catch (err) {
					reject(new Error(`Parse error: ${err.message}\nRaw: ${buf}`));
				}
			}
		}

		child.stdout.on("data", onData);
	});
}

/**
 * Kill a child process and suppress errors.
 */
function cleanup(child) {
	try {
		child.kill();
	} catch {
		/* already dead */
	}
}

describe("wheat MCP server", () => {
	it("wheat-mcp binary exists and is executable", () => {
		accessSync(MCP_BIN, constants.R_OK);
		// Verify it is a file we can execute with node (read access is sufficient
		// since we invoke via `node bin/wheat-mcp.js`)
	});

	it("MCP server responds to initialize within 5 seconds", async () => {
		const { response, child } = await spawnAndInitialize(MCP_BIN);
		try {
			assert.equal(response.jsonrpc, "2.0");
			assert.equal(response.id, 1);
			assert.ok(response.result, "response should have result");
			assert.ok(response.result.serverInfo, "result should have serverInfo");
			assert.equal(response.result.serverInfo.name, "wheat");
			assert.ok(
				response.result.protocolVersion,
				"result should have protocolVersion",
			);
		} finally {
			cleanup(child);
		}
	});

	it("MCP server stays alive after initialize", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN);
		try {
			// Wait 2 seconds, then check the process is still running
			await new Promise((resolve) => setTimeout(resolve, 2_000));
			assert.equal(
				child.exitCode,
				null,
				"process should still be running (exitCode should be null)",
			);
			assert.ok(!child.killed, "process should not have been killed");
		} finally {
			cleanup(child);
		}
	});

	it("MCP server lists tools", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN);
		try {
			// Send tools/list request
			const responsePromise = waitForResponse(child);
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			});

			const response = await responsePromise;
			assert.equal(response.jsonrpc, "2.0");
			assert.equal(response.id, 2);
			assert.ok(response.result, "response should have result");
			assert.ok(
				Array.isArray(response.result.tools),
				"result.tools should be an array",
			);
			assert.ok(
				response.result.tools.length > 0,
				"tools array should not be empty",
			);

			// Verify some expected tool names
			const toolNames = response.result.tools.map((t) => t.name);
			assert.ok(
				toolNames.includes("wheat/compile"),
				"should include wheat/compile tool",
			);
			assert.ok(
				toolNames.includes("wheat/status"),
				"should include wheat/status tool",
			);
		} finally {
			cleanup(child);
		}
	});

	it("no stdout pollution before first JSON-RPC response", async () => {
		const { rawStdout, child } = await spawnAndInitialize(MCP_BIN);
		try {
			// The raw stdout should start with a valid JSON object (the response).
			// Any non-JSON output before it would corrupt the protocol.
			const trimmed = rawStdout.trimStart();
			assert.ok(
				trimmed.startsWith("{"),
				`stdout should start with JSON object, got: ${trimmed.slice(0, 100)}`,
			);

			// Verify the first line parses as valid JSON-RPC
			const firstLine = trimmed.split("\n")[0];
			const parsed = JSON.parse(firstLine);
			assert.equal(parsed.jsonrpc, "2.0", "first line should be JSON-RPC 2.0");
		} finally {
			cleanup(child);
		}
	});

	it("old path (wheat.js mcp) still works", async () => {
		const { response, child } = await spawnAndInitialize(WHEAT_BIN, ["mcp"]);
		try {
			assert.equal(response.jsonrpc, "2.0");
			assert.equal(response.id, 1);
			assert.ok(response.result, "response should have result");
			assert.equal(
				response.result.serverInfo.name,
				"wheat",
				"old path should start the same wheat MCP server",
			);
		} finally {
			cleanup(child);
		}
	});

	it("process exits cleanly on stdin close", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN);

		const exitPromise = new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				child.kill();
				reject(
					new Error("Process did not exit within 5 seconds after stdin close"),
				);
			}, 5_000);

			child.on("close", (code) => {
				clearTimeout(timer);
				resolve(code);
			});
		});

		// Close stdin to signal the server to shut down
		child.stdin.end();

		const exitCode = await exitPromise;
		assert.equal(
			exitCode,
			0,
			`process should exit with code 0, got ${exitCode}`,
		);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Tool-call handler tests — one happy + one error path per tool
// ────────────────────────────────────────────────────────────────────────────

/**
 * Make a tools/call request and return the parsed response body.
 * Asserts protocol shape and returns the JSON payload inside content[0].text.
 */
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
	assert.ok(response.result.content.length > 0, "content should be non-empty");
	const textBlock = response.result.content[0];
	assert.equal(textBlock.type, "text");
	assert.ok(
		typeof textBlock.text === "string" && textBlock.text.length > 0,
		"content[0].text should be a non-empty string",
	);
	const payload = JSON.parse(textBlock.text);
	return { response, payload };
}

/** Create a minimal valid sprint workspace (claims.json) in a temp dir. */
function makeSprintDir(prefix = "wheat-mcp-test-") {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	const claims = {
		schema_version: "1.0",
		meta: {
			question: "MCP handler test sprint",
			initiated: "2026-01-01",
			audience: ["ci"],
			phase: "research",
			connectors: [],
		},
		claims: [
			{
				id: "r001",
				type: "factual",
				topic: "test-topic",
				content: "Seed claim for MCP handler tests.",
				source: { origin: "cli", artifact: null, connector: null },
				evidence: "stated",
				status: "active",
				phase_added: "research",
				timestamp: "2026-01-01T00:00:00Z",
				conflicts_with: ["r002"],
				resolved_by: null,
				tags: ["fixture"],
			},
			{
				id: "r002",
				type: "factual",
				topic: "test-topic",
				content: "Conflicting claim used to exercise wheat/resolve.",
				source: { origin: "cli", artifact: null, connector: null },
				evidence: "stated",
				status: "active",
				phase_added: "research",
				timestamp: "2026-01-02T00:00:00Z",
				conflicts_with: ["r001"],
				resolved_by: null,
				tags: ["fixture"],
			},
		],
	};
	fs.writeFileSync(
		path.join(dir, "claims.json"),
		JSON.stringify(claims, null, 2) + "\n",
	);
	return dir;
}

describe("wheat MCP tool handlers", () => {
	let sprintDir;

	before(() => {
		sprintDir = makeSprintDir();
	});

	after(() => {
		fs.rmSync(sprintDir, { recursive: true, force: true });
	});

	it("wheat/status — returns sprint metadata", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 10, "wheat/status", {});
			assert.equal(payload.status, "ok");
			assert.equal(payload.question, "MCP handler test sprint");
			assert.equal(payload.total_claims, 2);
			assert.ok(typeof payload.active_claims === "number");
		} finally {
			cleanup(child);
		}
	});

	it("wheat/status — reports no_sprint when claims.json absent", async () => {
		const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-mcp-empty-"));
		try {
			const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", emptyDir]);
			try {
				const { payload } = await callTool(child, 11, "wheat/status", {});
				assert.equal(payload.status, "no_sprint");
			} finally {
				cleanup(child);
			}
		} finally {
			fs.rmSync(emptyDir, { recursive: true, force: true });
		}
	});

	it("wheat/search — filters by query string", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 20, "wheat/search", {
				query: "seed",
			});
			assert.equal(payload.status, "ok");
			assert.ok(Array.isArray(payload.claims));
			assert.equal(payload.count, 1);
			assert.equal(payload.claims[0].id, "r001");
		} finally {
			cleanup(child);
		}
	});

	it("wheat/search — empty result set when query matches nothing", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 21, "wheat/search", {
				query: "nonexistenttoken12345",
			});
			assert.equal(payload.status, "ok");
			assert.equal(payload.count, 0);
		} finally {
			cleanup(child);
		}
	});

	it("wheat/compile — runs compiler and returns status summary", async () => {
		const compileDir = makeSprintDir("wheat-mcp-compile-");
		try {
			const { child } = await spawnAndInitialize(MCP_BIN, [
				"--dir",
				compileDir,
			]);
			try {
				const { payload } = await callTool(child, 30, "wheat/compile", {});
				assert.equal(payload.status, "ok");
				assert.ok(
					typeof payload.output === "string" && payload.output.length > 0,
					"compile result should have output summary",
				);
			} finally {
				cleanup(child);
			}
		} finally {
			fs.rmSync(compileDir, { recursive: true, force: true });
		}
	});

	it("wheat/compile — errors when no claims.json exists", async () => {
		const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-mcp-empty-"));
		try {
			const { response, child } = await (async () => {
				const c = await spawnAndInitialize(MCP_BIN, ["--dir", emptyDir]);
				return c;
			})();
			try {
				const { response: resp, payload } = await callTool(
					child,
					31,
					"wheat/compile",
					{},
				);
				assert.equal(payload.status, "error");
				assert.ok(resp.result.isError, "isError flag should be set");
			} finally {
				cleanup(child);
			}
			// Keep reference to silence unused-var lints
			void response;
		} finally {
			fs.rmSync(emptyDir, { recursive: true, force: true });
		}
	});

	it("wheat/add-claim — appends a valid claim", async () => {
		const addDir = makeSprintDir("wheat-mcp-add-");
		try {
			const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", addDir]);
			try {
				const { payload } = await callTool(child, 40, "wheat/add-claim", {
					id: "r100",
					type: "factual",
					topic: "added",
					content: "A newly added claim via MCP handler.",
					evidence: "documented",
				});
				assert.equal(payload.status, "ok");
				assert.equal(payload.claim.id, "r100");
				// Verify it was persisted to disk
				const claims = JSON.parse(
					fs.readFileSync(path.join(addDir, "claims.json"), "utf8"),
				);
				assert.ok(
					claims.claims.some((c) => c.id === "r100"),
					"claim should be persisted in claims.json",
				);
			} finally {
				cleanup(child);
			}
		} finally {
			fs.rmSync(addDir, { recursive: true, force: true });
		}
	});

	it("wheat/add-claim — rejects missing required fields", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { response, payload } = await callTool(
				child,
				41,
				"wheat/add-claim",
				{ id: "r999" }, // missing type, topic, content
			);
			assert.equal(payload.status, "error");
			assert.ok(/required/i.test(payload.message));
			assert.ok(response.result.isError);
		} finally {
			cleanup(child);
		}
	});

	it("wheat/resolve — resolves a conflict and supersedes loser", async () => {
		const resolveDir = makeSprintDir("wheat-mcp-resolve-");
		try {
			const { child } = await spawnAndInitialize(MCP_BIN, [
				"--dir",
				resolveDir,
			]);
			try {
				const { payload } = await callTool(child, 50, "wheat/resolve", {
					winner: "r001",
					loser: "r002",
					reason: "test",
				});
				assert.equal(payload.status, "ok");
				assert.equal(payload.winner, "r001");
				assert.equal(payload.loser, "r002");
				const claims = JSON.parse(
					fs.readFileSync(path.join(resolveDir, "claims.json"), "utf8"),
				);
				const loser = claims.claims.find((c) => c.id === "r002");
				assert.equal(loser.status, "superseded");
				assert.equal(loser.resolved_by, "r001");
			} finally {
				cleanup(child);
			}
		} finally {
			fs.rmSync(resolveDir, { recursive: true, force: true });
		}
	});

	it("wheat/resolve — errors when loser not found", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 51, "wheat/resolve", {
				winner: "r001",
				loser: "does-not-exist",
			});
			assert.equal(payload.status, "error");
			assert.ok(/not found/i.test(payload.message));
		} finally {
			cleanup(child);
		}
	});

	it("wheat/sync-log — returns empty history with ok status", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 60, "wheat/sync-log", {});
			assert.equal(payload.status, "ok");
			assert.ok(Array.isArray(payload.entries));
			assert.equal(payload.entries.length, 0);
		} finally {
			cleanup(child);
		}
	});

	it("wheat/sync-log — reads entries when file exists", async () => {
		const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-mcp-synclog-"));
		try {
			fs.writeFileSync(path.join(logDir, "claims.json"), "{}\n");
			fs.mkdirSync(path.join(logDir, "output"), { recursive: true });
			const entries = [
				{ target: "confluence", at: "2026-01-01T00:00:00Z", ok: true },
			];
			fs.writeFileSync(
				path.join(logDir, "output", "sync-log.json"),
				JSON.stringify(entries),
			);
			const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", logDir]);
			try {
				const { payload } = await callTool(child, 61, "wheat/sync-log", {});
				assert.equal(payload.status, "ok");
				assert.equal(payload.count, 1);
			} finally {
				cleanup(child);
			}
		} finally {
			fs.rmSync(logDir, { recursive: true, force: true });
		}
	});

	it("wheat/init — errors when question missing", async () => {
		const initDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-mcp-init-"));
		try {
			const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", initDir]);
			try {
				const { payload } = await callTool(child, 70, "wheat/init", {});
				assert.equal(payload.status, "error");
				assert.ok(/question/i.test(payload.message));
			} finally {
				cleanup(child);
			}
		} finally {
			fs.rmSync(initDir, { recursive: true, force: true });
		}
	});

	it("wheat/init — errors when sprint already exists", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 71, "wheat/init", {
				question: "Should not overwrite",
			});
			assert.equal(payload.status, "error");
			assert.ok(/already exists/i.test(payload.message));
		} finally {
			cleanup(child);
		}
	});

	it("wheat/deepwiki — errors on malformed repo argument", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 80, "wheat/deepwiki", {
				repo: "not a valid repo string",
			});
			assert.equal(payload.status, "error");
			assert.ok(/org\/name/.test(payload.message));
		} finally {
			cleanup(child);
		}
	});

	it("wheat/deepwiki — errors when repo missing", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const { payload } = await callTool(child, 81, "wheat/deepwiki", {});
			assert.equal(payload.status, "error");
		} finally {
			cleanup(child);
		}
	});

	it("unknown tool — returns JSON-RPC method-not-found error", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const responsePromise = waitForResponse(child);
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 90,
				method: "tools/call",
				params: { name: "wheat/does-not-exist", arguments: {} },
			});
			const response = await responsePromise;
			assert.equal(response.id, 90);
			assert.ok(response.error, "should return JSON-RPC error");
			assert.equal(response.error.code, -32601);
		} finally {
			cleanup(child);
		}
	});

	it("tools/call outside workspace — returns isError", async () => {
		const { child } = await spawnAndInitialize(MCP_BIN, ["--dir", sprintDir]);
		try {
			const outsideDir = path.resolve(
				os.tmpdir(),
				"definitely-outside-workspace",
			);
			const responsePromise = waitForResponse(child);
			sendJsonRpc(child, {
				jsonrpc: "2.0",
				id: 91,
				method: "tools/call",
				params: {
					name: "wheat/status",
					arguments: { dir: outsideDir },
				},
			});
			const response = await responsePromise;
			assert.ok(response.result.isError, "should flag isError");
			const payload = JSON.parse(response.result.content[0].text);
			assert.ok(/outside workspace/i.test(payload.error));
		} finally {
			cleanup(child);
		}
	});
});

// ────────────────────────────────────────────────────────────────────────────
// Top-level crash handler tests
//
// Verify that uncaughtException / unhandledRejection thrown OFF the request
// path (e.g., from a setTimeout or an unhandled promise rejection) are caught
// by the new top-level handlers, logged as structured JSON to stderr, and
// cause the process to exit with code 1 (so Claude Code surfaces a reload
// prompt rather than a silent hang).
//
// The BARN_MCP_CRASH_TEST env var is a test-only hook that asks the server
// to schedule an async throw or rejection 50ms after startup. Never set in
// production.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Spawn the MCP server with BARN_MCP_CRASH_TEST set and collect stderr + exit
 * code. Resolves when the process exits.
 */
function spawnCrashing(mode, timeoutMs = 5_000) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [MCP_BIN], {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, BARN_MCP_CRASH_TEST: mode },
		});

		let stderr = "";
		let stdout = "";

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(
				new Error(
					`Crash child did not exit within ${timeoutMs}ms\nstderr: ${stderr}`,
				),
			);
		}, timeoutMs);

		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, stderr, stdout });
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

describe("wheat MCP crash handlers", () => {
	it("uncaughtException — logs structured JSON to stderr and exits with code 1", async () => {
		const { code, stderr, stdout } = await spawnCrashing("uncaught");
		assert.equal(code, 1, `expected exit code 1, got ${code}`);

		// stdout must NOT contain the crash payload (reserved for JSON-RPC).
		assert.ok(
			!stdout.includes("uncaughtException"),
			"crash payload must never appear on stdout",
		);

		// stderr should contain a parseable JSON line with the expected fields.
		const lines = stderr.split("\n").filter((l) => l.trim().startsWith("{"));
		assert.ok(
			lines.length > 0,
			`expected a JSON log line on stderr, got: ${stderr}`,
		);
		const payload = JSON.parse(lines[0]);
		assert.equal(payload.level, "fatal");
		assert.equal(payload.source, "wheat-mcp");
		assert.equal(payload.kind, "uncaughtException");
		assert.ok(payload.message.includes("BARN_MCP_CRASH_TEST uncaught"));
		assert.ok(typeof payload.stack === "string" && payload.stack.length > 0);
		assert.ok(typeof payload.version === "string");
		assert.ok(typeof payload.pid === "number");
	});

	it("unhandledRejection — logs structured JSON to stderr and exits with code 1", async () => {
		const { code, stderr, stdout } = await spawnCrashing("unhandled");
		assert.equal(code, 1, `expected exit code 1, got ${code}`);

		assert.ok(
			!stdout.includes("unhandledRejection"),
			"crash payload must never appear on stdout",
		);

		const lines = stderr.split("\n").filter((l) => l.trim().startsWith("{"));
		assert.ok(
			lines.length > 0,
			`expected a JSON log line on stderr, got: ${stderr}`,
		);
		// The first fatal JSON line should be the unhandled rejection.
		const fatal = lines
			.map((l) => JSON.parse(l))
			.find((p) => p.level === "fatal");
		assert.ok(fatal, "expected a fatal-level line");
		assert.equal(fatal.source, "wheat-mcp");
		assert.equal(fatal.kind, "unhandledRejection");
		assert.ok(fatal.message.includes("BARN_MCP_CRASH_TEST unhandled"));
	});
});
