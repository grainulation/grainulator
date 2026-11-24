// Generated from typescript/packages/exports/lib/serve-mcp.ts; edit that source and run npm run build:types.
"use strict";
/** Private Grainulator exports MCP handlers; only the root server owns stdio/discovery. */
const fs = require("node:fs");
const path = require("node:path");
const importedModule1 = require("node:url");
const { pathToFileURL } = importedModule1;
const importedModule2 = require("../../shared/lib/mcp.cjs");
const { jsonRpcError, jsonRpcResponse } = importedModule2;
const importedModule3 = require("../../shared/lib/paths.cjs");
const { isInsideDir } = importedModule3;
// ─── Constants ──────────────────────────────────────────────────────────────
const SERVER_NAME = "grainulator";
const SERVER_VERSION = require("../package.json").version;
const importedModule4 = require("./output-safety.js");
const { assertSafeOutput } = importedModule4;
const importedModule5 = require("./source-data.js");
const { loadSource } = importedModule5;
const projectConfig = require("../../shared/lib/project-config.cjs");
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
				const mod = await import(
					pathToFileURL(path.join(FORMATS_DIR, file)).href
				);
				formats.push({
					id: file.replace(".mjs", ""),
					name: mod.name || file.replace(".mjs", ""),
					extension: mod.extension || "",
					mimeType: mod.mimeType || "text/plain",
					description: mod.description || "",
					convert: mod.convert,
				});
			} catch (caughterr) {
				const err =
					caughterr instanceof Error ? caughterr : new Error(String(caughterr));
				process.stderr.write(`exports: skipping ${file}: ${err.message}\n`);
			}
		}
	} catch {}
	_formatCache = formats;
	return formats;
}
// ─── Tool implementations ───────────────────────────────────────────────────
async function toolConvert(dir, args, previewLines) {
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
	// The same canonical evidence configuration selects the compiler and exports.
	let configured;
	try {
		configured = projectConfig.evidenceConfig(dir);
	} catch (caughterror) {
		const error =
			caughterror instanceof Error
				? caughterror
				: new Error(String(caughterror));
		return { status: "error", message: error.message };
	}
	const compilationFile = path.resolve(
		configured.origin,
		configured.compiler.compilation,
	);
	const fallbackFile = path.resolve(
		configured.origin,
		configured.compiler.claims,
	);
	const sourceFile = source ? path.resolve(dir, source) : compilationFile;
	// Explicit and implicit source paths retain the existing sprint boundary.
	if (!isInsideDir(sourceFile, dir)) {
		return {
			status: "error",
			message: "Source path escapes workspace directory.",
		};
	}
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
	} catch (caughterr) {
		const err =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		return { status: "error", message: err.message };
	}
	// Run conversion
	let result;
	try {
		result = fmt.convert(data);
	} catch (caughterr) {
		const err =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		return { status: "error", message: `Conversion failed: ${err.message}` };
	}
	if (previewLines !== undefined) {
		const outputLines = result.split("\n");
		const selected = outputLines.slice(0, previewLines).join("\n");
		const truncated = selected.length > 10000;
		const preview = selected.slice(0, 10000);
		return {
			status: "ok",
			format: fmt.id,
			preview,
			totalLines: outputLines.length,
			showing: Math.min(previewLines, preview.split("\n").length),
			hasMore: outputLines.length > previewLines || truncated,
			truncated,
		};
	}
	// Write output if path provided
	if (output) {
		const outPath = path.resolve(dir, output);
		try {
			assertSafeOutput(outPath, [dataPath, fallbackFile, compilationFile], {
				workspace: args.workspace,
			});
		} catch (caughterror) {
			const error =
				caughterror instanceof Error
					? caughterror
					: new Error(String(caughterror));
			return { status: "error", message: error.message };
		}
		// Prevent path traversal — output must stay within workspace
		if (!isInsideDir(outPath, dir)) {
			return {
				status: "error",
				message: `Output path "${output}" escapes workspace directory.`,
			};
		}
		try {
			fs.mkdirSync(path.dirname(outPath), { recursive: true });
			fs.writeFileSync(outPath, result);
		} catch (caughterror) {
			const error =
				caughterror instanceof Error
					? caughterror
					: new Error(String(caughterror));
			return {
				status: "error",
				message: `Cannot write export to ${outPath}: ${error.message}`,
			};
		}
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
	const maxLines = lines === undefined ? 30 : lines;
	if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 200) {
		return {
			status: "error",
			message: "lines must be an integer from 1 to 200.",
		};
	}
	// Bound the preview after selecting lines from the full conversion, preserving honest totals.
	return toolConvert(dir, { format, source }, maxLines);
}
// ─── Tool & Resource definitions ────────────────────────────────────────────
const TOOLS = [
	{
		name: "exports_convert",
		description:
			'Convert local claims or compilation JSON to a supported evidence format; returns bounded inline output or a saved outputPath with full byte length. Saving may replace an allowed artifact; evidence and host configuration are protected. Invalid formats, missing sources or unsafe/unwritable paths return errors. Use exports_formats to discover IDs or exports_preview to inspect without writes. Example: {"format":"markdown","output":"output/brief.md"}.',
		inputSchema: {
			type: "object",
			properties: {
				format: {
					type: "string",
					description:
						"Required format ID returned by exports_formats, for example markdown, json or csv. Unknown IDs return an error; matching is case-sensitive.",
					examples: ["markdown", "json", "csv"],
				},
				source: {
					type: "string",
					description:
						"Optional source JSON path confined to the selected sprint, relative to dir unless absolute. Omission tries configured compilation then configured claims only when compilation is missing. An explicit missing path never falls back.",
					examples: ["claims.json"],
				},
				output: {
					type: "string",
					description:
						"Optional allowed artifact path within the selected sprint, relative to dir unless absolute. Saving returns outputPath and bytes and may replace an existing artifact. Omit for bounded inline text; protected evidence/configuration cannot be overwritten.",
					examples: ["output/brief.md"],
				},
			},
			required: ["format"],
			description:
				"Arguments for exports_convert. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					format: "markdown",
					output: "output/brief.md",
				},
			],
		},
	},
	{
		name: "exports_formats",
		description:
			"List available local export formats with IDs, names, extensions, MIME types and descriptions; returns formats and count. Read-only: no conversion, output files or network. Use a returned ID with exports_preview or exports_convert. Example: {}.",
		inputSchema: {
			type: "object",
			properties: {},
			description:
				"Arguments for exports_formats. Paths resolve within the selected sprint unless described otherwise.",
			examples: [{}],
		},
	},
	{
		name: "exports_preview",
		description:
			'Render a bounded preview of local sprint data without writing an artifact or publishing. Returns preview, full totalLines, showing, hasMore and truncated; truncation may shorten a long line. Invalid formats, missing sources or lines outside 1..200 return errors. Use exports_formats for IDs or exports_convert with output for a complete file. Example: {"format":"markdown","lines":20}.',
		inputSchema: {
			type: "object",
			properties: {
				format: {
					type: "string",
					description:
						"Required format ID returned by exports_formats, for example markdown, json or csv. Unknown IDs return an error; matching is case-sensitive.",
					examples: ["markdown", "json", "csv"],
				},
				source: {
					type: "string",
					description:
						"Optional source JSON path confined to the selected sprint, relative to dir unless absolute. Omission tries configured compilation then configured claims only when compilation is missing. An explicit missing path never falls back.",
					examples: ["claims.json"],
				},
				lines: {
					type: "integer",
					minimum: 1,
					maximum: 200,
					description:
						"Maximum preview lines, an integer from 1 through 200; omission uses 30. A separate text cap can shorten a line, so inspect truncated and hasMore.",
					examples: [20],
					default: 30,
				},
			},
			required: ["format"],
			description:
				"Arguments for exports_preview. Paths resolve within the selected sprint unless described otherwise.",
			examples: [
				{
					format: "markdown",
					lines: 20,
				},
			],
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
module.exports = { handleRequest, TOOLS, RESOURCES };
