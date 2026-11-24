"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");

const MILL = path.join(__dirname, "..", "bin", "exports.js");
const FIXTURES = path.join(__dirname, "fixtures");

let tmpDir;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mill-test-"));

  // Create fixture directory
  if (!fs.existsSync(FIXTURES)) {
    fs.mkdirSync(FIXTURES, { recursive: true });
  }

  // Create a test claims.json
  const claims = [
    {
      id: "r001",
      type: "factual",
      text: "Node.js has built-in HTTP module",
      confidence: 0.95,
      evidence: { tier: "documented", source: "nodejs.org" },
      status: "active",
      created: "2026-01-15",
      tags: ["node", "http"],
    },
    {
      id: "r002",
      type: "recommendation",
      text: "Use streams for large file processing",
      confidence: 0.8,
      evidence: { tier: "tested", source: "prototype" },
      status: "active",
      created: "2026-01-16",
      tags: ["performance"],
    },
  ];
  fs.writeFileSync(
    path.join(FIXTURES, "claims.json"),
    JSON.stringify({ claims }, null, 2),
  );


}

function cleanup() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
}

function run(args) {
  return execFileSync("node", [MILL, ...args], {
    encoding: "utf-8",
    timeout: 10_000,
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    process.exitCode = 1;
  }
}

// --- Tests ---

console.log("mill basic tests\n");

setup();

test("--help prints usage", () => {
  const out = run(["--help"]);
  assert.ok(out.includes("grainulator export -- turn sprint evidence"));
  assert.ok(out.includes("export"));
  assert.ok(out.includes("publish"));
});

test("formats command lists all formats", () => {
  const out = run(["formats"]);
  assert.ok(out.includes("csv"));
  assert.ok(out.includes("markdown"));
  assert.ok(out.includes("json-ld"));
  assert.ok(out.includes("clipboard"));
});

test("csv export produces valid CSV", () => {
  const input = path.join(FIXTURES, "claims.json");
  const output = path.join(tmpDir, "claims.csv");
  const out = run(["export", "--format", "csv", input, "-o", output]);
  assert.ok(out.includes("CSV written"));
  assert.ok(out.includes("2 claims"));

  const csv = fs.readFileSync(output, "utf-8");
  const lines = csv.trim().split("\n");
  assert.strictEqual(lines.length, 3); // header + 2 rows
  assert.ok(lines[0].includes("id,type,text"));
  assert.ok(lines[1].includes("r001"));
  assert.ok(lines[2].includes("r002"));
});

test("json-ld export produces valid JSON-LD", () => {
  const input = path.join(FIXTURES, "claims.json");
  const output = path.join(tmpDir, "claims.jsonld");
  const out = run(["export", "--format", "json-ld", input, "-o", output]);
  assert.ok(out.includes("JSON-LD written"));

  const doc = JSON.parse(fs.readFileSync(output, "utf-8"));
  assert.ok(doc["@context"]);
  assert.strictEqual(doc["@type"], "Report");
  assert.strictEqual(doc.hasPart.numberOfItems, 2);
  assert.strictEqual(doc.hasPart.itemListElement[0].item.identifier, "r001");
});

test("markdown export converts HTML to markdown", () => {
  const input = path.join(tmpDir, "imported.html");
  fs.writeFileSync(input, "<h1>Sprint Brief</h1><p>This is a <strong>test</strong> brief with <em>emphasis</em>.</p><ul><li>First point</li><li>Second point</li></ul><h2>Conclusion</h2>");
  const output = path.join(tmpDir, "imported.md");
  const out = run(["export", "--format", "markdown", input, "-o", output]);
  assert.ok(out.includes("Markdown written"));

  const md = fs.readFileSync(output, "utf-8");
  assert.ok(md.includes("# Sprint Brief"));
  assert.ok(md.includes("**test**"));
  assert.ok(md.includes("*emphasis*"));
  assert.ok(md.includes("- First point"));
  assert.ok(md.includes("## Conclusion"));
});


test("format detection works", () => {
  const formats = require("../lib/formats.js");
  assert.strictEqual(formats.detectFormat("imported.html"), "html");
  assert.strictEqual(formats.detectFormat("claims.json"), "json");
  assert.strictEqual(formats.detectFormat("notes.md"), "markdown");
  assert.strictEqual(formats.detectFormat("data.csv"), "csv");
});

test("unknown command exits with error", () => {
  try {
    run(["nonexistent"]);
    assert.fail("Should have thrown");
  } catch (err) {
    assert.ok(err.stderr.includes("unknown command"));
  }
});

test("export without --format exits with error", () => {
  try {
    run(["export", "somefile.html"]);
    assert.fail("Should have thrown");
  } catch (err) {
    assert.ok(err.stderr.includes("missing --format"));
  }
});

// ─── CSV exporter: unit tests ────────────────────────────────────────────────

console.log("\ncsv exporter unit tests\n");

test("CSV escapes fields with commas", () => {
  const input = path.join(tmpDir, "commas.json");
  const output = path.join(tmpDir, "commas.csv");
  fs.writeFileSync(
    input,
    JSON.stringify({
      claims: [
        {
          id: "r010",
          type: "factual",
          text: 'Contains, a comma and "quotes"',
          confidence: 0.9,
          evidence: { tier: "documented", source: "test" },
          status: "active",
          created: "2026-01-01",
          tags: ["a", "b", "c"],
        },
      ],
    }),
  );
  run(["export", "--format", "csv", input, "-o", output]);
  const csv = fs.readFileSync(output, "utf-8");
  // Field with comma should be quoted
  assert.ok(csv.includes('"Contains, a comma and ""quotes"""'));
  // Tags should be joined with semicolons
  assert.ok(csv.includes("a; b; c"));
});

test("CSV handles empty tags gracefully", () => {
  const input = path.join(tmpDir, "notags.json");
  const output = path.join(tmpDir, "notags.csv");
  fs.writeFileSync(
    input,
    JSON.stringify({
      claims: [
        {
          id: "r020",
          type: "risk",
          text: "No tags claim",
          confidence: 0.5,
          status: "active",
          created: "2026-02-01",
        },
      ],
    }),
  );
  run(["export", "--format", "csv", input, "-o", output]);
  const csv = fs.readFileSync(output, "utf-8");
  const lines = csv.trim().split("\n");
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[1].includes("r020"));
});

test("CSV export rejects empty claims", () => {
  const input = path.join(tmpDir, "empty.json");
  fs.writeFileSync(input, JSON.stringify({ claims: [] }));
  try {
    run([
      "export",
      "--format",
      "csv",
      input,
      "-o",
      path.join(tmpDir, "empty.csv"),
    ]);
    assert.fail("Should have thrown");
  } catch (err) {
    assert.ok(err.status !== 0);
  }
});

// ─── Markdown exporter: unit tests ───────────────────────────────────────────

console.log("\nmarkdown exporter unit tests\n");

const { htmlToMarkdown } = require("../lib/exporters/markdown.js");

test("htmlToMarkdown strips script and style tags", () => {
  const md = htmlToMarkdown(
    "<html><head><style>body{}</style></head><body><script>alert(1)</script><p>Hello</p></body></html>",
  );
  assert.ok(!md.includes("<script"));
  assert.ok(!md.includes("<style"));
  assert.ok(md.includes("Hello"));
});

test("htmlToMarkdown converts headings h1-h6", () => {
  const md = htmlToMarkdown(
    "<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>",
  );
  assert.ok(md.includes("# One"));
  assert.ok(md.includes("## Two"));
  assert.ok(md.includes("### Three"));
  assert.ok(md.includes("#### Four"));
  assert.ok(md.includes("##### Five"));
  assert.ok(md.includes("###### Six"));
});

test("htmlToMarkdown converts links and images", () => {
  const md = htmlToMarkdown(
    '<a href="https://example.com">Link</a><img src="pic.png" alt="Photo">',
  );
  assert.ok(md.includes("[Link](https://example.com)"));
  assert.ok(md.includes("![Photo](pic.png)"));
});

test("htmlToMarkdown converts blockquotes", () => {
  const md = htmlToMarkdown("<blockquote>Quoted text</blockquote>");
  assert.ok(md.includes("> Quoted text"));
});

test("htmlToMarkdown converts pre/code blocks", () => {
  const md = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
  assert.ok(md.includes("```"));
  assert.ok(md.includes("const x = 1;"));
});

test("htmlToMarkdown decodes HTML entities", () => {
  const md = htmlToMarkdown("<p>&amp; &lt; &gt; &quot; &#39; &nbsp;</p>");
  assert.ok(md.includes("&"));
  assert.ok(md.includes("<"));
  assert.ok(md.includes(">"));
  assert.ok(md.includes('"'));
  assert.ok(md.includes("'"));
});

test("htmlToMarkdown converts hr to ---", () => {
  const md = htmlToMarkdown("<p>Above</p><hr><p>Below</p>");
  assert.ok(md.includes("---"));
});

// ─── JSON-LD exporter: unit tests ────────────────────────────────────────────

console.log("\njson-ld exporter unit tests\n");

test("JSON-LD has @context with schema.org vocab", () => {
  const input = path.join(FIXTURES, "claims.json");
  const output = path.join(tmpDir, "schema-check.jsonld");
  run(["export", "--format", "json-ld", input, "-o", output]);
  const doc = JSON.parse(fs.readFileSync(output, "utf-8"));
  assert.ok(doc["@context"]["@vocab"] === "https://schema.org/");
  assert.ok(doc["@context"]["grainulator"]);
});

test("JSON-LD items have required fields", () => {
  const input = path.join(FIXTURES, "claims.json");
  const output = path.join(tmpDir, "fields-check.jsonld");
  run(["export", "--format", "json-ld", input, "-o", output]);
  const doc = JSON.parse(fs.readFileSync(output, "utf-8"));
  const item = doc.hasPart.itemListElement[0].item;
  assert.ok(item["@type"] === "claim");
  assert.ok(item["@id"].startsWith("grainulator:claim/"));
  assert.ok(item.identifier);
  assert.ok(item.claimType);
  assert.ok(item.text);
  assert.ok(typeof item.confidence === "number");
  assert.ok(item.evidenceTier);
  assert.ok(item.dateCreated);
  assert.ok(item.description);
});

test("JSON-LD includes keywords from tags", () => {
  const input = path.join(FIXTURES, "claims.json");
  const output = path.join(tmpDir, "tags-check.jsonld");
  run(["export", "--format", "json-ld", input, "-o", output]);
  const doc = JSON.parse(fs.readFileSync(output, "utf-8"));
  const firstItem = doc.hasPart.itemListElement[0].item;
  assert.ok(firstItem.keywords);
  assert.ok(firstItem.keywords.includes("node"));
});

// ─── Format detection: extended tests ────────────────────────────────────────

console.log("\nformat detection unit tests\n");

test("detectFormat handles .htm extension", () => {
  const formats = require("../lib/formats.js");
  assert.strictEqual(formats.detectFormat("page.htm"), "html");
});

test("detectFormat handles .jsonld extension", () => {
  const formats = require("../lib/formats.js");
  assert.strictEqual(formats.detectFormat("data.jsonld"), "json-ld");
});

test("detectFormat returns unknown for unrecognized extension", () => {
  const formats = require("../lib/formats.js");
  assert.strictEqual(formats.detectFormat("archive.tar.gz"), "unknown");
});

test("getExporter returns null for unknown format", () => {
  const formats = require("../lib/formats.js");
  assert.strictEqual(formats.getExporter("xml"), null);
});

test("getExporter returns csv exporter", () => {
  const formats = require("../lib/formats.js");
  const exp = formats.getExporter("csv");
  assert.ok(exp);
  assert.strictEqual(exp.name, "csv");
});

test("listExportFormats returns all export formats", () => {
  const formats = require("../lib/formats.js");
  const list = formats.listExportFormats();
  assert.ok(list.includes("csv"));
  assert.ok(list.includes("markdown"));
  assert.ok(list.includes("json-ld"));
  assert.ok(list.includes("json"));
  assert.ok(!list.includes("pdf"));
});

test("listPublishTargets retains clipboard and excludes static", () => {
  const formats = require("../lib/formats.js");
  const list = formats.listPublishTargets();
  assert.ok(!list.includes("static"));
  assert.ok(list.includes("clipboard"));
});



















// ─── Confluence ADF tests ────────────────────────────────────────────────────

console.log("\nconfluence-adf tests\n");

test("confluence-adf produces valid ADF document", () => {
  run([
    "ci-artifacts",
    path.join(FIXTURES, "claims.json"),
    "-o",
    path.join(tmpDir, "adf-dir"),
    "-f",
    "confluence-adf",
  ]);
  const raw = fs.readFileSync(
    path.join(tmpDir, "adf-dir", "confluence-adf.adf.json"),
    "utf-8",
  );
  const doc = JSON.parse(raw);
  assert.strictEqual(doc.type, "doc");
  assert.strictEqual(doc.version, 1);
  assert.ok(Array.isArray(doc.content));
  assert.ok(doc.content.length > 0);
});

test("confluence-adf has heading and table nodes", () => {
  const raw = fs.readFileSync(
    path.join(tmpDir, "adf-dir", "confluence-adf.adf.json"),
    "utf-8",
  );
  const doc = JSON.parse(raw);
  const types = doc.content.map((n) => n.type);
  assert.ok(types.includes("heading"), "has heading nodes");
  assert.ok(types.includes("table"), "has table nodes");
});

test("confluence-adf tables have header and data rows", () => {
  const raw = fs.readFileSync(
    path.join(tmpDir, "adf-dir", "confluence-adf.adf.json"),
    "utf-8",
  );
  const doc = JSON.parse(raw);
  const tables = doc.content.filter((n) => n.type === "table");
  assert.ok(tables.length >= 1, "has at least one table");
  const firstTable = tables[0];
  const rowTypes = firstTable.content.map((r) =>
    r.content.some((c) => c.type === "tableHeader") ? "header" : "data",
  );
  assert.ok(rowTypes.includes("header"), "table has header row");
});

// ─── CI artifacts command tests ──────────────────────────────────────────────

console.log("\nci-artifacts command tests\n");

test("ci-artifacts generates portable evidence formats", () => {
  const outDir = path.join(tmpDir, "ci-default");
  run(["ci-artifacts", path.join(FIXTURES, "claims.json"), "-o", outDir]);
  for (const file of ["markdown.md", "json.json", "csv.csv"]) {
    assert.ok(fs.existsSync(path.join(outDir, file)), `generated ${file}`);
  }
  assert.ok(!fs.readdirSync(outDir).some(file => /\.(html|pdf)$/.test(file)));
});

test("ci-artifacts --formats selects specific formats", () => {
  const outDir = path.join(tmpDir, "ci-custom");
  run([
    "ci-artifacts",
    path.join(FIXTURES, "claims.json"),
    "-o",
    outDir,
    "-f",
    "csv,markdown",
  ]);
  assert.ok(fs.existsSync(path.join(outDir, "csv.csv")), "generated csv");
  assert.ok(
    fs.existsSync(path.join(outDir, "markdown.md")),
    "generated markdown",
  );
  assert.ok(
    !fs.existsSync(path.join(outDir, "html-report.html")),
    "did not generate html-report",
  );
});

test("retired presentation formats reject without writing partial CI artifacts", () => {
  for (const format of ["html-report", "executive-summary", "slide-deck", "static-site", "pdf"]) {
    const outputDir = path.join(tmpDir, `retired-${format}`);
    const result = spawnSync(process.execPath, [MILL, "ci-artifacts", path.join(FIXTURES, "claims.json"), "-o", outputDir, "--formats", `markdown,${format}`], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown format/);
    assert.ok(!fs.existsSync(outputDir));
  }
});

test("ci-artifacts --summary generates step-summary.md", () => {
  const outDir = path.join(tmpDir, "ci-summary");
  run([
    "ci-artifacts",
    path.join(FIXTURES, "claims.json"),
    "-o",
    outDir,
    "--summary",
  ]);
  assert.ok(
    fs.existsSync(path.join(outDir, "step-summary.md")),
    "generated step-summary",
  );
  const md = fs.readFileSync(path.join(outDir, "step-summary.md"), "utf-8");
  assert.ok(md.includes("# "), "step summary has markdown heading");
});

test("ci-artifacts --json outputs JSON", () => {
  const outDir = path.join(tmpDir, "ci-json");
  const out = run([
    "ci-artifacts",
    path.join(FIXTURES, "claims.json"),
    "-o",
    outDir,
    "--json",
  ]);
  const result = JSON.parse(out);
  assert.ok(Array.isArray(result.artifacts));
  assert.ok(result.artifacts.length > 0);
  assert.ok(result.artifacts[0].format);
  assert.ok(result.artifacts[0].file);
  assert.ok(result.artifacts[0].bytes > 0);
});

test("ci-artifacts prints human-readable output", () => {
  const outDir = path.join(tmpDir, "ci-human");
  const out = run([
    "ci-artifacts",
    path.join(FIXTURES, "claims.json"),
    "-o",
    outDir,
  ]);
  assert.ok(out.includes("generated"), "has generation message");
  assert.ok(out.includes("artifacts"), "mentions artifacts");
});

test("ci-artifacts rejects an invalid first target before publishing artifacts", () => {
  const outDir = path.join(tmpDir, "unwritable-artifact");
  fs.mkdirSync(path.join(outDir, "markdown.md"), { recursive: true });
  const result = spawnSync(process.execPath, [MILL, "ci-artifacts", path.join(FIXTURES, "claims.json"), "-o", outDir, "--json"], { encoding: "utf8" });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.ok(!fs.existsSync(path.join(outDir, "json.json")), "must not create later artifacts after preflight fails");
  assert.ok(!fs.existsSync(path.join(outDir, "csv.csv")), "must not create later artifacts after preflight fails");
});

test("ci-artifacts preflights later invalid targets before changing any artifact", () => {
  for (const prior of [false, true]) {
    const outDir = path.join(tmpDir, `late-target-${prior}`);
    fs.mkdirSync(path.join(outDir, "json.json"), { recursive: true });
    const markdown = path.join(outDir, "markdown.md");
    if (prior) fs.writeFileSync(markdown, "prior report must survive");
    const result = spawnSync(process.execPath, [MILL, "ci-artifacts", path.join(FIXTURES, "claims.json"), "-o", outDir, "--formats", "markdown,json", "--json"], { encoding: "utf8" });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    if (prior) assert.strictEqual(fs.readFileSync(markdown, "utf8"), "prior report must survive");
    else assert.strictEqual(fs.existsSync(markdown), false);
    assert.deepStrictEqual(fs.readdirSync(outDir).sort(), prior ? ["json.json", "markdown.md"] : ["json.json"]);
  }
});

test("ci-artifacts refuses direct, symlink and hardlink step-summary aliases before publishing", () => {
  for (const kind of ["direct", "symlink", "hardlink"]) {
    const outDir = path.join(tmpDir, `summary-alias-${kind}`);
    fs.mkdirSync(outDir);
    const artifact = path.join(outDir, "json.json");
    fs.writeFileSync(artifact, "existing artifact");
    let summary = artifact;
    if (kind !== "direct") {
      summary = path.join(tmpDir, `summary-${kind}.md`);
      if (kind === "symlink") fs.symlinkSync(artifact, summary);
      else fs.linkSync(artifact, summary);
    }
    const result = spawnSync(process.execPath, [MILL, "ci-artifacts", path.join(FIXTURES, "claims.json"), "-o", outDir, "--formats", "json", "--json"], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summary } });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.strictEqual(fs.readFileSync(artifact, "utf8"), "existing artifact");
    assert.deepStrictEqual(fs.readdirSync(outDir), ["json.json"]);
  }
});

test("ci-artifacts reports a requested summary write failure instead of success", () => {
  const outDir = path.join(tmpDir, "summary-error-artifacts");
  const summary = path.join(tmpDir, "summary-is-directory"); fs.mkdirSync(summary);
  const result = spawnSync(process.execPath, [MILL, "ci-artifacts", path.join(FIXTURES, "claims.json"), "-o", outDir, "--formats", "json", "--json"], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summary } });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /step summary/);
  assert.ok(!fs.existsSync(outDir), "Invalid requested summary must fail before artifact creation");
});

test("unsupported inherited names and source formats reject before creating output", () => {
  const formats = require("../lib/formats.js");
  for (const name of ["constructor", "__proto__", "toString"]) {
    assert.strictEqual(formats.getExporter(name), null);
    assert.strictEqual(formats.getPublisher(name), null);
    const result = spawnSync(process.execPath, [MILL, name], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown command/);
  }
  const output = path.join(tmpDir, "invalid-source.json");
  for (const source of ["nonexistent", "csv", "json-ld"]) {
    const result = spawnSync(process.execPath, [MILL, "convert", "--from", source, "--to", "json", path.join(FIXTURES, "claims.json"), "-o", output], { encoding: "utf8" });
    assert.notEqual(result.status, 0, source);
    assert.match(result.stderr, /unsupported source format/);
    assert.ok(!fs.existsSync(output));
  }
});

// Exercise the public CLI using actual compiler output, from outside the sprint.
const ROOT_CLI = path.resolve(__dirname, "../../../bin/grainulator.js");
function publicCli(args) {
  return spawnSync(process.execPath, [ROOT_CLI, ...args], {
    cwd: tmpDir, encoding: "utf8", timeout: 10000,
  });
}
const exportSprint = path.join(tmpDir, "export sprint");
fs.mkdirSync(exportSprint);
fs.writeFileSync(path.join(exportSprint, "claims.json"), JSON.stringify({
  meta: { question: "Export the complete decision", audience: ["Maintainers"] },
  claims: [{ id: "r001", type: "recommendation", topic: "delivery", content: "Keep verified claim content in every export", status: "active", evidence: "tested", confidence: 0.95, tags: [] }],
}));
const compiled = publicCli(["compile", "--dir", exportSprint]);
assert.ok(fs.existsSync(path.join(exportSprint, "compilation.json")), compiled.stderr);

test("public export resolves --dir paths and preserves actual compiled evidence", () => {
  const result = publicCli(["export", "export", "--format", "markdown", "compilation.json", "-o", "brief.md", "--dir", "export sprint"]);
  assert.equal(result.status, 0, result.stderr);
  const output = fs.readFileSync(path.join(exportSprint, "brief.md"), "utf8");
  assert.ok(output.includes("Keep verified claim content in every export"));
  assert.ok(output.includes("Export the complete decision"));
  assert.ok(!fs.existsSync(path.join(tmpDir, "brief.md")));
});

test("compiled evidence survives CSV, JSON-LD, Markdown and convert routes", () => {
  for (const [format, extension] of [["csv", "csv"], ["json-ld", "jsonld"], ["markdown", "md"]]) {
    const output = path.join(tmpDir, `absolute-${format}.${extension}`);
    const result = publicCli(["export", "export", "--dir", exportSprint, "--format", format, "compilation.json", "-o", output]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.readFileSync(output, "utf8").includes("Keep verified claim content in every export"));
  }
  const result = publicCli(["export", "convert", "--dir", exportSprint, "--from", "json", "--to", "markdown", "compilation.json", "-o", "converted.md"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(path.join(exportSprint, "converted.md"), "utf8").includes("Keep verified claim content in every export"));
});

test("ci-artifacts resolves --dir and uses normalized compilation data", () => {
  const result = publicCli(["export", "ci-artifacts", "--dir", exportSprint, "compilation.json", "-o", "artifacts", "--formats", "markdown"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(path.join(exportSprint, "artifacts/markdown.md"), "utf8").includes("Keep verified claim content in every export"));
});

test("invalid or content-less compilation fails actionably without writing an empty report", () => {
  for (const data of [{ status: "ready" }, { resolved_claims: [{ id: "r001", type: "factual" }] }, { claims: "invalid" }]) {
    fs.writeFileSync(path.join(exportSprint, "incomplete.json"), JSON.stringify(data));
    const result = publicCli(["export", "export", "--dir", exportSprint, "--format", "markdown", "incomplete.json", "-o", "empty.md"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /claims.json|recompile/);
    assert.ok(!fs.existsSync(path.join(exportSprint, "empty.md")));
  }
});

test("ESM exports cannot overwrite their input or the sprint ledger", () => {
  const before = fs.readFileSync(path.join(exportSprint, "claims.json"), "utf8");
  for (const output of ["claims.json", "compilation.json"]) {
    const result = publicCli(["export", "export", "--dir", exportSprint, "--format", "markdown", "compilation.json", "-o", output]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Protected output|overwrite/);
  }
  assert.equal(fs.readFileSync(path.join(exportSprint, "claims.json"), "utf8"), before);
});

test("export subcommand help works and unknown option names are visible", () => {
  const help = publicCli(["export", "export", "--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--dir/);
  const result = publicCli(["export", "export", "--not-a-real-option"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown option: --not-a-real-option/);
});

cleanup();

console.log("\nDone.");
