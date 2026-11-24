// Generated from typescript/lib/grainulator-mcp.ts; edit that source and run npm run build:types.
/** One public MCP surface with direct canonical capability registrations. */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import {
	handleRequest as evidenceRequest,
	RESOURCES as evidenceResources,
	TOOLS as evidenceTools,
} from "../packages/evidence/lib/serve-mcp.js";
import exportsServer from "../packages/exports/lib/serve-mcp.js";
import {
	createHandler as createMemoryHandler,
	RESOURCES as memoryResources,
	TOOLS as memoryTools,
} from "../packages/memory/lib/serve-mcp.js";
import { resolveMemoryDir } from "../packages/memory/lib/store.js";
import { jsonRpcError, jsonRpcResponse } from "../packages/shared/lib/mcp.js";
import { installCrashHandlers } from "../packages/shared/lib/mcp-crash.js";
import projectConfig from "../packages/shared/lib/project-config.cjs";
import {
	CompactBusinessError,
	callCompact,
	compactTools,
} from "./compact-mcp.js";
import {
	handleRequest as maintenanceRequest,
	TOOLS as maintenanceTools,
} from "./maintenance-mcp.js";
import {
	negotiateProtocolVersion,
	outputSchema,
	supportsStructuredResults,
	withStructuredResult,
} from "./mcp-contracts.js";
import { initializeSprint } from "./sprint-init.js";
import { toolBehavior } from "./tool-behavior.js";
import { validateWorkspace } from "./workspace-config.js";
const isObject = (value) =>
	value !== null && typeof value === "object" && !Array.isArray(value);
const version = JSON.parse(
	fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const components = [
	{ tools: maintenanceTools, resources: [], handler: maintenanceRequest },
	{
		tools: evidenceTools,
		resources: evidenceResources,
		handler: evidenceRequest,
	},
	{ tools: memoryTools, resources: memoryResources, memory: true },
	{
		tools: exportsServer.TOOLS,
		resources: exportsServer.RESOURCES,
		handler: exportsServer.handleRequest,
	},
];
export const TOOLS = components.flatMap((component) =>
	component.tools.map((tool) => ({
		...tool,
		...toolBehavior(tool.name),
		name: tool.name,
		outputSchema: outputSchema(tool.name),
		inputSchema: {
			...tool.inputSchema,
			properties: {
				...tool.inputSchema.properties,
				dir: {
					type: "string",
					description:
						"Sprint directory within the configured workspace. Defaults to the startup directory; relative paths are resolved there.",
				},
			},
		},
	})),
);
export const COMPACT_TOOLS = compactTools(TOOLS);
export const RESOURCES = components.flatMap((component) =>
	component.resources.map((resource) => ({
		...resource,
		uri: resource.uri,
	})),
);
// Resolve the nearest existing ancestor too: /workspace/link/new-file may not
// exist yet even though /workspace/link already points outside the workspace.
function canonical(target, depth = 0) {
	if (depth > 40) throw new Error("Too many symbolic links.");
	const absolute = path.resolve(target);
	try {
		return fs.realpathSync(absolute);
	} catch (error) {
		if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
		try {
			if (fs.lstatSync(absolute).isSymbolicLink())
				return canonical(
					path.resolve(path.dirname(absolute), fs.readlinkSync(absolute)),
					depth + 1,
				);
		} catch (linkError) {
			if (linkError.code !== "ENOENT" && linkError.code !== "ENOTDIR")
				throw linkError;
		}
		const parent = path.dirname(absolute);
		if (parent === absolute) throw error;
		return path.join(canonical(parent, depth), path.basename(absolute));
	}
}
function contained(target, root) {
	const relative = path.relative(canonical(root), canonical(target));
	if (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
		throw new Error(`Path outside workspace: ${target}`);
	return target;
}
function errorResult(id, error) {
	return jsonRpcResponse(id, {
		isError: true,
		content: [
			{
				type: "text",
				text: JSON.stringify({
					status: "error",
					message: error.message,
				}),
			},
		],
	});
}
export function createHandler({
	dir = process.cwd(),
	memoryDir,
	configurationError,
	resolveWorkspace,
	toolset = "legacy",
} = {}) {
	if (!["legacy", "compact"].includes(toolset))
		throw new Error("toolset must be legacy or compact.");
	const selectedTools = toolset === "compact" ? COMPACT_TOOLS : TOOLS;
	let protocolVersion;
	const fixedWorkspace = path.resolve(dir);
	const memoryRequest = createMemoryHandler({
		storeDir: resolveMemoryDir(memoryDir),
	});
	const tools = new Map();
	const resources = new Map();
	for (const component of components) {
		const handler = component.memory ? memoryRequest : component.handler;
		for (const tool of component.tools) {
			const route = { handler, name: tool.name, component };
			tools.set(tool.name, route);
		}
		for (const resource of component.resources) {
			const route = { handler, uri: resource.uri, component };
			resources.set(resource.uri, route);
		}
	}
	const legacyRequest = async function handleLegacyRequest(
		method,
		params = {},
		id,
	) {
		if (id === undefined || id === null) return null;
		if (method === "initialize")
			return jsonRpcResponse(id, {
				protocolVersion: negotiateProtocolVersion(params.protocolVersion),
				capabilities: { tools: {}, resources: {} },
				serverInfo: { name: "grainulator", version },
				instructions:
					"Use add_claim to record evidence and compile to get current next_actions. Present next steps as Auto and Manual bullet lists. Continue authorized Auto work; manual actions require user input or access.",
			});
		if (method === "ping") return jsonRpcResponse(id, {});
		if (method === "tools/list") return jsonRpcResponse(id, { tools: TOOLS });
		if (method === "resources/list")
			return jsonRpcResponse(id, { resources: RESOURCES });
		if (configurationError && method === "tools/call")
			return errorResult(id, new Error(configurationError));
		if (configurationError && method === "resources/read")
			return jsonRpcError(id, -32000, configurationError);
		if (method === "tools/call") {
			const route = tools.get(params.name);
			if (!route)
				return jsonRpcError(id, -32602, `Unknown tool: ${params.name}`);
			try {
				const workspace = resolveWorkspace
					? await resolveWorkspace()
					: fixedWorkspace;
				const args = Object.hasOwn(params, "arguments") ? params.arguments : {};
				if (!isObject(args))
					throw new Error("Tool arguments must be an object.");
				if (Object.hasOwn(args, "workspace"))
					throw new Error("The workspace is fixed by the MCP registration.");
				if (args.dir !== undefined && typeof args.dir !== "string")
					throw new Error("dir must be a string.");
				if (
					route.name === "memory_pull" &&
					args.pack !== undefined &&
					(typeof args.pack !== "string" || /[\\/\0]/.test(args.pack))
				)
					throw new Error(
						"pack must be a collection or knowledge pack name, not a file path.",
					);
				const target = contained(
					path.resolve(workspace, args.dir || "."),
					workspace,
				);
				projectConfig.assertMigrationReady(target, { workspace });
				const selectedConfig = projectConfig.evidenceConfig(target, {
					workspace,
				});
				for (const field of [
					...["output", "research", "prototypes", "evidence", "templates"].map(
						(key) => selectedConfig.dirs[key],
					),
					...["claims", "compilation"].map(
						(key) => selectedConfig.compiler[key],
					),
				])
					contained(path.resolve(selectedConfig.origin, field), workspace);
				// Check implicit paths as well as explicit file parameters. This protects
				// shared component handlers without rewriting or modifying user data.
				for (const name of [
					"claims.json",
					"compilation.json",
					"output",
					".claude",
					"CLAUDE.md",
					"AGENTS.md",
					"grainulator.config.json",
				])
					contained(path.join(target, name), workspace);
				if (route.name === "sync_log")
					contained(path.join(target, "output", "sync-log.json"), workspace);
				for (const key of route.component.handler ===
				exportsServer.handleRequest
					? ["source", "output"]
					: route.component.memory
						? ["from", "into"]
						: [])
					if (args[key] !== undefined) {
						if (typeof args[key] !== "string")
							throw new Error(`${key} must be a string.`);
						contained(path.resolve(target, args[key]), target);
					}
				// init is the one operation that can create the requested sprint directory.
				if (route.name === "init") {
					const result = projectConfig.withProjectScope(workspace, () =>
						initializeSprint(target, args),
					);
					return jsonRpcResponse(id, {
						content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
						isError: result.status === "error",
					});
				}
				const response = await projectConfig.withProjectScope(workspace, () =>
					route.handler(
						target,
						method,
						{
							...params,
							name: route.name,
							arguments: { ...args, dir: target },
						},
						id,
						{ includeAudit: toolset === "compact" && route.name === "search" },
					),
				);
				return response;
			} catch (error) {
				return errorResult(id, error);
			}
		}
		if (method === "resources/read") {
			const route = resources.get(params.uri);
			if (!route)
				return jsonRpcError(id, -32602, `Unknown resource: ${params.uri}`);
			try {
				const workspace = resolveWorkspace
					? await resolveWorkspace()
					: fixedWorkspace;
				if (route.component.handler === evidenceRequest) {
					const files = {
						"grainulator://claims": "claims.json",
						"grainulator://compilation": "compilation.json",
						"grainulator://brief": "output/brief.md",
						"grainulator://sync-log": "output/sync-log.json",
					};
					contained(path.join(workspace, files[route.uri]), workspace);
				}
				const response = JSON.parse(
					await route.handler(
						workspace,
						method,
						{ ...params, uri: route.uri },
						id,
					),
				);
				for (const content of response.result?.contents || [])
					content.uri = params.uri;
				return JSON.stringify(response);
			} catch (error) {
				return jsonRpcError(id, -32602, error.message);
			}
		}
		return jsonRpcError(id, -32601, `Method not found: ${method}`);
	};
	async function handleRequest(method, params = {}, id) {
		if (id === undefined || id === null) return null;
		if (
			!(
				typeof id === "string" ||
				(typeof id === "number" && Number.isInteger(id))
			)
		)
			return jsonRpcError(null, -32600, "Invalid request ID.");
		const requestObject = isObject;
		if (!requestObject(params))
			return jsonRpcError(id, -32602, "Request params must be an object.");
		if (Object.hasOwn(params, "_meta")) {
			const meta = params._meta;
			if (
				!requestObject(meta) ||
				(Object.hasOwn(meta, "progressToken") &&
					!(
						typeof meta.progressToken === "string" ||
						(typeof meta.progressToken === "number" &&
							Number.isInteger(meta.progressToken))
					))
			)
				return jsonRpcError(id, -32602, "Invalid request metadata.");
		}
		if (method === "initialize") {
			const object = isObject;
			if (
				!object(params) ||
				typeof params.protocolVersion !== "string" ||
				!object(params.capabilities) ||
				!object(params.clientInfo) ||
				typeof params.clientInfo.name !== "string" ||
				typeof params.clientInfo.version !== "string"
			)
				return jsonRpcError(
					id,
					-32602,
					"Required initialize fields: protocolVersion (string), capabilities (object), clientInfo (name and version strings).",
				);
			const capabilities = params.capabilities;
			if (
				["roots", "sampling", "elicitation", "experimental"].some(
					(key) =>
						Object.hasOwn(capabilities, key) && !object(capabilities[key]),
				) ||
				(object(capabilities.roots) &&
					Object.hasOwn(capabilities.roots, "listChanged") &&
					typeof capabilities.roots.listChanged !== "boolean") ||
				(object(capabilities.experimental) &&
					Object.values(capabilities.experimental).some(
						(value) => !object(value),
					)) ||
				(Object.hasOwn(params.clientInfo, "title") &&
					typeof params.clientInfo.title !== "string")
			)
				return jsonRpcError(
					id,
					-32602,
					"Invalid initialize capabilities or clientInfo fields.",
				);
			protocolVersion ??= negotiateProtocolVersion(params.protocolVersion);
			const response = JSON.parse(await legacyRequest(method, params, id));
			response.result.protocolVersion = protocolVersion;
			if (toolset === "compact")
				response.result.instructions =
					"Compact profile: evidence, local memory and exports. Use configure_sprint, record_claim and compile_sprint; inspect_sprint is read-only. Network integrations and graph building require the documented CLI or legacy profile. Present next actions as Auto and Manual.";
			return JSON.stringify(response);
		}
		if (method === "tools/list")
			return jsonRpcResponse(id, {
				tools: selectedTools.map((tool) => {
					if (supportsStructuredResults(protocolVersion)) return tool;
					const { outputSchema: _schema, ...legacy } = tool;
					return legacy;
				}),
			});
		if (method === "tools/call") {
			let response;
			if (toolset === "compact") {
				const tool = selectedTools.find(
					(candidate) => candidate.name === params.name,
				);
				if (!tool)
					return jsonRpcError(id, -32602, `Unknown tool: ${params.name}`);
				try {
					const result = await callCompact(
						tool,
						Object.hasOwn(params, "arguments") ? params.arguments : {},
						legacyRequest,
					);
					response = jsonRpcResponse(id, {
						content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
						isError: false,
					});
				} catch (error) {
					response =
						error instanceof CompactBusinessError
							? jsonRpcResponse(id, { ...error.result, isError: true })
							: errorResult(id, error);
				}
			} else response = await legacyRequest(method, params, id);
			return supportsStructuredResults(protocolVersion)
				? withStructuredResult(
						response,
						selectedTools.find((tool) => tool.name === params.name)
							?.outputSchema,
					)
				: response;
		}
		return legacyRequest(method, params, id);
	}
	return handleRequest;
}
// The first file root the agent shares that is an existing directory.
function workspaceFromRoots(result) {
	for (const root of isObject(result) && Array.isArray(result.roots)
		? result.roots
		: []) {
		if (typeof root?.uri !== "string" || !root.uri.startsWith("file:"))
			continue;
		try {
			return validateWorkspace(fileURLToPath(root.uri));
		} catch {}
	}
	return null;
}
/**
 * options.roots asks the agent for its project folder (MCP roots) when no
 * folder was fixed at launch: { fallback: "/abs/dir" } or { error: "message" }
 * for agents that do not share one. Without options.roots, options.dir is used.
 */
export function startServer(options = {}) {
	const { roots, ...handlerOptions } = options;
	const send = (message) =>
		process.stdout.write(`${JSON.stringify(message)}\n`);
	const pending = new Map();
	let nextRequest = 0;
	let initialized = false;
	let clientSharesRoots = false;
	let clientAllowsRootsChanges = false;
	let rootsWorkspace;
	const askClient = (method, params, timeoutMs) =>
		new Promise((resolve, reject) => {
			const id = `grainulator-${++nextRequest}`;
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`${method} timed out`));
			}, timeoutMs);
			pending.set(id, (message) => {
				clearTimeout(timer);
				if (message.error)
					reject(new Error(message.error.message || `${method} failed`));
				else resolve(message.result);
			});
			send({ jsonrpc: "2.0", id, method, params });
		});
	const resolveWorkspace = roots
		? async () => {
				if (clientSharesRoots) {
					rootsWorkspace ??= askClient("roots/list", {}, 5000)
						.then(workspaceFromRoots)
						.catch(() => {
							// Do not wait on every call for an agent that cannot answer.
							clientSharesRoots = false;
							rootsWorkspace = undefined;
							return null;
						});
					const shared = await rootsWorkspace;
					if (shared) return shared;
				}
				if (roots.fallback) return roots.fallback;
				throw new Error(roots.error || "No project folder is configured.");
			}
		: undefined;
	const handler = createHandler({ ...handlerOptions, resolveWorkspace });
	installCrashHandlers({ service: "grainulator", version });
	const input = readline.createInterface({
		input: process.stdin,
		terminal: false,
	});
	// Serialize requests so back-to-back mutations are visible to compilation.
	let queue = Promise.resolve();
	input.on("line", (line) => {
		if (!line.trim()) return;
		let message;
		try {
			message = JSON.parse(line);
		} catch {
			queue = queue.then(() => {
				process.stdout.write(`${jsonRpcError(null, -32700, "Parse error")}\n`);
			});
			return;
		}
		// Replies to our own requests bypass the queue: a tool call may be waiting on them.
		if (
			isObject(message) &&
			message.method === undefined &&
			typeof message.id === "string" &&
			pending.has(message.id)
		) {
			const settle = pending.get(message.id);
			pending.delete(message.id);
			settle({
				...(isObject(message.error) && typeof message.error.message === "string"
					? { error: { message: message.error.message } }
					: message.error
						? { error: {} }
						: {}),
				result: message.result,
			});
			return;
		}
		const request = message;
		queue = queue.then(async () => {
			const message = request;
			if (
				!isObject(message) ||
				message.jsonrpc !== "2.0" ||
				typeof message.method !== "string"
			) {
				process.stdout.write(
					`${jsonRpcError(isObject(message) ? (message.id ?? null) : null, -32600, "Invalid request")}\n`,
				);
				return;
			}
			try {
				if (
					message.method === "notifications/roots/list_changed" &&
					message.id === undefined
				) {
					const params = message.params;
					const validParams =
						params === undefined ||
						(isObject(params) &&
							(!Object.hasOwn(params, "_meta") ||
								(isObject(params._meta) &&
									(!Object.hasOwn(params._meta, "progressToken") ||
										typeof params._meta.progressToken === "string" ||
										(typeof params._meta.progressToken === "number" &&
											Number.isInteger(params._meta.progressToken))))));
					if (clientAllowsRootsChanges && validParams) {
						clientSharesRoots = true;
						rootsWorkspace = undefined;
					}
					return;
				}
				const result = await handler(
					message.method,
					message.params,
					message.id,
				);
				if (
					message.method === "initialize" &&
					!initialized &&
					result !== null &&
					JSON.parse(result).result &&
					isObject(message.params) &&
					isObject(message.params.capabilities)
				) {
					initialized = true;
					clientSharesRoots = Object.hasOwn(
						message.params.capabilities,
						"roots",
					);
					clientAllowsRootsChanges =
						clientSharesRoots &&
						isObject(message.params.capabilities.roots) &&
						message.params.capabilities.roots.listChanged === true;
				}
				if (result !== null) process.stdout.write(`${result}\n`);
			} catch (error) {
				if (message.id !== undefined)
					process.stdout.write(
						`${jsonRpcError(message.id, -32603, error.message)}\n`,
					);
			}
		});
	});
	input.on("close", () => {
		queue.then(() => {
			process.exitCode = 0;
		});
	});
	process.stderr.write(
		`Grainulator MCP v${version} ready · ${options.toolset === "compact" ? COMPACT_TOOLS.length : TOOLS.length} tools · ${RESOURCES.length} resources\n`,
	);
}
