import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('.dogfood/screenshots');
fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const findings = [];
try {
  for (const [name, url] of [['grainulator', 'http://127.0.0.1:4517'], ['grainulation', 'http://127.0.0.1:4518']]) {
    for (const width of [320, 768, 1024, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Baseline checks are offline and never submit prompts to external services.
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(directory, `${name}-${width}.png`), fullPage: true });
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, title: document.title, h1: document.querySelector('h1')?.textContent }));
      findings.push({ name, width, ...geometry, overflow: geometry.document > width, errors });
      await page.close();
    }
  }
} finally { await browser.close(); }
fs.writeFileSync('.dogfood/browser-results.json', JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
process.exitCode = findings.some(f => f.overflow || f.errors.length) ? 1 : 0;
