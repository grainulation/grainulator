/**
 * mill serve-mcp — Local MCP server for Claude Code
 *
 * Exposes format conversion tools over stdio.
 * Zero npm dependencies.
 *
 * Tools:
 *   mill/convert  — Convert compilation/claims to any of 23+ formats
 *   mill/formats  — List all available export formats
 *   mill/preview  — Preview a conversion without writing to disk
 *
 * Resources:
 *   mill://formats — Full format catalog with descriptions and MIME types
 *
 * Install:
 *   claude mcp add mill -- npx @grainulation/mill serve-mcp
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { jsonRpcError, jsonRpcResponse } = require("../../shared/lib/mcp.cjs");
const { isInsideDir } = require("../../shared/lib/paths.cjs");
const { installCrashHandlers } = require("../../shared/lib/mcp-crash.cjs");

// ─── Constants ──────────────────────────────────────────────────────────────

const SERVER_NAME = "mill";
const SERVER_VERSION = require("../package.json").version;
const { assertSafeOutput } = require("./output-safety.js");
const PROTOCOL_VERSION = "2024-11-05";

const FORMATS_DIR = path.join(__dirname, "formats");

// ─── Format discovery ───────────────────────────────────────────────────────

let _formatCache = null;

async function discoverFormats() {
  if (_formatCache) return _formatCache;

  const formats = [];
  try {
    const files = fs.readdirSync(FORMATS_DIR).filter((f) => f.endsWith(".mjs"));
    for (const file of files) {
      try {
        const mod = await import(path.join(FORMATS_DIR, file));
        formats.push({
          id: file.replace(".mjs", ""),
          name: mod.name || file.replace(".mjs", ""),
          extension: mod.extension || "",
          mimeType: mod.mimeType || "text/plain",
          description: mod.description || "",
          convert: mod.convert,
        });
      } catch (err) {
        process.stderr.write(`mill: skipping ${file}: ${err.message}\n`);
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
      message: `Unknown format: "${format}". Use exports_formats to list available formats.`,
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
    if (fs.existsSync(fallbackFile)) {
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
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (err) {
    return {
      status: "error",
      message: `Failed to parse ${dataPath}: ${err.message}`,
    };
  }

  // Normalize: compilation.json uses resolved_claims, claims.json uses claims
  // Use resolved_claims if claims is missing or empty
  if (data.resolved_claims && (!data.claims || data.claims.length === 0)) {
    data.claims = data.resolved_claims;
  }
  if (data.sprint_meta && !data.meta) {
    data.meta = data.sprint_meta;
  }

  // Merge claim content from claims.json when compilation.json lacks it.
  // Older compilation.json files omitted the content field from resolved_claims.
  const claimsNeedContent =
    data.claims &&
    data.claims.length > 0 &&
    data.claims.some((c) => !c.content && !c.text);
  if (claimsNeedContent) {
    const claimsFile = path.join(dir, "claims.json");
    if (fs.existsSync(claimsFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(claimsFile, "utf8"));
        const fullClaims = raw.claims || [];
        const contentMap = {};
        for (const fc of fullClaims) {
          if (fc.id && fc.content) contentMap[fc.id] = fc;
        }
        for (const claim of data.claims) {
          if (!claim.content && !claim.text && contentMap[claim.id]) {
            claim.content = contentMap[claim.id].content;
            if (
              contentMap[claim.id].confidence != null &&
              claim.confidence == null
            ) {
              claim.confidence = contentMap[claim.id].confidence;
            }
          }
        }
      } catch {
        // Best-effort merge — if claims.json is unreadable, continue without content
      }
    }
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
    try { assertSafeOutput(outPath, [dataPath, path.join(dir, "claims.json"), path.join(dir, "compilation.json")]); }
    catch (error) { return {status: "error", message: error.message}; }
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
    name: "mill/convert",
    description:
      "Convert sprint compilation or claims to any supported format (csv, markdown, json-ld, yaml, sql, ndjson, html-report, executive-summary, slide-deck, jira-csv, github-issues, obsidian, graphml, dot, and more). Returns the converted output inline or writes to a file.",
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
    name: "mill/formats",
    description:
      "List all available export formats with descriptions, file extensions, and MIME types.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mill/preview",
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
    uri: "mill://formats",
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
        case "mill/convert":
          result = await toolConvert(dir, toolArgs);
          break;
        case "mill/formats":
          result = await toolFormats();
          break;
        case "mill/preview":
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
      if (params.uri === "mill://formats") {
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

function startServer(dir) {
  installCrashHandlers({ service: "mill", version: SERVER_VERSION });

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  if (process.stdout._handle && process.stdout._handle.setBlocking) {
    process.stdout._handle.setBlocking(true);
  }

  let pending = 0;
  let closing = false;

  function maybeDrain() {
    if (closing && pending === 0) process.exit(0);
  }

  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(jsonRpcError(null, -32700, "Parse error") + "\n");
      return;
    }
    pending++;
    const response = await handleRequest(
      dir,
      msg.method,
      msg.params || {},
      msg.id,
    );
    if (response !== null) process.stdout.write(response + "\n");
    pending--;
    maybeDrain();
  });

  rl.on("close", () => {
    closing = true;
    maybeDrain();
  });

  process.stderr.write(`mill MCP server v${SERVER_VERSION} ready on stdio\n`);
  process.stderr.write(`  Formats dir: ${FORMATS_DIR}\n`);
  process.stderr.write(
    `  Tools: ${TOOLS.length} | Resources: ${RESOURCES.length}\n`,
  );
}

// ─── Entry point ────────────────────────────────────────────────────────────

if (require.main === module) {
  startServer(process.cwd());
}

async function run(dir) {
  startServer(dir);
}

module.exports = { startServer, handleRequest, TOOLS, RESOURCES, run };
