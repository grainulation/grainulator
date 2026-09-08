"use strict";
const { assertSafeOutput } = require("../output-safety.js");

// NOTE: PDF is the one export format that requires external tools (md-to-pdf
// for Markdown, puppeteer for HTML). These are fetched via npx on first run,
// which needs network access. All other mill export formats are zero-dep.

const path = require("node:path");
const { execFile, execFileSync } = require("node:child_process");

/**
 * Export HTML or Markdown files to PDF.
 * Uses npx md-to-pdf for Markdown, npx puppeteer for HTML.
 * Zero installed deps -- delegates to npx at runtime.
 */

function deriveOutputPath(inputPath, explicit) {
  if (explicit) return explicit;
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}.pdf`);
}

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function npxToolError(toolName, originalError) {
  const msg = originalError.message || String(originalError);
  const isNotFound =
    /not found|ENOENT|ERR_MODULE_NOT_FOUND|Cannot find module/i.test(msg);
  const isNetwork = /ENETUNREACH|ENOTFOUND|fetch failed|EAI_AGAIN/i.test(msg);
  const isTimeout = /timed out|ETIMEDOUT/i.test(msg);

  let hint;
  if (isNotFound || isNetwork || isTimeout) {
    hint =
      `PDF export requires "${toolName}" which is fetched via npx on first run.\n` +
      `  To pre-install: npx ${toolName} --version\n` +
      `  If you are offline or npx is unavailable, use: mill export --format markdown`;
  } else {
    hint =
      `"${toolName}" exited with an error.\n` +
      `  Verify it works standalone: npx ${toolName} --version\n` +
      `  Or fall back to: mill export --format markdown`;
  }

  return new Error(
    `PDF export failed -- ${toolName} unavailable or broken.\n\n${hint}\n\nOriginal error: ${msg}`,
  );
}

async function exportFromMarkdown(inputPath, outputPath) {
  const out = deriveOutputPath(inputPath, outputPath);
  assertSafeOutput(out, [inputPath]);
  // md-to-pdf reads from file, writes pdf alongside or to --dest
  try {
    await exec("npx", ["--yes", "md-to-pdf", inputPath, "--dest", out]);
  } catch (err) {
    throw npxToolError("md-to-pdf", err);
  }
  return { outputPath: out, message: `PDF written to ${out}` };
}

async function exportFromHtml(inputPath, outputPath) {
  const out = deriveOutputPath(inputPath, outputPath);
  assertSafeOutput(out, [inputPath]);
  const workerPath = path.join(__dirname, "pdf-worker.js");
  try {
    execFileSync("node", [workerPath, inputPath, out], { timeout: 120_000 });
  } catch (err) {
    throw npxToolError("puppeteer", err);
  }
  return { outputPath: out, message: `PDF written to ${out}` };
}

async function exportPdf(inputPath, outputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") {
    return exportFromMarkdown(inputPath, outputPath);
  }
  return exportFromHtml(inputPath, outputPath);
}

module.exports = {
  name: "pdf",
  description: "Export HTML or Markdown to PDF",
  export: exportPdf,
};
