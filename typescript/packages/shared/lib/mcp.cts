/**
 * mcp.cjs — CommonJS mirror of lib/mcp.js for CJS consumers.
 * Keep in sync with mcp.js (same API surface).
 */

function jsonRpcResponse(id: unknown, result: unknown) {
	return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(
	id: unknown,
	code: number,
	message: string,
	data?: unknown,
) {
	const err: { code: number; message: string; data?: unknown } = {
		code,
		message,
	};
	if (data !== undefined) err.data = data;
	return JSON.stringify({ jsonrpc: "2.0", id, error: err });
}

const JSON_RPC_ERRORS = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
};

function parseJsonRpc(line: string | null | undefined): unknown {
	if (!line || !line.trim()) return null;
	return JSON.parse(line);
}

function buildInitializeResult({
	protocolVersion = "2024-11-05",
	serverName,
	serverVersion,
	tools = {},
	resources = {},
	prompts,
}: {
	protocolVersion?: string;
	serverName?: string;
	serverVersion?: string;
	tools?: unknown;
	resources?: unknown;
	prompts?: unknown;
} = {}) {
	const capabilities: {
		tools: unknown;
		resources: unknown;
		prompts?: unknown;
	} = { tools, resources };
	if (prompts !== undefined) capabilities.prompts = prompts;
	return {
		protocolVersion,
		capabilities,
		serverInfo: { name: serverName, version: serverVersion },
	};
}

export = {
	jsonRpcResponse,
	jsonRpcError,
	JSON_RPC_ERRORS,
	parseJsonRpc,
	buildInitializeResult,
};
