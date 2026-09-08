#!/usr/bin/env node

"use strict";

const path = require("node:path");
const { parseArgs } = require("node:util");
const { fork } = require("node:child_process");

const { loadSource } = require("../lib/source-data.js");
const { assertSafeOutput } = require("../lib/output-safety.js");

const LIB_DIR = path.join(__dirname, "..", "lib");

// --version / -v: print version and exit
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const pkg = require(path.join(__dirname, "..", "package.json"));
  console.log(pkg.version);
  process.exit(0);
}

const verbose = process.argv.includes("--verbose");
function vlog(...a) {
  if (!verbose) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] grainulator export: ${a.join(" ")}\n`);
}

const COMMANDS = {
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
  serve: { description: "Start the export workbench UI", handler: runServe },
  "serve-mcp": { description: "Start the MCP server on stdio", handler: null },
};

const USAGE = `
grainulator export -- turn sprint evidence into shareable artifacts

Usage:
  grainulator export serve   [--port 9094] [--source <dir>]  Start the export workbench UI
  grainulator export serve-mcp                               Start the MCP server on stdio
  grainulator export export  --format <fmt> <file>           Export artifact to target format
  grainulator export publish --target <dest> <dir>           Publish sprint outputs
  grainulator export convert --from <fmt> --to <fmt> <file>  Convert between formats
  grainulator export formats                                 List available formats
  grainulator export ci-artifacts <file> -o <dir>            Generate CI artifacts (report, summary, slides)

Paths:
  --dir <sprint> resolves relative input and output paths within that directory.
  Absolute paths remain absolute. Compilation and claims JSON are supported.

Export formats:
  pdf        HTML or Markdown to PDF (via npx md-to-pdf)
  csv        Claims JSON to CSV
  markdown   HTML artifacts to clean Markdown
  json-ld    Claims JSON to JSON-LD for semantic web

Publish targets:
  static     Generate a static site from sprint outputs
  clipboard  Copy formatted output to system clipboard

Examples:
  grainulator export serve --port 9094 --source /path/to/sprint
  grainulator export export --format pdf output/brief.html
  grainulator export export --format executive-summary compilation.json -o brief.html --dir ./sprint
  grainulator export export --format csv claims.json
  grainulator export export --format json-ld claims.json -o claims.jsonld
  grainulator export publish --target static output/
  grainulator export convert --from html --to markdown output/brief.html
  grainulator export ci-artifacts compilation.json -o ./artifacts
`.trim();

function main() {
  const args = process.argv.slice(2);

  vlog("startup", `command=${args[0] || "(none)"}`, `cwd=${process.cwd()}`);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args[0];
  const handler = COMMANDS[command];

  if (command === "help") {
    console.log(USAGE);
    process.exit(0);
  }

  // serve command forks the ESM server module
  if (command === "serve") {
    runServe(args.slice(1));
    return;
  }

  // serve-mcp command starts the MCP server on stdio
  if (command === "serve-mcp") {
    const serveMcp = require("../lib/serve-mcp.js");
    serveMcp.run(process.cwd());
    return;
  }

  if (!handler) {
    console.error(`grainulator export: unknown command: ${command}`);
    console.error(`Run "grainulator export --help" for usage.`);
    process.exit(1);
  }

  handler.handler(args.slice(1));
}

async function runExport(args) {
  let values, positionals;
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
  } catch (err) {
    if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      const flag = err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
      console.error(
        `grainulator export: unknown option: ${flag}. Run "grainulator export export --help" for usage.`,
      );
      process.exit(1);
    }
    throw err;
  }

  if (!values.format) {
    const formats = require("../lib/formats.js");
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
  const outputPath = values.output ? path.resolve(baseDir, values.output) : null;

  const formats = require("../lib/formats.js");
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
  } catch (err) {
    if (values.json) {
      console.log(JSON.stringify({ error: err.message }));
    } else {
      console.error(`grainulator export: export failed: ${err.message}`);
    }
    process.exit(1);
  }
}

async function runPublish(args) {
  let values, positionals;
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
  } catch (err) {
    if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      const flag = err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
      console.error(
        `grainulator export: unknown option: ${flag}. Run "grainulator export publish --help" for usage.`,
      );
      process.exit(1);
    }
    throw err;
  }

  if (!values.target) {
    console.error("grainulator export: missing --target. Options: static, clipboard");
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
  const outputPath = values.output ? path.resolve(baseDir, values.output) : null;

  const formats = require("../lib/formats.js");
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
  } catch (err) {
    if (values.json) {
      console.log(JSON.stringify({ error: err.message }));
    } else {
      console.error(`grainulator export: publish failed: ${err.message}`);
    }
    process.exit(1);
  }
}

async function runConvert(args) {
  let values, positionals;
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
  } catch (err) {
    if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      const flag = err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
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
  const outputPath = values.output ? path.resolve(baseDir, values.output) : null;

  // Convert is sugar: detect source, export to target
  const formats = require("../lib/formats.js");
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
  } catch (err) {
    if (values.json) {
      console.log(JSON.stringify({ error: err.message }));
    } else {
      console.error(`grainulator export: convert failed: ${err.message}`);
    }
    process.exit(1);
  }
}

function runFormats(args) {
  const jsonMode = (args || []).includes("--json");
  const formats = require("../lib/formats.js");
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

async function runCiArtifacts(args) {
  const fs = require("node:fs");

  let values, positionals;
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
  } catch (err) {
    if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      const flag = err.message.match(/option ['"]([^'"]+)['"]/i)?.[1] || err.message;
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

  // Default CI formats: the three HTML formats plus markdown for step summary
  const defaultFormats = ["html-report", "executive-summary", "slide-deck"];
  const requestedFormats = values.formats
    ? values.formats.split(",").map((f) => f.trim())
    : defaultFormats;

  // Read and parse input
  let data;
  try {
    data = loadSource(inputPath);
  } catch (err) {
    console.error(`grainulator export: failed to read ${inputPath}: ${err.message}`);
    process.exit(1);
  }

  // Create output dir
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Discover ESM formats
  const FORMATS_DIR = path.join(LIB_DIR, "formats");
  const formatFiles = fs
    .readdirSync(FORMATS_DIR)
    .filter((f) => f.endsWith(".mjs"));
  const formatMap = {};
  for (const file of formatFiles) {
    try {
      const mod = await import(path.join(FORMATS_DIR, file));
      formatMap[mod.name || file.replace(".mjs", "")] = mod;
    } catch {}
  }

  const results = [];

  for (const fmt of requestedFormats) {
    const mod = formatMap[fmt];
    if (!mod || typeof mod.convert !== "function") {
      console.error(`grainulator export: unknown format: ${fmt}`);
      continue;
    }

    try {
      const output = mod.convert(data);
      const ext = mod.extension || ".txt";
      const outFile = path.join(outputDir, fmt + ext);
      assertSafeOutput(outFile, [inputPath]);
      fs.writeFileSync(outFile, output);
      results.push({
        format: fmt,
        file: outFile,
        bytes: Buffer.byteLength(output),
      });
      vlog(`wrote ${fmt} -> ${outFile}`);
    } catch (err) {
      console.error(`grainulator export: ${fmt} conversion failed: ${err.message}`);
    }
  }

  // Generate step summary (markdown) if --summary or GITHUB_STEP_SUMMARY is set
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (values.summary || summaryPath) {
    const mdMod = formatMap["markdown"];
    if (mdMod && typeof mdMod.convert === "function") {
      try {
        const md = mdMod.convert(data);
        if (summaryPath) {
          assertSafeOutput(summaryPath, [inputPath]);
          fs.appendFileSync(summaryPath, md + "\n");
          vlog("appended markdown to GITHUB_STEP_SUMMARY");
        }
        // Also write to output dir
        const mdFile = path.join(outputDir, "step-summary.md");
        assertSafeOutput(mdFile, [inputPath]);
        fs.writeFileSync(mdFile, md);
        results.push({
          format: "markdown",
          file: mdFile,
          bytes: Buffer.byteLength(md),
        });
      } catch (err) {
        console.error(`grainulator export: step summary generation failed: ${err.message}`);
      }
    }
  }

  if (values.json) {
    console.log(JSON.stringify({ artifacts: results }));
  } else {
    console.log(`grainulator export: generated ${results.length} artifacts in ${outputDir}`);
    for (const r of results) {
      console.log(`  ${r.format}: ${r.file} (${r.bytes} bytes)`);
    }
  }
}

function runServe(args) {
  const fs = require("node:fs");
  const serverPath = path.join(LIB_DIR, "server.js");
  if (!fs.existsSync(serverPath)) {
    console.error(
      "grainulator export: bundled workbench server is missing. Run grainulator doctor to check this installation.",
    );
    process.exit(1);
  }
  const child = fork(serverPath, args, { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  process.on("SIGINT", () => child.kill("SIGINT"));
}

main();
