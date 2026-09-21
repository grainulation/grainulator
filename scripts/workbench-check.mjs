import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const results = [];
try {
  for (const width of [320, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await page.goto('http://127.0.0.1:4517/');
    await page.locator('#decision[data-allowed="false"]').waitFor();
    assert.equal(await page.locator('a[href*="github.com"][target="_blank"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-stage="0"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#decision').textContent(), 'Report ready');
    assert.equal(await page.locator('#compiled-hash').textContent(), await page.locator('#input-hash').textContent());
    await page.locator('[data-stage="1"]').click();
    assert.notEqual(await page.locator('#compiled-hash').textContent(), await page.locator('#input-hash').textContent());
    await page.locator('[data-stage="2"]').click();
    assert.equal(await page.locator('#decision').textContent(), 'Report can be updated');
    assert.match(await page.locator('#claim').textContent(), /failed/);
    assert.equal(await page.locator('.agent-option').count(), 2);
    assert.match(await page.locator('.agent-option').first().getAttribute('href'), /AGENT-SETUP\.md#claude-code$/);
    assert.match(await page.locator('.agent-option').last().getAttribute('href'), /AGENT-SETUP\.md#codex$/);
    await page.locator('[data-stage="1"]').click();
    await page.evaluate(() => scrollTo(0, 0));
    fs.mkdirSync('.dogfood/screenshots', { recursive: true });
    await page.screenshot({ path: `.dogfood/screenshots/workbench-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], 'home must not wait on an external service');
    results.push({ width, overflow: false, keyboard: 'passed', externalRequests: 0 });
    await page.close();
  }
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4517/');
  await page.route('**/handoff-trace.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.reload();
  await page.getByText('The saved example could not load.').waitFor();
  assert.equal(await page.locator('[data-stage="0"]').isDisabled(), true);
} finally { await browser.close(); }
fs.writeFileSync('.dogfood/workbench-results.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
