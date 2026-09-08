import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4517/#q=Should%20we%20migrate%3F');
  await page.waitForFunction(() => document.querySelector('#question')?.value === 'Should we migrate?');
  assert.equal(new URL(page.url()).pathname, '/playground/');
  await page.goto('http://127.0.0.1:4517/research.html#q=Carry%20this%20question');
  await page.waitForFunction(() => document.querySelector('#question')?.value === 'Carry this question');
  assert.equal(new URL(page.url()).pathname, '/playground/');
  await page.goto('http://127.0.0.1:4517/#q=%E0%A4%A');
  await page.locator('#question').waitFor();
  assert.equal(await page.locator('#question').inputValue(), '');
  await page.goto('http://127.0.0.1:4517/?offline=1');
  await page.getByText('Example · no model called').waitFor();
  assert.match(await page.locator('#result-content').textContent(), /isolation/);
  console.log('PASS: old research URLs, shared questions, malformed hashes, and explicit sample labels.');
} finally { await browser.close(); }
