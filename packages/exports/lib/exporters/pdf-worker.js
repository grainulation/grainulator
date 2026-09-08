#!/usr/bin/env node
"use strict";

/**
 * PDF worker — standalone script that converts an HTML file to PDF using puppeteer.
 *
 * Usage: node pdf-worker.js <inputPath> <outputPath>
 *
 * Extracted from pdf.js to avoid constructing JS as a string and executing
 * via `node -e`, which triggers Socket AI-anomaly alerts.
 */

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  process.stderr.write("Usage: node pdf-worker.js <inputPath> <outputPath>\n");
  process.exit(1);
}

(async () => {
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(`file://${inputPath}`, { waitUntil: "networkidle0" });
  await page.pdf({ path: outputPath, format: "A4", printBackground: true });
  await browser.close();
})();
