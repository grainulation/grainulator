/** Private Grainulator exports MCP handlers; only the root server owns stdio/discovery. */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("node:url");
const { jsonRpcError, jsonRpcResponse } = require("../../shared/lib/mcp.cjs");
const { isInsideDir } = require("../../shared/lib/paths.cjs");

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVER_NAME = "grainulator";
const SERVER_VERSION = require("../package.json").version;
const { assertSafeOutput } = require("./output-safety.js");
const { loadSource } = require("./source-data.js");
const PROTOCOL_VERSION = "2024-11-05";

const FORMATS_DIR = path.join(__dirname, "formats");

// ─── Format discovery ───────────────────────────────────────────────────────

let _formatCache = null;

async function discoverFormats() {
  if (_formatCache) return _formatCache;

  const formats = [];
  try {
    const files = fs
      .readdirSync(FORMATS_DIR)
      .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"));
    for (const file of files) {
      try {
        const mod = await import(pathToFileURL(path.join(FORMATS_DIR, file)).href);
        formats.push({
          id: file.replace(".mjs", ""),
          name: mod.name || file.replace(".mjs", ""),
          extension: mod.extension || "",
          mimeType: mod.mimeType || "text/plain",
          description: mod.description || "",
          convert: mod.convert,
        });
      } catch (err) {
        process.stderr.write(`exports: skipping ${file}: ${err.message}\n`);
      }
    }
  } catch {}

  _formatCache = formats;
  return formats;
}

// ─── Tool implementations ───────────────────────────────────────────────────

async function toolConvert(dir, args) {
  const { format, source, output } = args;
  if (!format) {
    return {
      status: "error",
      message: 'Required field: format (e.g., "csv", "markdown", "json-ld")',
    };
  }

  const formats = await discoverFormats();
  const fmt = formats.find((f) => f.id === format || f.name === format);
  if (!fmt) {
    return {
      status: "error",
      message: `Unknown format: "${format}". Read grainulator://exports/formats to list available formats.`,
    };
  }
  if (!fmt.convert) {
    return {
      status: "error",
      message: `Format "${format}" does not have a convert function.`,
    };
  }

  // Resolve source file
  const sourceFile = source
    ? path.resolve(dir, source)
    : path.join(dir, "compilation.json");
  // Prevent path traversal — source must stay within workspace
  if (!isInsideDir(sourceFile, dir)) {
    return {
      status: "error",
      message: `Source path escapes workspace directory.`,
    };
  }
  const fallbackFile = path.join(dir, "claims.json");
  let dataPath = sourceFile;

  if (!fs.existsSync(dataPath)) {
    if (
      !source &&
      isInsideDir(fallbackFile, dir) &&
      fs.existsSync(fallbackFile)
    ) {
      dataPath = fallbackFile;
    } else {
      return {
        status: "error",
        message: `No source file found. Tried: ${sourceFile}, ${fallbackFile}`,
      };
    }
  }

  let data;
  try {
    data = loadSource(dataPath);
  } catch (err) {
    return { status: "error", message: err.message };
  }

  // Run conversion
  let result;
  try {
    result = fmt.convert(data);
  } catch (err) {
    return { status: "error", message: `Conversion failed: ${err.message}` };
  }

  // Write output if path provided
  if (output) {
    const outPath = path.resolve(dir, output);
    try {
      assertSafeOutput(outPath, [
        dataPath,
        path.join(dir, "claims.json"),
        path.join(dir, "compilation.json"),
      ],{workspace:args.workspace});
    } catch (error) {
      return { status: "error", message: error.message };
    }
    // Prevent path traversal — output must stay within workspace
    if (!isInsideDir(outPath, dir)) {
      return {
        status: "error",
        message: `Output path "${output}" escapes workspace directory.`,
      };
    }
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, result);
    return {
      status: "ok",
      message: `Converted to ${format}. Written to ${outPath}`,
      format: fmt.id,
      outputPath: outPath,
      bytes: Buffer.byteLength(result),
    };
  }

  // Return inline (truncate large outputs)
  const maxLen = 10000;
  const truncated = result.length > maxLen;
  return {
    status: "ok",
    format: fmt.id,
    mimeType: fmt.mimeType,
    output: truncated
      ? result.slice(0, maxLen) +
        "\n\n... (truncated, use output parameter to write full file)"
      : result,
    bytes: Buffer.byteLength(result),
    truncated,
  };
}

async function toolFormats() {
  const formats = await discoverFormats();
  return {
    status: "ok",
    count: formats.length,
    formats: formats.map((f) => ({
      id: f.id,
      name: f.name,
      extension: f.extension,
      mimeType: f.mimeType,
      description: f.description,
    })),
  };
}

async function toolPreview(dir, args) {
  const { format, source, lines } = args;
  if (!format) {
    return { status: "error", message: "Required field: format" };
  }

  // Run the same conversion but only return first N lines
  const result = await toolConvert(dir, { format, source });
  if (result.status === "error") return result;

  const maxLines = lines || 30;
  const outputLines = (result.output || "").split("\n");
  const preview = outputLines.slice(0, maxLines).join("\n");
  const hasMore = outputLines.length > maxLines;

  return {
    status: "ok",
    format: result.format,
    preview,
    totalLines: outputLines.length,
    showing: Math.min(maxLines, outputLines.length),
    hasMore,
  };
}

// ─── Tool & Resource definitions ────────────────────────────────────────────

const TOOLS = [
  {
    name: "exports_convert",
    description:
      "Convert sprint compilation or claims to any supported format (csv, markdown, json-ld, yaml, sql, ndjson, json, jira-csv, github-issues, obsidian, graphml, dot, and more). Returns the converted output inline or writes to a file.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          description:
            'Target format ID (e.g., "csv", "markdown", "json-ld", "yaml", "sql", "obsidian")',
        },
        source: {
          type: "string",
          description:
            "Source file path (default: ./compilation.json, falls back to ./claims.json)",
        },
        output: {
          type: "string",
          description: "Output file path. If omitted, returns content inline.",
        },
      },
      required: ["format"],
    },
  },
  {
    name: "exports_formats",
    description:
      "List all available export formats with descriptions, file extensions, and MIME types.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "exports_preview",
    description:
      "Preview a format conversion — shows first N lines without writing to disk.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", description: "Target format ID" },
        source: {
          type: "string",
          description: "Source file path (default: ./compilation.json)",
        },
        lines: {
          type: "number",
          description: "Number of lines to preview (default: 30)",
        },
      },
      required: ["format"],
    },
  },
];

const RESOURCES = [
  {
    uri: "grainulator://exports/formats",
    name: "Format Catalog",
    description:
      "All available export formats with descriptions, extensions, and MIME types.",
    mimeType: "application/json",
  },
];

// ─── Request handler ────────────────────────────────────────────────────────

async function handleRequest(dir, method, params, id) {
  switch (method) {
    case "initialize":
      return jsonRpcResponse(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case "notifications/initialized":
      return null;

    case "tools/list":
      return jsonRpcResponse(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params.name;
      const toolArgs = params.arguments || {};
      let result;

      switch (toolName) {
        case "exports_convert":
          result = await toolConvert(dir, toolArgs);
          break;
        case "exports_formats":
          result = await toolFormats();
          break;
        case "exports_preview":
          result = await toolPreview(dir, toolArgs);
          break;
        default:
          return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
      }

      return jsonRpcResponse(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: result.status === "error",
      });
    }

    case "resources/list":
      return jsonRpcResponse(id, { resources: RESOURCES });

    case "resources/read": {
      if (params.uri === "grainulator://exports/formats") {
        const formats = await discoverFormats();
        const text = JSON.stringify(
          formats.map((f) => ({
            id: f.id,
            name: f.name,
            extension: f.extension,
            mimeType: f.mimeType,
            description: f.description,
          })),
          null,
          2,
        );
        return jsonRpcResponse(id, {
          contents: [{ uri: params.uri, mimeType: "application/json", text }],
        });
      }
      return jsonRpcError(id, -32602, `Unknown resource: ${params.uri}`);
    }

    case "ping":
      return jsonRpcResponse(id, {});

    default:
      if (id === undefined || id === null) return null;
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ─── Stdio transport ────────────────────────────────────────────────────────

module.exports = { handleRequest, TOOLS, RESOURCES };
