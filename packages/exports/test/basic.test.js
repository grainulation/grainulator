"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const MILL = path.join(__dirname, "..", "bin", "mill.js");
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

  // Create a test HTML file
  fs.writeFileSync(
    path.join(FIXTURES, "brief.html"),
    `<!DOCTYPE html>
<html><head><title>Test Brief</title></head>
<body>
<h1>Sprint Brief</h1>
<p>This is a <strong>test</strong> brief with <em>emphasis</em>.</p>
<ul><li>First point</li><li>Second point</li></ul>
<h2>Conclusion</h2>
<p>All done.</p>
</body></html>`,
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
  assert.ok(out.includes("pdf"));
  assert.ok(out.includes("csv"));
  assert.ok(out.includes("markdown"));
  assert.ok(out.includes("json-ld"));
  assert.ok(out.includes("static"));
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
  const input = path.join(FIXTURES, "brief.html");
  const output = path.join(tmpDir, "brief.md");
  const out = run(["export", "--format", "markdown", input, "-o", output]);
  assert.ok(out.includes("Markdown written"));

  const md = fs.readFileSync(output, "utf-8");
  assert.ok(md.includes("# Sprint Brief"));
  assert.ok(md.includes("**test**"));
  assert.ok(md.includes("*emphasis*"));
  assert.ok(md.includes("- First point"));
  assert.ok(md.includes("## Conclusion"));
});

test("static publish creates site with index", () => {
  const inputDir = path.join(tmpDir, "sprint-output");
  const siteDir = path.join(tmpDir, "site");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, "brief.html"), "<h1>Brief</h1>");
  fs.writeFileSync(path.join(inputDir, "claims.json"), "[]");

  const out = run(["publish", "--target", "static", inputDir, "-o", siteDir]);
  assert.ok(out.includes("Static site written"));
  assert.ok(fs.existsSync(path.join(siteDir, "index.html")));
  assert.ok(fs.existsSync(path.join(siteDir, "brief.html")));

  const index = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
  assert.ok(index.includes("brief.html"));
  assert.ok(index.includes("#d97706")); // amber accent
});

test("format detection works", () => {
  const formats = require("../lib/formats.js");
  assert.strictEqual(formats.detectFormat("brief.html"), "html");
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
  assert.ok(doc["@context"]["wheat"]);
});

test("JSON-LD items have required fields", () => {
  const input = path.join(FIXTURES, "claims.json");
  const output = path.join(tmpDir, "fields-check.jsonld");
  run(["export", "--format", "json-ld", input, "-o", output]);
  const doc = JSON.parse(fs.readFileSync(output, "utf-8"));
  const item = doc.hasPart.itemListElement[0].item;
  assert.ok(item["@type"] === "claim");
  assert.ok(item["@id"].startsWith("wheat:claim/"));
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
  assert.ok(list.includes("pdf"));
});

test("listPublishTargets returns static and clipboard", () => {
  const formats = require("../lib/formats.js");
  const list = formats.listPublishTargets();
  assert.ok(list.includes("static"));
  assert.ok(list.includes("clipboard"));
});

// ─── Static publisher: unit tests ────────────────────────────────────────────

console.log("\nstatic publisher unit tests\n");

test("static publisher includes all files in index", () => {
  const inputDir = path.join(tmpDir, "multi-output");
  const siteDir = path.join(tmpDir, "multi-site");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, "brief.html"), "<h1>Brief</h1>");
  fs.writeFileSync(path.join(inputDir, "data.csv"), "id,text\nr001,test");
  fs.writeFileSync(path.join(inputDir, "notes.md"), "# Notes");

  run(["publish", "--target", "static", inputDir, "-o", siteDir]);
  const index = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
  assert.ok(index.includes("brief.html"));
  assert.ok(index.includes("data.csv"));
  assert.ok(index.includes("notes.md"));
  assert.ok(index.includes("HTML"));
  assert.ok(index.includes("CSV"));
  assert.ok(index.includes("MD"));
});

test("static publisher copies source files to site", () => {
  const inputDir = path.join(tmpDir, "copy-test");
  const siteDir = path.join(tmpDir, "copy-site");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, "test.txt"), "hello world");

  run(["publish", "--target", "static", inputDir, "-o", siteDir]);
  assert.ok(fs.existsSync(path.join(siteDir, "test.txt")));
  assert.strictEqual(
    fs.readFileSync(path.join(siteDir, "test.txt"), "utf-8"),
    "hello world",
  );
});

test("static publisher uses dark theme with amber accent", () => {
  const inputDir = path.join(tmpDir, "theme-test");
  const siteDir = path.join(tmpDir, "theme-site");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, "a.html"), "<p>content</p>");

  run(["publish", "--target", "static", inputDir, "-o", siteDir]);
  const index = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
  assert.ok(index.includes("#d97706"), "uses amber accent color");
  assert.ok(index.includes("background: #111"), "uses dark background");
  assert.ok(index.includes("Built with @grainulation/mill"), "has mill footer");
});

// ─── HTML accessibility tests ────────────────────────────────────────────────

console.log("\nhtml accessibility tests\n");

test("html-report has skip link", () => {
  const input = path.join(FIXTURES, "claims.json");
  const output = path.join(tmpDir, "a11y-report.html");
  // Use ci-artifacts to generate html-report
  run([
    "ci-artifacts",
    input,
    "-o",
    path.join(tmpDir, "a11y-report-dir"),
    "-f",
    "html-report",
  ]);
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-report-dir", "html-report.html"),
    "utf-8",
  );
  assert.ok(html.includes('class="skip-link"'), "has skip link");
  assert.ok(html.includes('href="#main-content"'), "skip link targets main");
});

test("html-report has semantic landmarks", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-report-dir", "html-report.html"),
    "utf-8",
  );
  assert.ok(html.includes("<main"), "has main landmark");
  assert.ok(html.includes('role="banner"'), "has banner role");
  assert.ok(html.includes('role="contentinfo"'), "has contentinfo role");
  assert.ok(html.includes("<nav"), "has nav for filters");
});

test("html-report filter buttons have aria-pressed", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-report-dir", "html-report.html"),
    "utf-8",
  );
  assert.ok(
    html.includes('aria-pressed="true"'),
    "filter buttons have aria-pressed",
  );
});

test("html-report has article cards with aria-labelledby", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-report-dir", "html-report.html"),
    "utf-8",
  );
  assert.ok(html.includes("<article"), "uses article for cards");
  assert.ok(html.includes("aria-labelledby"), "cards have aria-labelledby");
});

test("html-report confidence bars have progressbar role", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-report-dir", "html-report.html"),
    "utf-8",
  );
  assert.ok(
    html.includes('role="progressbar"'),
    "confidence bars have progressbar role",
  );
  assert.ok(html.includes("aria-valuenow"), "has aria-valuenow");
  assert.ok(html.includes('aria-valuemin="0"'), "has aria-valuemin");
  assert.ok(html.includes('aria-valuemax="100"'), "has aria-valuemax");
});

test("html-report has prefers-reduced-motion", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-report-dir", "html-report.html"),
    "utf-8",
  );
  assert.ok(
    html.includes("prefers-reduced-motion"),
    "respects reduced motion preference",
  );
});

test("executive-summary has skip link and table captions", () => {
  run([
    "ci-artifacts",
    path.join(FIXTURES, "claims.json"),
    "-o",
    path.join(tmpDir, "a11y-exec-dir"),
    "-f",
    "executive-summary",
  ]);
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-exec-dir", "executive-summary.html"),
    "utf-8",
  );
  assert.ok(html.includes('class="skip-link"'), "has skip link");
  assert.ok(html.includes("<main"), "has main landmark");
  assert.ok(html.includes("<caption>"), "tables have captions");
  assert.ok(html.includes('scope="col"'), "th elements have scope");
});

test("executive-summary has semantic sections", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-exec-dir", "executive-summary.html"),
    "utf-8",
  );
  assert.ok(html.includes('aria-label="Key risks"'), "has risks section label");
  assert.ok(
    html.includes('aria-label="Recommendations"'),
    "has recommendations section label",
  );
  assert.ok(
    html.includes('aria-label="Evidence coverage"'),
    "has evidence section label",
  );
});

test("slide-deck has aria-roledescription on slides", () => {
  run([
    "ci-artifacts",
    path.join(FIXTURES, "claims.json"),
    "-o",
    path.join(tmpDir, "a11y-slides-dir"),
    "-f",
    "slide-deck",
  ]);
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-slides-dir", "slide-deck.html"),
    "utf-8",
  );
  assert.ok(
    html.includes('aria-roledescription="slide"'),
    "slides have roledescription",
  );
  assert.ok(html.includes('role="group"'), "slides have group role");
});

test("slide-deck has live region counter", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-slides-dir", "slide-deck.html"),
    "utf-8",
  );
  assert.ok(html.includes('aria-live="polite"'), "has live region");
  assert.ok(html.includes("slide-counter"), "has slide counter");
});

test("slide-deck respects prefers-reduced-motion", () => {
  const html = fs.readFileSync(
    path.join(tmpDir, "a11y-slides-dir", "slide-deck.html"),
    "utf-8",
  );
  assert.ok(
    html.includes("prefers-reduced-motion"),
    "has reduced motion media query",
  );
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

test("ci-artifacts generates default formats", () => {
  const outDir = path.join(tmpDir, "ci-default");
  run(["ci-artifacts", path.join(FIXTURES, "claims.json"), "-o", outDir]);
  assert.ok(
    fs.existsSync(path.join(outDir, "html-report.html")),
    "generated html-report",
  );
  assert.ok(
    fs.existsSync(path.join(outDir, "executive-summary.html")),
    "generated executive-summary",
  );
  assert.ok(
    fs.existsSync(path.join(outDir, "slide-deck.html")),
    "generated slide-deck",
  );
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

cleanup();

console.log("\nDone.");
