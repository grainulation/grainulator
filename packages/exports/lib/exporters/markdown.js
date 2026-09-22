"use strict";
const { assertSafeOutput } = require("../output-safety.js");

const fs = require("node:fs");
const path = require("node:path");

const { tokens, decodeEntities, withoutElements } = require("../../../shared/lib/html.cjs");

function markdownText(text, decoded = false) {
  return (decoded ? text : decodeEntities(text)).replace(/[\\`*_[\]<>#!]/g, char => `\\${char}`);
}
function destination(value) {
  if (!value || /[\x00-\x20\x7f\\]/.test(value)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (scheme && !["https", "http", "mailto"].includes(scheme[1].toLowerCase())) return null;
  return value.replace(/[()<>"']/g, char => encodeURIComponent(char).replace(/[()']/g, c => `%${c.charCodeAt(0).toString(16)}`));
}
function htmlToMarkdown(html) {
  const root = { children: [] }, stack = [root];
  for (const token of tokens(withoutElements(html, ["head", "script", "style", "iframe", "object"]))) {
    const parent = stack[stack.length - 1];
    if (token.text !== undefined) { parent.children.push(token); continue; }
    if (token.close) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === token.name) { stack.length = i; break; }
      }
    } else {
      const node = { ...token, children: [] }; parent.children.push(node);
      if (!token.selfClosing && !["img", "br", "hr", "meta", "link", "input", "wbr"].includes(token.name) && stack.length < 256) stack.push(node);
    }
  }
  const plain = node => node.text !== undefined ? decodeEntities(node.text) : node.children.map(plain).join("");
  function render(node) {
    if (node.text !== undefined) return markdownText(node.text);
    if (node.name === "pre") {
      const content = plain(node);
      const longest = (content.match(/`+/g) || []).reduce((longest, x) => Math.max(longest, x.length), 2);
      const fence = "`".repeat(longest + 1);
      return `\n${fence}\n${content}\n${fence}\n\n`;
    }
    if (node.name === "code") {
      const content = plain(node).replace(/\r?\n/g, " ");
      const longest = (content.match(/`+/g) || []).reduce((longest, x) => Math.max(longest, x.length), 0);
      const fence = "`".repeat(longest + 1);
      return `${fence} ${content} ${fence}`;
    }
    const text = node.children.map(render).join("");
    if (/^h[1-6]$/.test(node.name || "")) return `${"#".repeat(Number(node.name[1]))} ${text.trim()}\n\n`;
    switch (node.name) {
      case "strong": case "b": return `**${text}**`;
      case "em": case "i": return `*${text}*`;
      case "p": return `${text.trim()}\n\n`;
      case "br": return "\n";
      case "hr": return "\n---\n\n";
      case "li": return `- ${text.trim()}\n`;
      case "ul": case "ol": return `\n${text}\n`;
      case "blockquote": return text.trim().split("\n").map(line => `> ${line}`).join("\n") + "\n\n";
      case "a": { const url = destination(node.attrs.href); return url ? `[${text}](${url})` : text; }
      case "img": { const url = destination(node.attrs.src), alt = markdownText(node.attrs.alt || "", true); return url && !url.startsWith("mailto:") ? `![${alt}](${url})` : alt; }
      default: return text;
    }
  }
  return render(root).replace(/\n{3,}/g, "\n\n").trim() + "\n";
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
