import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const baseline = process.argv.includes('--baseline');
const results = [];
try {
  for (const [name, width, height, dpr] of [['desktop', 1440, 1000, 2], ['phone', 390, 844, 3]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      window.drawCount = 0;
      const draw = WebGLRenderingContext.prototype.drawArrays;
      WebGLRenderingContext.prototype.drawArrays = function(...args) { window.drawCount++; return draw.apply(this, args); };
    });
    await page.goto('http://127.0.0.1:4517/');
    await page.locator('#decision[data-allowed="false"]').waitFor();
    await page.waitForTimeout(500);
    const measurement = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas');
      const initialDraws = window.drawCount;
      const intervals = [];
      let last = performance.now();
      const started = last;
      // Exercise continuous scroll events without modifying the render scheduler.
      dispatchEvent(new Event('scroll'));
      while (performance.now() - started < 1200) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        intervals.push(now - last); last = now;
        scrollBy({ top: 10, behavior: 'instant' });
        dispatchEvent(new Event('scroll'));
      }
      intervals.sort((a,b) => a-b);
      return { canvasPixels: canvas.width * canvas.height, drawsWhileScrolling: window.drawCount - initialDraws,
        frameP95Ms: Math.round(intervals[Math.floor(intervals.length * .95)]), frames: intervals.length,
        fallback: document.body.classList.contains('webgl-fallback'), scrollY };
    });
    if (!baseline) {
      assert.ok(measurement.canvasPixels <= 800000, 'background rendering must fit its pixel budget');
      assert.ok(measurement.drawsWhileScrolling <= 1, 'background must yield while scrolling');
      assert.ok(measurement.scrollY > 0);
      if (!measurement.fallback) {
        const before = await page.evaluate(() => window.drawCount);
        await page.waitForFunction(n => window.drawCount > n, before, { timeout: 2000 });
      }
      // User pause must survive scrolling, resizing, and tab visibility changes.
      await page.locator('#motion-toggle').click();
      const beforePause = await page.evaluate(() => window.drawCount);
      await page.evaluate(() => { dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window.drawCount), beforePause);
      assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: width - 10, height });
      await page.waitForTimeout(300);
      const afterResize = await page.evaluate(() => window.drawCount);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.drawCount), afterResize, 'reduced motion must remain static after resize');
    }
    results.push({ name, ...measurement });
    await page.close();
  }
} finally { await browser.close(); }
fs.mkdirSync('.dogfood', { recursive: true });
fs.writeFileSync(`.dogfood/scroll-${baseline ? 'before' : 'after'}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
