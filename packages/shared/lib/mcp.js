/**
 * MCP JSON-RPC helpers — shared across wheat, mill, silo MCP servers.
 *
 * Implements the MCP protocol's JSON-RPC 2.0 envelope so each server doesn't
 * re-invent jsonRpcResponse / jsonRpcError.
 *
 * Usage (ESM):
 *   import { jsonRpcResponse, jsonRpcError, readLineJson } from "./mcp.js";
 *
 * Protocol: MCP over stdio, newline-delimited JSON-RPC 2.0.
 */

/** Serialize a JSON-RPC 2.0 success response. */
export function jsonRpcResponse(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

/** Serialize a JSON-RPC 2.0 error response. */
export function jsonRpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return JSON.stringify({ jsonrpc: "2.0", id, error: err });
}

/**
 * Standard JSON-RPC 2.0 error codes.
 * See https://www.jsonrpc.org/specification#error_object
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

/**
 * Parse a single JSON-RPC message from a string. Returns a parsed object or
 * null if the line is empty/whitespace. Throws on invalid JSON.
 */
export function parseJsonRpc(line) {
  if (!line || !line.trim()) return null;
  return JSON.parse(line);
}

/**
 * Build a basic initialize response (for MCP servers). Each server fills in
 * serverInfo and capabilities; this just wraps the envelope.
 */
export function buildInitializeResult({
  protocolVersion = "2024-11-05",
  serverName,
  serverVersion,
  tools = {},
  resources = {},
  prompts,
} = {}) {
  const capabilities = { tools, resources };
  if (prompts !== undefined) capabilities.prompts = prompts;
  return {
    protocolVersion,
    capabilities,
    serverInfo: { name: serverName, version: serverVersion },
  };
}
