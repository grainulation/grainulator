import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { buildSite } from './build-site.mjs';
import { importSession } from '../site/research/session.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const servers = [];
// Python's unmodified SimpleHTTPRequestHandler: no application routes or API backend.
const orgPortFlag = process.argv.indexOf('--organization-port');
const organizationPort = orgPortFlag === -1 ? 0 : Number(process.argv[orgPortFlag + 1]);
if (!Number.isInteger(organizationPort) || organizationPort < 0 || organizationPort > 65535) throw Error('Invalid --organization-port');
async function serve(directory, port = 0) {
  const child = spawn('python3', ['-u', '-c', `from http.server import HTTPServer, SimpleHTTPRequestHandler; s=HTTPServer(("127.0.0.1",${port}),SimpleHTTPRequestHandler); print(s.server_port,flush=True); s.serve_forever()`], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(child);
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Static server failed to start: ${errors}`)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(Error(errors)); });
    child.stdout.once('data', chunk => { clearTimeout(timer); resolve(`http://127.0.0.1:${Number(String(chunk).trim())}`); });
  });
}
let browser;
const report = { checks: [], widths: [] };
try {
  const output = await buildSite();
  const origin = await serve(output);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [], failed = [], api = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  page.on('request', request => { if (request.url().includes('/api/')) api.push(request.url()); });
  for (const entry of ['/playground', '/playground.html', '/research.html']) {
    await page.goto(`${origin}${entry}?test=1#q=Static%20research`);
    await page.waitForFunction(() => document.querySelector('#question')?.value === 'Static research');
    assert.equal(new URL(page.url()).pathname, '/playground/');
    assert.equal(new URL(page.url()).search, '?test=1');
  }
  report.checks.push('ordinary static server resolves clean and legacy routes, preserving question and query');
  await page.getByText('Configure here. Run on your machine.', { exact: false }).waitFor();
  assert.equal(await page.locator('#run').isDisabled(), true);
  assert.equal(await page.locator('#api-key').isDisabled(), true);
  await page.locator('#local-setup summary').click();
  assert.match(await page.locator('#local-setup').textContent(), /grainulator preview/);
  await page.locator('#provider').selectOption('openrouter');
  assert.equal(await page.locator('#api-key').isDisabled(), true);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-session').click();
  const download = await downloadPromise;
  const contents = await fs.readFile(await download.path(), 'utf8');
  const session = importSession(JSON.parse(contents));
  assert.equal(session.question, 'Static research');
  assert.equal(session.config.provider, 'openrouter');
  await page.locator('#import-session').setInputFiles({ name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
  assert.equal(await page.locator('#question').inputValue(), 'Static research');
  report.checks.push('static configure, export, reimport, and explicit local continuation; credentials disabled');
  await page.locator('#provider').selectOption('custom');
  await page.locator('#model').fill('custom-fixture');
  await page.locator('#base-url').fill('https://model.example/v1');
  assert.equal(await page.locator('#handoff-auth').isVisible(), true);
  assert.match(await page.locator('#handoff-auth').textContent(), /--api-key-env MODEL_API_KEY/);
  const briefPromise = page.waitForEvent('download');
  await page.locator('#export-brief').click();
  const brief = await briefPromise;
  assert.match(await fs.readFile(await brief.path(), 'utf8'), /--api-key-env MODEL_API_KEY/);
  await page.locator('#provider').selectOption('openai');
  assert.equal(await page.locator('#handoff-auth').isVisible(), false);
  report.checks.push('custom endpoint CLI authentication guidance follows provider and survives brief export');

  await page.goto(`${origin}/?offline=1`);
  await page.getByText('Example · no model called').waitFor();
  assert.equal(new URL(page.url()).pathname, '/playground/');
  assert.equal(api.length, 0);
  report.checks.push('public example and model configuration issue no API requests');
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(`${origin}/playground/`);
    await page.getByText('Configure here. Run on your machine.', { exact: false }).waitFor();
    await page.locator('#local-setup summary').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `playground overflows at ${width}`);
    const playgroundWidth = await page.locator('.page-shell').evaluate(node => node.getBoundingClientRect().width);
    await page.locator('.site-header nav a').click();
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.locator('.page-shell').evaluate(node => node.getBoundingClientRect().width), playgroundWidth);
    report.widths.push(width);
  }
  await page.goto(`${origin}/privacy.html`);
  await page.locator('h1').waitFor();
  await page.goto(`${origin}/playground/`);
  await page.locator('#local-setup summary').click();
  await page.getByRole('link', { name: 'Set up the local build' }).click();
  assert.equal(new URL(page.url()).pathname, '/install.html');
  assert.match(await page.locator('main').textContent(), /Node.js 24 or later/);
  assert.match(await page.locator('main').textContent(), /has not been pushed or published/);
  assert.match(await page.locator('main').textContent(), /npm install --offline --ignore-scripts/);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `install guide overflows at ${width}`);
  }
  report.checks.push('first-time local setup link, unpublished build distinction, Node prerequisites and responsive install instructions');

  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  report.checks.push('responsive widths, home navigation, privacy, no missing assets or browser errors');
  const orgBuild = path.resolve(root, '../grainulation-dogfood/scripts/build-site.mjs');
  try { await fs.access(orgBuild); } catch { console.log('Sibling organization checkout absent; product static checks complete.'); }
  if (await fs.access(orgBuild).then(() => true, () => false)) {
    const orgOutput = await (await import(pathToFileURL(orgBuild))).buildSite();
    assert.equal(await fs.readFile(path.join(orgOutput, 'index.html'), 'utf8'), await fs.readFile(path.resolve(orgBuild, '../../site/index.html'), 'utf8'));
    const orgOrigin = await serve(orgOutput, organizationPort);
    await page.goto(orgOrigin);
    await page.locator('h1').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    for (const link of await page.locator('[data-product-path]').evaluateAll(nodes => nodes.map(node => node.href))) assert.equal(new URL(link).origin, 'https://grainulator.app');
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    report.checks.push(`organization artifact preserves authored homepage and production product links on port ${new URL(orgOrigin).port}`);
  }
  await fs.mkdir(path.join(root, '.dogfood'), { recursive: true });
  await fs.writeFile(path.join(root, '.dogfood/static-site-results.json'), JSON.stringify(report, null, 2));
  console.log(`PASS: ${report.checks.length} static artifact checks; responsive widths ${report.widths.join(', ')}.`);
} finally {
  if (browser) await browser.close();
  for (const server of servers) server.kill('SIGTERM');
}
