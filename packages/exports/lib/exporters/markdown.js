"use strict";
const { assertSafeOutput } = require("../output-safety.js");

const fs = require("node:fs");
const path = require("node:path");

/**
 * Convert HTML artifacts to clean Markdown.
 * Uses a minimal tag-stripping approach -- no dependencies.
 * Handles the common patterns from wheat sprint HTML output.
 */

function htmlToMarkdown(html) {
  let md = html;

  // Remove doctype, head, scripts, styles
  md = md.replace(/<!DOCTYPE[^>]*>/gi, "");
  md = md.replace(/<head[\s\S]*?<\/head>/gi, "");
  md = md.replace(/<script[\s\S]*?<\/script>/gi, "");
  md = md.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `# ${strip(c)}\n\n`);
  md = md.replace(
    /<h2[^>]*>([\s\S]*?)<\/h2>/gi,
    (_, c) => `## ${strip(c)}\n\n`,
  );
  md = md.replace(
    /<h3[^>]*>([\s\S]*?)<\/h3>/gi,
    (_, c) => `### ${strip(c)}\n\n`,
  );
  md = md.replace(
    /<h4[^>]*>([\s\S]*?)<\/h4>/gi,
    (_, c) => `#### ${strip(c)}\n\n`,
  );
  md = md.replace(
    /<h5[^>]*>([\s\S]*?)<\/h5>/gi,
    (_, c) => `##### ${strip(c)}\n\n`,
  );
  md = md.replace(
    /<h6[^>]*>([\s\S]*?)<\/h6>/gi,
    (_, c) => `###### ${strip(c)}\n\n`,
  );

  // Bold, italic, code
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

  // Pre/code blocks
  md = md.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (_, c) => {
      return "\n```\n" + decodeEntities(c) + "\n```\n\n";
    },
  );
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => {
    return "\n```\n" + decodeEntities(c) + "\n```\n\n";
  });

  // Links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Images
  md = md.replace(
    /<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
    "![$2]($1)",
  );
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  // Lists
  md = md.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    (_, c) => `- ${strip(c).trim()}\n`,
  );
  md = md.replace(/<\/?[ou]l[^>]*>/gi, "\n");

  // Paragraphs and breaks
  md = md.replace(
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
    (_, c) => `${strip(c).trim()}\n\n`,
  );
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n\n");

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => {
    return (
      strip(c)
        .trim()
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n") + "\n\n"
    );
  });

  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode common entities
  md = decodeEntities(md);

  // Normalize whitespace
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.trim() + "\n";

  return md;
}

function strip(html) {
  return html.replace(/<[^>]+>/g, "");
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function deriveOutputPath(inputPath, explicit) {
  if (explicit) return explicit;
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}.md`);
}

async function exportMarkdown(inputPath, outputPath) {
  const html = fs.readFileSync(inputPath, "utf-8");
  const trimmed = html.trimStart();
  if (path.extname(inputPath).toLowerCase() === ".json" || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const { loadSource } = require("../source-data.js");
    const { convert } = await import("../formats/markdown.mjs");
    const md = convert(loadSource(inputPath));
    const out = deriveOutputPath(inputPath, outputPath);
    assertSafeOutput(out, [inputPath]);
    fs.writeFileSync(out, md, "utf-8");
    return { outputPath: out, message: `Markdown written to ${out}` };
  }
  if (
    !trimmed.startsWith("<") &&
    !trimmed.startsWith("<!DOCTYPE") &&
    !trimmed.startsWith("<html")
  ) {
    process.stderr.write(
      "Warning: Input does not appear to be HTML. Markdown conversion may produce unexpected results.\n",
    );
  }
  const md = htmlToMarkdown(html);
  const out = deriveOutputPath(inputPath, outputPath);
  assertSafeOutput(out, [inputPath]);
  fs.writeFileSync(out, md, "utf-8");
  return { outputPath: out, message: `Markdown written to ${out}` };
}

module.exports = {
  name: "markdown",
  description: "Convert HTML artifacts to clean Markdown",
  export: exportMarkdown,
  htmlToMarkdown,
};
