import { withoutElements, htmlText } from "../../shared/lib/html.cjs";
/**
 * wheat serve-mcp -- Local MCP server for Claude Code
 *
 * Exposes wheat compiler tools and resources over stdio transport
 * using the MCP JSON-RPC protocol. Zero npm dependencies.
 *
 * Tools:
 *   wheat/compile   -- Run the compiler, return status + warnings
 *   wheat/add-claim -- Append a typed claim to claims.json
 *   wheat/resolve   -- Adjudicate a specific conflict
 *   wheat/search    -- Query claims by topic, type, evidence tier
 *   wheat/status    -- Return compilation summary
 *   wheat/init      -- Initialize a new research sprint
 *   wheat/deepwiki  -- Fetch DeepWiki docs for a public GitHub repo
 *   wheat/sync-log  -- View sync/publish history
 *
 * Resources:
 *   wheat://compilation -- Current compilation.json
 *   wheat://claims      -- Current claims.json
 *   wheat://brief       -- Latest brief (output/brief.html)
 *   wheat://sync-log    -- Sync/publish history
 *
 * Protocol: MCP over stdio (JSON-RPC 2.0, newline-delimited)
 *
 * Install (recommended):
 *   claude mcp add wheat -- npx -y -p @grainulation/wheat wheat-mcp
 *
 * Legacy (still works, but routes through CLI dispatch):
 *   claude mcp add wheat -- npx @grainulation/wheat mcp
 *
 * Zero npm dependencies.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { installCrashHandlers } from "../../shared/lib/mcp-crash.js";
import { jsonRpcError, jsonRpcResponse } from "../../shared/lib/mcp.js";
import { isInsideDir } from "../../shared/lib/paths.js";
import { compile } from "../compiler/wheat-compiler.js";
import nextActionsModule from "./next-actions.cjs";
import {
	addClaim,
	getStatus,
	resolveClaim,
	resolvePaths,
	searchClaims,
	VALID_EVIDENCE,
	VALID_TYPES,
} from "./claims-ops.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Constants ---------------------------------------------------------------

const SERVER_NAME = "wheat";
const SERVER_VERSION = JSON.parse(
	fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
).version;
const PROTOCOL_VERSION = "2024-11-05";

// --- Tool implementations ----------------------------------------------------

function toolCompile(dir) {
	const paths = resolvePaths(dir);

	if (!fs.existsSync(paths.claims)) {
		return {
			status: "error",
			message: "No claims.json found. Run grainulator init first.",
		};
	}

	try {
		const compilationPath = path.join(dir, "compilation.json");
		const result = compile(paths.claims, compilationPath, dir);
		return {
			status: "ok",
			output: nextActionsModule.formatNextActions(result.next_actions),
			compilation_status: result.status,
			errors: result.errors,
			warnings: result.warnings,
			next_actions: result.next_actions,
			next_actions_instruction: nextActionsModule.nextActionsInstruction,
		};
	} catch (err) {
		return {
			status: "error",
			output: "",
			error: err.message || String(err),
		};
	}
}

function toolAddClaim(dir, args) {
	return addClaim(dir, args);
}

function toolResolve(dir, args) {
	return resolveClaim(dir, args);
}

function toolSearch(dir, args) {
	return searchClaims(dir, args);
}

function toolStatus(dir) {
	return getStatus(dir);
}

function toolInit(dir, args) {
	const paths = resolvePaths(dir);

	if (!args.question) {
		return { status: "error", message: "Required field: question" };
	}

	if (fs.existsSync(paths.claims) && !args.force) {
		return {
			status: "error",
			message:
				"Sprint already exists (claims.json found). Pass force: true to reinitialize.",
		};
	}

	const initArgs = [
		path.join(__dirname, "..", "bin", "wheat.js"),
		"init",
		"--headless",
		"--question",
		args.question,
		"--audience",
		args.audience || "self",
		"--constraints",
		args.constraints || "none",
		"--done",
		args.done || "A recommendation with evidence",
		"--dir",
		dir,
	];

	if (args.force) initArgs.push("--force");

	try {
		const output = execFileSync("node", initArgs, {
			cwd: dir,
			encoding: "utf8",
			timeout: 15000,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return {
			status: "ok",
			message: "Sprint initialized.",
			output: output.trim(),
		};
	} catch (err) {
		return {
			status: "error",
			message: (err.stderr || err.stdout || err.message).trim(),
		};
	}
}

function toolDeepwiki(_dir, args) {
	const repo = args.repo;
	if (!repo || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
		return {
			status: "error",
			message:
				'Required: repo in "org/name" format (e.g., "grainulation/wheat")',
		};
	}

	const url = `https://deepwiki.com/${repo}`;

	return new Promise((resolve) => {
		try {
			const req = https.get(
				url,
				{ timeout: 15000, headers: { Accept: "text/html" } },
				(res) => {
					if (res.statusCode === 301 || res.statusCode === 302) {
						resolve({
							status: "ok",
							repo,
							url,
							note: `DeepWiki redirects for ${repo} — repo may not be indexed yet. Visit ${url} to trigger indexing.`,
							content: null,
						});
						res.resume();
						return;
					}
					if (res.statusCode !== 200) {
						resolve({
							status: "error",
							message: `DeepWiki returned HTTP ${res.statusCode} for ${repo}. The repo may not be indexed — visit ${url} to trigger indexing.`,
						});
						res.resume();
						return;
					}

					let body = "";
					res.setEncoding("utf8");
					res.on("error", (err) => {
						// Mid-stream response error (e.g., ECONNRESET while body is
						// streaming). The response has not completed — we cannot
						// return partial content. Resolve with a clean error shape
						// so the JSON-RPC framing stays intact.
						resolve({
							status: "error",
							message: `DeepWiki response error: ${err.message}. Visit ${url} manually.`,
						});
					});
					res.on("data", (chunk) => {
						body += chunk;
					});
					res.on("end", () => {
						// Extract useful content from DeepWiki HTML
						// Strip script/style tags, extract text content from main sections
						const cleaned = withoutElements(body, ["script", "style", "nav", "footer"]);

						// Extract headings and their content for structured output
						const sections = [];
						const headingRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
						let match;
						while ((match = headingRegex.exec(cleaned)) !== null) {
							const level = parseInt(match[1], 10);
							const title = htmlText(match[2]).trim();
							if (title) sections.push({ level, title });
						}

						// Extract paragraph text
						const paragraphs = [];
						const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
						while ((match = pRegex.exec(cleaned)) !== null) {
							const text = htmlText(match[1]).trim();
							if (text && text.length > 30) paragraphs.push(text);
						}

						// Limit output to avoid overwhelming context
						const truncatedParagraphs = paragraphs.slice(0, 30);

						resolve({
							status: "ok",
							repo,
							url,
							sections: sections.slice(0, 50),
							content_preview: truncatedParagraphs,
							note: `Full DeepWiki documentation available at ${url}. Use /pull deepwiki ${repo} to extract claims from this content.`,
						});
					});
				},
			);

			req.on("error", (err) => {
				resolve({
					status: "error",
					message: `Failed to reach DeepWiki: ${err.message}. Visit ${url} manually.`,
				});
			});
			req.on("timeout", () => {
				req.destroy();
				resolve({
					status: "error",
					message: `DeepWiki request timed out. Visit ${url} manually.`,
				});
			});
		} catch (err) {
			resolve({
				status: "error",
				message: `DeepWiki request failed: ${err.message}. Visit ${url} manually.`,
			});
		}
	});
}

function toolSyncLog(dir) {
	const logPath = path.join(dir, "output", "sync-log.json");
	if (!fs.existsSync(logPath)) {
		return {
			status: "ok",
			message: "No sync history found. Use /sync to publish sprint artifacts.",
			entries: [],
		};
	}
	try {
		const entries = JSON.parse(fs.readFileSync(logPath, "utf8"));
		return { status: "ok", count: entries.length, entries };
	} catch {
		return { status: "error", message: "sync-log.json is corrupted." };
	}
}

// --- Tool & Resource definitions ---------------------------------------------

const DIR_PARAM = {
	type: "string",
	description:
		"Optional target directory override. Use when working with sub-sprints in subdirectories. Defaults to the server's startup directory.",
};

const TOOLS = [
	{
		name: "wheat/compile",
		description:
			"Run the wheat compiler on claims.json. Returns compilation status, warnings, errors, and next_actions grouped into auto and manual. For a next-steps request, the entire reply must be only Auto and Manual bullet lists, without preamble or status recap.",
		inputSchema: {
			type: "object",
			properties: { dir: DIR_PARAM },
		},
	},
	{
		name: "wheat/add-claim",
		description:
			"Append a typed claim to claims.json. Validates type, evidence tier, and checks for duplicate IDs.",
		inputSchema: {
			type: "object",
			properties: {
				dir: DIR_PARAM,
				id: {
					type: "string",
					description: "Claim ID (e.g., r001, x001, d001)",
				},
				type: { type: "string", enum: VALID_TYPES, description: "Claim type" },
				topic: {
					type: "string",
					description: "Topic slug (e.g., database-migration)",
				},
				content: {
					type: "string",
					description: "The claim content -- specific, verifiable finding",
				},
				evidence: {
					type: "string",
					enum: VALID_EVIDENCE,
					description: "Evidence tier (default: stated)",
				},
				source: {
					type: "object",
					description:
						"Evidence provenance. Use a distinct publisher, repository, test suite, or stakeholder as origin; artifact is a URL or local evidence reference.",
					properties: {
						origin: { type: "string" },
						artifact: { type: ["string", "null"] },
						connector: { type: ["string", "null"] },
						witnessed_claim: {
							type: "string",
							description:
								"ID of the claim corroborated by this independent finding",
						},
						challenged_claim: {
							type: "string",
							description: "ID of the claim tested adversarially",
						},
						relationship: {
							type: "string",
							enum: ["full_support", "partial_support", "contradicts"],
						},
					},
					required: ["origin"],
				},
				conflicts_with: {
					type: "array",
					items: { type: "string" },
					description:
						"IDs of claims this finding contradicts. The compiler flags the conflict until resolved.",
				},

				tags: {
					type: "array",
					items: { type: "string" },
					description: "Optional tags",
				},
			},
			required: ["id", "type", "topic", "content"],
		},
	},
	{
		name: "wheat/resolve",
		description:
			"Resolve a conflict between two claims. The winner stays active; the loser is superseded.",
		inputSchema: {
			type: "object",
			properties: {
				dir: DIR_PARAM,
				winner: { type: "string", description: "ID of the winning claim" },
				loser: { type: "string", description: "ID of the losing claim" },
				reason: {
					type: "string",
					description: "Optional reason for the resolution",
				},
			},
			required: ["winner", "loser"],
		},
	},
	{
		name: "wheat/search",
		description:
			"Search active claims by topic, type, evidence tier, or free-text query.",
		inputSchema: {
			type: "object",
			properties: {
				dir: DIR_PARAM,
				topic: { type: "string", description: "Filter by topic slug" },
				type: {
					type: "string",
					enum: VALID_TYPES,
					description: "Filter by claim type",
				},
				evidence: {
					type: "string",
					enum: VALID_EVIDENCE,
					description: "Filter by evidence tier",
				},
				query: {
					type: "string",
					description: "Free-text search in claim content",
				},
			},
		},
	},
	{
		name: "wheat/status",
		description:
			"Get sprint status: question, phase, claim counts, topic count, compilation status.",
		inputSchema: {
			type: "object",
			properties: { dir: DIR_PARAM },
		},
	},
	{
		name: "wheat/init",
		description:
			"Initialize a new research sprint. Creates claims.json, CLAUDE.md, and slash commands.",
		inputSchema: {
			type: "object",
			properties: {
				dir: DIR_PARAM,
				question: {
					type: "string",
					description: "The research question for this sprint",
				},
				audience: {
					type: "string",
					description: "Comma-separated list of audience (default: self)",
				},
				constraints: {
					type: "string",
					description: "Semicolon-separated constraints (default: none)",
				},
				done: {
					type: "string",
					description:
						'What "done" looks like (default: A recommendation with evidence)',
				},
				force: {
					type: "boolean",
					description: "Reinitialize even if sprint exists (default: false)",
				},
			},
			required: ["question"],
		},
	},
	{
		name: "wheat/deepwiki",
		description:
			"Fetch AI-generated documentation from DeepWiki for a public GitHub repo. Returns architecture overview, component descriptions, and section structure. Use with /pull to extract claims.",
		inputSchema: {
			type: "object",
			properties: {
				dir: DIR_PARAM,
				repo: {
					type: "string",
					description:
						'GitHub repo in "org/name" format (e.g., "grainulation/wheat")',
				},
			},
			required: ["repo"],
		},
	},
	{
		name: "wheat/sync-log",
		description:
			"View the sync history — records of when sprint artifacts were published to Confluence, Slack, or other targets.",
		inputSchema: {
			type: "object",
			properties: { dir: DIR_PARAM },
		},
	},
];

const RESOURCES = [
	{
		uri: "wheat://compilation",
		name: "Compilation Output",
		description:
			"Current compilation.json -- the checked, certified output from the wheat compiler.",
		mimeType: "application/json",
	},
	{
		uri: "wheat://claims",
		name: "Claims Data",
		description: "Current claims.json -- all typed claims in the sprint.",
		mimeType: "application/json",
	},
	{
		uri: "wheat://brief",
		name: "Decision Brief",
		description:
			"Latest compiled brief (output/brief.html) -- self-contained HTML.",
		mimeType: "text/html",
	},
	{
		uri: "wheat://sync-log",
		name: "Sync History",
		description:
			"Log of sprint artifact publishes to Confluence, Slack, Notion, etc.",
		mimeType: "application/json",
	},
];

// --- Request handler ---------------------------------------------------------

async function handleRequest(dir, method, params, id) {
	switch (method) {
		case "initialize":
			return jsonRpcResponse(id, {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
			});

		case "notifications/initialized":
			// No response needed for notifications
			return null;

		case "tools/list":
			return jsonRpcResponse(id, { tools: TOOLS });

		case "tools/call": {
			const toolName = params.name;
			const toolArgs = params.arguments || {};
			// Allow per-call dir override for sprint isolation (sub-sprints in subdirs)
			const effectiveDir = toolArgs.dir ? path.resolve(toolArgs.dir) : dir;

			// Containment check: effectiveDir must be within the server's startup dir
			if (!isInsideDir(effectiveDir, dir)) {
				return jsonRpcResponse(id, {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ error: `Directory outside workspace: ${effectiveDir}` },
								null,
								2,
							),
						},
					],
					isError: true,
				});
			}

			let result;

			switch (toolName) {
				case "wheat/compile":
					result = toolCompile(effectiveDir);
					break;
				case "wheat/add-claim":
					result = toolAddClaim(effectiveDir, toolArgs);
					break;
				case "wheat/resolve":
					result = toolResolve(effectiveDir, toolArgs);
					break;
				case "wheat/search":
					result = toolSearch(effectiveDir, toolArgs);
					break;
				case "wheat/status":
					result = toolStatus(effectiveDir);
					break;
				case "wheat/init":
					result = toolInit(effectiveDir, toolArgs);
					break;
				case "wheat/deepwiki":
					result = await toolDeepwiki(effectiveDir, toolArgs);
					break;
				case "wheat/sync-log":
					result = toolSyncLog(effectiveDir);
					break;
				default:
					return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
			}

			const isError = result.status === "error";
			return jsonRpcResponse(id, {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
				isError,
			});
		}

		case "resources/list":
			return jsonRpcResponse(id, { resources: RESOURCES });

		case "resources/read": {
			const uri = params.uri;
			const paths = resolvePaths(dir);
			let filePath, mimeType;

			switch (uri) {
				case "wheat://compilation":
					filePath = paths.compilation;
					mimeType = "application/json";
					break;
				case "wheat://claims":
					filePath = paths.claims;
					mimeType = "application/json";
					break;
				case "wheat://brief":
					filePath = paths.brief;
					mimeType = "text/html";
					break;
				case "wheat://sync-log":
					filePath = path.join(dir, "output", "sync-log.json");
					mimeType = "application/json";
					break;
				default:
					return jsonRpcError(id, -32602, `Unknown resource: ${uri}`);
			}

			if (!fs.existsSync(filePath)) {
				return jsonRpcResponse(id, {
					contents: [
						{ uri, mimeType, text: `Resource not found: ${filePath}` },
					],
				});
			}

			let text;
			try {
				text = fs.readFileSync(filePath, "utf8");
			} catch (err) {
				return jsonRpcError(
					id,
					-32603,
					`Failed to read resource ${uri}: ${err.message}`,
				);
			}
			return jsonRpcResponse(id, {
				contents: [{ uri, mimeType, text }],
			});
		}

		case "ping":
			return jsonRpcResponse(id, {});

		default:
			// Ignore unknown notifications (no id = notification)
			if (id === undefined || id === null) return null;
			return jsonRpcError(id, -32601, `Method not found: ${method}`);
	}
}

// --- Stdio transport ---------------------------------------------------------

function startServer(dir) {
	const rl = readline.createInterface({
		input: process.stdin,
		terminal: false,
	});

	// Disable output buffering on stdout
	if (process.stdout._handle && process.stdout._handle.setBlocking) {
		process.stdout._handle.setBlocking(true);
	}

	// --- Top-level crash handlers -------------------------------------------
	// Async errors OFF the request path (setTimeout, event emitters, stream
	// errors) bypass the per-request try/catch. Delegate to barn's shared
	// mcp-crash helper so every Grainulation MCP server has identical
	// crash-logging semantics (structured JSON on stderr, exit 1, test hook
	// via BARN_MCP_CRASH_TEST). Registered inside startServer (not at module
	// top) because this file is also exported as a library (@grainulation/
	// wheat/mcp); library consumers should not inherit our exit semantics.
	installCrashHandlers({ service: "wheat", version: SERVER_VERSION });

	rl.on("line", async (line) => {
		if (!line.trim()) return;

		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			const resp = jsonRpcError(null, -32700, "Parse error");
			process.stdout.write(resp + "\n");
			return;
		}

		try {
			const response = await handleRequest(
				dir,
				msg.method,
				msg.params || {},
				msg.id,
			);

			// Notifications don't get responses
			if (response !== null) {
				process.stdout.write(response + "\n");
			}
		} catch (err) {
			const resp = jsonRpcError(
				msg.id ?? null,
				-32603,
				`Internal error: ${err.message}`,
			);
			process.stdout.write(resp + "\n");
		}
	});

	// Keep the server alive — don't exit on stdin close.
	// Claude Code's plugin transport may briefly close/reopen stdin.
	process.stdin.on("end", () => {
		process.exit(0);
	});

	// Log to stderr (stdout is reserved for JSON-RPC)
	process.stderr.write(`wheat MCP server v${SERVER_VERSION} ready on stdio\n`);
	process.stderr.write(`  Target directory: ${dir}\n`);
	process.stderr.write(
		`  Tools: ${TOOLS.length} | Resources: ${RESOURCES.length}\n`,
	);
}

// --- CLI handler -------------------------------------------------------------

export async function run(dir, args) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`wheat mcp -- Local MCP server for Claude Code

Usage:
  wheat-mcp [--dir <path>]      (recommended)
  wheat mcp [--dir <path>]      (legacy, still works)

Install in Claude Code:
  claude mcp add wheat -- npx -y -p @grainulation/wheat wheat-mcp

Tools exposed:
  wheat/compile     Run the compiler
  wheat/add-claim   Append a typed claim
  wheat/resolve     Resolve a conflict
  wheat/search      Search claims
  wheat/status      Sprint status
  wheat/init        Initialize a new sprint
  wheat/deepwiki    Fetch DeepWiki docs for a GitHub repo
  wheat/sync-log    View sync/publish history

Resources exposed:
  wheat://compilation   compilation.json
  wheat://claims        claims.json
  wheat://brief         output/brief.html
  wheat://sync-log      output/sync-log.json

Protocol: MCP over stdio (JSON-RPC 2.0, newline-delimited)`);
		return;
	}

	startServer(dir);
}

export { handleRequest, RESOURCES, startServer, TOOLS };
