#!/usr/bin/env node
import type { ExportDocument } from "../lib/export-types.js";

("use strict");

import path = require("node:path");
import fs = require("node:fs");
import importedModule1 = require("node:url");
const { pathToFileURL } = importedModule1;
import importedModule2 = require("node:util");
const { parseArgs } = importedModule2;

import importedModule3 = require("../lib/source-data.js");
const { loadSource } = importedModule3;
import importedModule4 = require("../lib/output-safety.js");
const { assertSafeOutput } = importedModule4;

const LIB_DIR = path.join(__dirname, "..", "lib");

// --version / -v: print version and exit
if (process.argv.includes("--version") || process.argv.includes("-v")) {
	const pkg = require(path.join(__dirname, "..", "package.json"));
	console.log(pkg.version);
	process.exit(0);
}

const verbose = process.argv.includes("--verbose");
function vlog(...a: unknown[]) {
	if (!verbose) return;
	const ts = new Date().toISOString();
	process.stderr.write(`[${ts}] grainulator export: ${a.join(" ")}\n`);
}

const COMMANDS: Record<
	string,
	{ description: string; handler: (args: string[]) => void | Promise<void> }
> = {
	export: {
		description: "Export artifacts to a target format",
		handler: runExport,
	},
	publish: {
		description: "Publish sprint outputs to a destination",
		handler: runPublish,
	},
	convert: {
		description: "Convert between artifact formats",
		handler: runConvert,
	},
	formats: {
		description: "List available export formats",
		handler: runFormats,
	},
	"ci-artifacts": {
		description: "Generate CI artifacts from compilation",
		handler: runCiArtifacts,
	},
};

const USAGE = `
grainulator export -- turn sprint evidence into shareable artifacts

Usage:
  grainulator export export  --format <fmt> <file>           Export artifact to target format
  grainulator export publish --target <dest> <dir>           Publish sprint outputs
  grainulator export convert --from <fmt> --to <fmt> <file>  Convert between formats
  grainulator export formats                                 List available formats
  grainulator export ci-artifacts <file> -o <dir>            Generate evidence artifacts (Markdown, JSON, CSV)

Paths:
  --dir <sprint> resolves relative input and output paths within that directory.
  Absolute paths remain absolute. Compilation and claims JSON are supported.

Export formats:
  json       Complete normalized evidence data, including provenance
  csv        Claims JSON to CSV
  markdown   Evidence data to Markdown (also imports external HTML)
  json-ld    Claims JSON to JSON-LD
  Run grainulator export formats for the complete data format catalog.

Publish targets:
  clipboard  Copy formatted output to system clipboard

Examples:
  grainulator export export --format markdown compilation.json -o brief.md --dir ./sprint
  grainulator export export --format json compilation.json -o evidence.json
  grainulator export export --format csv claims.json
  grainulator export export --format json-ld claims.json -o claims.jsonld
  grainulator export ci-artifacts compilation.json -o ./artifacts
`.trim();

// Preflight predictable target failures without truncating or writing destination bytes.
// This is not a filesystem transaction against concurrent external path changes.
function inspectArtifactTarget(file: string, requireParent = false) {
	let descriptor: number | undefined;
	try {
		descriptor = fs.openSync(
			file,
			fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NONBLOCK,
		);
		const stat = fs.fstatSync(descriptor);
		if (!stat.isFile())
			throw new Error(`Artifact destination is not a regular file: ${file}`);
		return;
	} catch (caughterror) {
		const error: NodeJS.ErrnoException =
			caughterror instanceof Error
				? caughterror
				: new Error(String(caughterror));
		if (error.code !== "ENOENT") throw error;
		if (requireParent) {
			const parent = fs.openSync(
				path.dirname(file),
				fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
			);
			try {
				if (!fs.fstatSync(parent).isDirectory())
					throw new Error(`Artifact parent is not a directory: ${file}`);
				fs.accessSync(path.dirname(file), fs.constants.W_OK);
			} finally {
				fs.closeSync(parent);
			}
		}
		return;
	} finally {
		if (descriptor !== undefined) fs.closeSync(descriptor);
	}
}

function main() {
	const args = process.argv.slice(2);
	if (args[0] === "serve") {
		console.error(
			"The component browser dashboard has been retired. Use the CLI or MCP tools.",
		);
		process.exit(1);
	}

	vlog("startup", `command=${args[0] || "(none)"}`, `cwd=${process.cwd()}`);

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		console.log(USAGE);
		process.exit(0);
	}

	const command = args[0]!;
	const handler = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : null;

	if (command === "help") {
		console.log(USAGE);
		process.exit(0);
	}

	if (!handler) {
		console.error(`grainulator export: unknown command: ${command}`);
		console.error(`Run "grainulator export --help" for usage.`);
		process.exit(1);
	}

	handler.handler(args.slice(1));
}

async function runExport(args: string[]) {
	let values: {
		format?: string;
		output?: string;
		dir?: string;
		json?: boolean;
	};
	let positionals: string[];
	try {
		({ values, positionals } = parseArgs({
			args,
			options: {
				format: { type: "string", short: "f" },
				output: { type: "string", short: "o" },
				dir: { type: "string" },
				json: { type: "boolean", default: false },
			},
			allowPositionals: true,
		}));
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			const flag =
				err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
			console.error(
				`grainulator export: unknown option: ${flag}. Run "grainulator export export --help" for usage.`,
			);
			process.exit(1);
		}
		throw err;
	}

	if (!values.format) {
		const formats: typeof import("../lib/formats.js") = require("../lib/formats.js");
		console.error(
			`grainulator export: missing --format. Options: ${formats.listExportFormats().join(", ")}`,
		);
		process.exit(1);
	}

	const inputFile = positionals[0];
	if (!inputFile) {
		console.error("grainulator export: missing input file.");
		process.exit(1);
	}

	const baseDir = path.resolve(values.dir || ".");
	const inputPath = path.resolve(baseDir, inputFile);
	const format = values.format;
	const outputPath = values.output
		? path.resolve(baseDir, values.output)
		: null;

	const formats: typeof import("../lib/formats.js") = require("../lib/formats.js");
	const exporter = await formats.resolveFormat(format);

	if (!exporter) {
		console.error(`grainulator export: unknown format: ${format}`);
		console.error(`Available: ${formats.listExportFormats().join(", ")}`);
		process.exit(1);
	}

	try {
		const result = await exporter.export(inputPath, outputPath);
		if (values.json) {
			console.log(JSON.stringify(result));
		} else {
			console.log(result.message);
		}
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		if (values.json) {
			console.log(JSON.stringify({ error: err.message }));
		} else {
			console.error(`grainulator export: export failed: ${err.message}`);
		}
		process.exit(1);
	}
}

async function runPublish(args: string[]) {
	let values: {
		target?: string;
		output?: string;
		dir?: string;
		json?: boolean;
	};
	let positionals: string[];
	try {
		({ values, positionals } = parseArgs({
			args,
			options: {
				target: { type: "string", short: "t" },
				output: { type: "string", short: "o" },
				dir: { type: "string" },
				json: { type: "boolean", default: false },
			},
			allowPositionals: true,
		}));
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			const flag =
				err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
			console.error(
				`grainulator export: unknown option: ${flag}. Run "grainulator export publish --help" for usage.`,
			);
			process.exit(1);
		}
		throw err;
	}

	if (!values.target) {
		console.error("grainulator export: missing --target. Options: clipboard");
		process.exit(1);
	}

	const inputDir = positionals[0];
	if (!inputDir) {
		console.error("grainulator export: missing input directory.");
		process.exit(1);
	}

	const baseDir = path.resolve(values.dir || ".");
	const inputPath = path.resolve(baseDir, inputDir);
	const target = values.target;
	const outputPath = values.output
		? path.resolve(baseDir, values.output)
		: null;

	const formats: typeof import("../lib/formats.js") = require("../lib/formats.js");
	const publisher = formats.getPublisher(target);

	if (!publisher) {
		console.error(`grainulator export: unknown target: ${target}`);
		console.error(`Available: ${formats.listPublishTargets().join(", ")}`);
		process.exit(1);
	}

	try {
		const result = await publisher.publish(inputPath, outputPath);
		if (values.json) {
			console.log(JSON.stringify(result));
		} else {
			console.log(result.message);
		}
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		if (values.json) {
			console.log(JSON.stringify({ error: err.message }));
		} else {
			console.error(`grainulator export: publish failed: ${err.message}`);
		}
		process.exit(1);
	}
}

async function runConvert(args: string[]) {
	let values: {
		from?: string;
		to?: string;
		output?: string;
		dir?: string;
		json?: boolean;
	};
	let positionals: string[];
	try {
		({ values, positionals } = parseArgs({
			args,
			options: {
				from: { type: "string" },
				to: { type: "string" },
				output: { type: "string", short: "o" },
				dir: { type: "string" },
				json: { type: "boolean", default: false },
			},
			allowPositionals: true,
		}));
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			const flag =
				err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
			console.error(
				`grainulator export: unknown option: ${flag}. Run "grainulator export convert --help" for usage.`,
			);
			process.exit(1);
		}
		throw err;
	}

	if (!values.from || !values.to) {
		console.error("grainulator export: missing --from and/or --to format.");
		process.exit(1);
	}

	const inputFile = positionals[0];
	if (!inputFile) {
		console.error("grainulator export: missing input file.");
		process.exit(1);
	}

	const baseDir = path.resolve(values.dir || ".");
	const inputPath = path.resolve(baseDir, inputFile);
	const outputPath = values.output
		? path.resolve(baseDir, values.output)
		: null;

	const supportedSources =
		values.to === "markdown" ? ["json", "html"] : ["json"];
	if (!supportedSources.includes(values.from)) {
		console.error(
			`grainulator export: unsupported source format: ${values.from}. Supported for ${values.to}: ${supportedSources.join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}

	// Convert is sugar: detect source, export to target
	const formats: typeof import("../lib/formats.js") = require("../lib/formats.js");
	const exporter = await formats.resolveFormat(values.to);

	if (!exporter) {
		console.error(`grainulator export: unknown target format: ${values.to}`);
		console.error(`Available: ${formats.listExportFormats().join(", ")}`);
		process.exit(1);
	}

	try {
		const result = await exporter.export(inputPath, outputPath);
		if (values.json) {
			console.log(JSON.stringify(result));
		} else {
			console.log(result.message);
		}
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		if (values.json) {
			console.log(JSON.stringify({ error: err.message }));
		} else {
			console.error(`grainulator export: convert failed: ${err.message}`);
		}
		process.exit(1);
	}
}

function runFormats(args: string[]) {
	const jsonMode = (args || []).includes("--json");
	const formats: typeof import("../lib/formats.js") = require("../lib/formats.js");
	if (jsonMode) {
		console.log(
			JSON.stringify({
				export_formats: formats.listExportFormats(),
				publish_targets: formats.listPublishTargets(),
			}),
		);
		return;
	}
	console.log("Export formats:");
	for (const f of formats.listExportFormats()) {
		console.log(`  ${f}`);
	}
	console.log("\nPublish targets:");
	for (const t of formats.listPublishTargets()) {
		console.log(`  ${t}`);
	}
}

async function runCiArtifacts(args: string[]) {
	let values: {
		output?: string;
		dir?: string;
		formats?: string;
		summary?: boolean;
		json?: boolean;
	};
	let positionals: string[];
	try {
		({ values, positionals } = parseArgs({
			args,
			options: {
				output: { type: "string", short: "o" },
				dir: { type: "string" },
				formats: { type: "string", short: "f" },
				summary: { type: "boolean", default: false },
				json: { type: "boolean", default: false },
			},
			allowPositionals: true,
		}));
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			const flag =
				err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
			console.error(
				`grainulator export: unknown option: ${flag}. Run "grainulator export ci-artifacts --help" for usage.`,
			);
			process.exit(1);
		}
		throw err;
	}

	const inputFile = positionals[0];
	if (!inputFile) {
		console.error(
			"grainulator export: missing input file (compilation.json or claims.json).",
		);
		process.exit(1);
	}

	const baseDir = path.resolve(values.dir || ".");
	const inputPath = path.resolve(baseDir, inputFile);
	const outputDir = values.output
		? path.resolve(baseDir, values.output)
		: path.resolve(baseDir, "artifacts");

	// Evidence artifacts remain portable; presentation belongs to consumer tools.
	const defaultFormats = ["markdown", "json", "csv"];
	const requestedFormats = values.formats
		? values.formats.split(",").map((f) => f.trim())
		: defaultFormats;

	// Read and parse input
	let data: ReturnType<typeof loadSource>;
	try {
		data = loadSource(inputPath);
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		console.error(
			`grainulator export: failed to read ${inputPath}: ${err.message}`,
		);
		process.exit(1);
	}

	// Discover ESM formats
	const FORMATS_DIR = path.join(LIB_DIR, "formats");
	const formatFiles = fs
		.readdirSync(FORMATS_DIR)
		.filter((f) => f.endsWith(".mjs"));
	const formatMap: Record<
		string,
		{
			name?: string;
			extension?: string;
			convert: (data: ExportDocument) => string;
		}
	> = {};
	for (const file of formatFiles) {
		try {
			const mod = await import(
				pathToFileURL(path.join(FORMATS_DIR, file)).href
			);
			formatMap[mod.name || file.replace(".mjs", "")] = mod;
		} catch {}
	}

	const unknownFormats = requestedFormats.filter(
		(fmt) => typeof formatMap[fmt]?.convert !== "function",
	);
	if (unknownFormats.length) {
		console.error(
			`grainulator export: unknown format: ${unknownFormats.join(", ")}`,
		);
		process.exit(1);
	}
	// Prepare every conversion and protected target before creating the output directory.
	const prepared: {
		fmt: string;
		output: string;
		outFile: string;
		stagedFile?: string;
	}[] = [];
	try {
		for (const fmt of requestedFormats) {
			const mod = formatMap[fmt]!;
			const output = mod.convert(data);
			const outFile = path.join(outputDir, fmt + (mod.extension || ".txt"));
			assertSafeOutput(outFile, [inputPath]);
			inspectArtifactTarget(outFile);
			prepared.push({ fmt, output, outFile });
		}
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		console.error(
			`grainulator export: artifact preparation failed: ${err.message}`,
		);
		process.exitCode = 1;
		return;
	}
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	let summary:
		| { output: string; outFile: string; stagedFile?: string }
		| undefined;
	try {
		if (values.summary || summaryPath) {
			const output = formatMap.markdown!.convert(data);
			const outFile = path.join(outputDir, "step-summary.md");
			const artifactPaths = prepared.map((item) => item.outFile);
			assertSafeOutput(outFile, [inputPath, ...artifactPaths]);
			if (summaryPath) {
				assertSafeOutput(summaryPath, [inputPath, outFile, ...artifactPaths]);
				inspectArtifactTarget(summaryPath, true);
			}
			inspectArtifactTarget(outFile);
			summary = { output, outFile };
		}
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		console.error(
			`grainulator export: step summary preparation failed: ${err.message}`,
		);
		process.exitCode = 1;
		return;
	}
	fs.mkdirSync(outputDir, { recursive: true });
	const results = [];
	const stage = fs.mkdtempSync(path.join(outputDir, ".grainulator-export-"));
	try {
		const staged = [
			...prepared,
			...(summary ? [{ ...summary, fmt: "markdown" }] : []),
		];
		// Write all bytes privately first. Publication starts only after every stage write succeeds.
		for (const [index, item] of staged.entries()) {
			item.stagedFile = path.join(stage, String(index));
			fs.writeFileSync(item.stagedFile, item.output, {
				flag: "wx",
				mode: 0o600,
			});
		}
		for (const item of staged) {
			// Copy preserves existing destination modes and the CLI's existing artifact-link behavior.
			fs.copyFileSync(item.stagedFile!, item.outFile);
			results.push({
				format: item.fmt,
				file: item.outFile,
				bytes: Buffer.byteLength(item.output),
			});
			vlog(`wrote ${item.fmt} -> ${item.outFile}`);
		}
		if (summaryPath && summary)
			fs.appendFileSync(summaryPath, summary.output + "\n");
	} catch (caughterr) {
		const err: NodeJS.ErrnoException =
			caughterr instanceof Error ? caughterr : new Error(String(caughterr));
		console.error(
			`grainulator export: artifact or step summary publication failed: ${err.message}`,
		);
		process.exitCode = 1;
		return;
	} finally {
		fs.rmSync(stage, { recursive: true, force: true });
	}

	if (values.json) {
		console.log(JSON.stringify({ artifacts: results }));
	} else {
		console.log(
			`grainulator export: generated ${results.length} artifacts in ${outputDir}`,
		);
		for (const r of results) {
			console.log(`  ${r.format}: ${r.file} (${r.bytes} bytes)`);
		}
	}
}

main();
