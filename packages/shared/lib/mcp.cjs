/**
 * mcp.cjs — CommonJS mirror of lib/mcp.js for CJS consumers.
 * Keep in sync with mcp.js (same API surface).
 */

"use strict";

function jsonRpcResponse(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id, code, message, data) {
  const err = { code, message };
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

function parseJsonRpc(line) {
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
} = {}) {
  const capabilities = { tools, resources };
  if (prompts !== undefined) capabilities.prompts = prompts;
  return {
    protocolVersion,
    capabilities,
    serverInfo: { name: serverName, version: serverVersion },
  };
}

module.exports = {
  jsonRpcResponse,
  jsonRpcError,
  JSON_RPC_ERRORS,
  parseJsonRpc,
  buildInitializeResult,
};
