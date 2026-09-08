/** One public MCP surface; component names remain private compatibility details. */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
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
import { initializeSprint } from "./sprint-init.js";

const version = JSON.parse(
	fs.readFileSync(new URL("../package.json", import.meta.url)),
).version;
const publicName = (name) =>
	name
		.replace(/^wheat\//, "")
		.replace(/^silo\//, "memory_")
		.replace(/^mill\//, "exports_")
		.replaceAll("-", "_");
const publicUri = (uri) =>
	uri
		.replace(/^wheat:\/\//, "grainulator://")
		.replace(/^silo:\/\//, "grainulator://memory/")
		.replace(/^mill:\/\//, "grainulator://exports/");
// Only apply to our static metadata, never to claims, source text, or exported content.
const metadata = (value) =>
	typeof value === "string"
		? value
				.replaceAll("grainulation/wheat", "grainulation/grainulator")
				.replace(/\bwheat\b/gi, "Grainulator")
				.replace(/\bsilo\b/gi, "memory")
				.replace(/\bmill\b/gi, "exports")
		: Array.isArray(value)
			? value.map(metadata)
			: value && typeof value === "object"
				? Object.fromEntries(
						Object.entries(value).map(([key, item]) => [key, metadata(item)]),
					)
				: value;
const components = [
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
		...metadata(tool),
		name: publicName(tool.name),
		...(tool.name === "wheat/init"
			? {
					description:
						"Initialize a sprint with claims.json and compilation.json. Seeds stated constraints. Leaves host settings and Git hooks untouched. Existing sprints require explicit force; the previous ledger is backed up.",
				}
			: {}),
		inputSchema: {
			...metadata(tool.inputSchema),
			properties: {
				...metadata(tool.inputSchema.properties),
				dir: {
					type: "string",
					description:
						"Sprint directory within the configured workspace. Defaults to the startup directory; relative paths are resolved there.",
				},
			},
		},
	})),
);
export const RESOURCES = components.flatMap((component) =>
	component.resources.map((resource) => ({
		...metadata(resource),
		uri: publicUri(resource.uri),
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
				text: JSON.stringify({ status: "error", message: error.message }),
			},
		],
	});
}

export function createHandler({
	dir = process.cwd(),
	memoryDir,
	configurationError,
} = {}) {
	const workspace = path.resolve(dir);
	const memoryRequest = createMemoryHandler({
		storeDir: resolveMemoryDir(memoryDir),
	});
	const tools = new Map();
	const resources = new Map();
	for (const component of components) {
		const handler = component.memory ? memoryRequest : component.handler;
		for (const tool of component.tools) {
			const route = { handler, name: tool.name, component };
			tools.set(publicName(tool.name), route);
			tools.set(tool.name, route); // Hidden aliases for integrations migrating in place.
		}
		for (const resource of component.resources) {
			const route = { handler, uri: resource.uri, component };
			resources.set(publicUri(resource.uri), route);
			resources.set(resource.uri, route);
		}
	}
	return async function handleRequest(method, params = {}, id) {
		if (id === undefined || id === null) return null;
		if (method === "initialize")
			return jsonRpcResponse(id, {
				protocolVersion: "2024-11-05",
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
				const args = params.arguments ?? {};
				if (typeof args !== "object" || Array.isArray(args))
					throw new Error("Tool arguments must be an object.");
				if (args.dir !== undefined && typeof args.dir !== "string")
					throw new Error("dir must be a string.");
				if (
					route.name === "silo/pull" &&
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
				// Check implicit paths as well as explicit file parameters. This protects
				// shared component handlers without rewriting or modifying user data.
				for (const name of [
					"claims.json",
					"compilation.json",
					"output",
					".claude",
					"CLAUDE.md",
					"AGENTS.md",
					"wheat.config.json",
					"grainulator.config.json",
				])
					contained(path.join(target, name), workspace);
				if (route.name === "wheat/sync-log")
					contained(path.join(target, "output", "sync-log.json"), workspace);
				for (const key of route.name.startsWith("mill/")
					? ["source", "output"]
					: route.name.startsWith("silo/")
						? ["from", "into"]
						: [])
					if (args[key] !== undefined) {
						if (typeof args[key] !== "string")
							throw new Error(`${key} must be a string.`);
						contained(path.resolve(target, args[key]), target);
					}
				// init is the one operation that can create the requested sprint directory.
				if (route.name === "wheat/init") {
					const result = initializeSprint(target, args);
					return jsonRpcResponse(id, {
						content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
						isError: result.status === "error",
					});
				}
				const response = await route.handler(
					target,
					method,
					{ ...params, name: route.name, arguments: { ...args, dir: target } },
					id,
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
				if (route.component.handler === evidenceRequest) {
					const files = {
						"wheat://claims": "claims.json",
						"wheat://compilation": "compilation.json",
						"wheat://brief": "output/brief.html",
						"wheat://sync-log": "output/sync-log.json",
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
}

export function startServer(options = {}) {
	const handler = createHandler(options);
	installCrashHandlers({ service: "grainulator", version });
	const input = readline.createInterface({
		input: process.stdin,
		terminal: false,
	});
	// Serialize requests so back-to-back mutations are visible to compilation.
	let queue = Promise.resolve();
	input.on("line", (line) => {
		if (!line.trim()) return;
		queue = queue.then(async () => {
			let message;
			try {
				message = JSON.parse(line);
			} catch {
				process.stdout.write(`${jsonRpcError(null, -32700, "Parse error")}\n`);
				return;
			}
			if (
				!message ||
				typeof message !== "object" ||
				Array.isArray(message) ||
				message.jsonrpc !== "2.0" ||
				typeof message.method !== "string"
			) {
				process.stdout.write(
					`${jsonRpcError(message?.id ?? null, -32600, "Invalid request")}\n`,
				);
				return;
			}
			try {
				const result = await handler(
					message.method,
					message.params || {},
					message.id,
				);
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
		`Grainulator MCP v${version} ready · ${TOOLS.length} tools · ${RESOURCES.length} resources\n`,
	);
}
