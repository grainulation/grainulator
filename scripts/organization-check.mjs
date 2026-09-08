import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const results = [];
try {
  for (const width of [320, 768, 1024, 1440]) {
    const page = await browser.newPage({viewport:{width,height:1000}});
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => { if(new URL(route.request().url()).hostname === '127.0.0.1') return route.continue(); external.push(route.request().url()); return route.abort(); });
    await page.goto('http://127.0.0.1:4518/');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `organization overflow at ${width}`);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('[target="_blank"]').count(), 0);
    assert.equal(await page.locator('#product-title img').evaluate(el => el.complete && el.naturalWidth > 0), true);
    assert.equal(await page.locator('canvas').count(), 0);
    assert.doesNotMatch(await page.locator('main').textContent(), /Eight tools|npx @grainulation|npm install/);
    await page.locator('header a[href="#product"]').focus(); await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#product');
    await page.evaluate(() => scrollTo(0,0));
    await page.screenshot({path:`.dogfood/screenshots/organization-${width}.png`,fullPage:true});
    for (const link of await page.locator('a[href^="#"]').all()) {
      const id = (await link.getAttribute('href')).slice(1);
      assert.equal(await page.locator(`[id="${id}"]`).count(), 1);
    }
    const productLink = page.getByRole('link',{name:'Try the playground'});
    assert.equal(await productLink.getAttribute('href'), 'http://127.0.0.1:4517/playground/');
    await productLink.click();
    await page.locator('#question').waitFor();
    assert.equal(new URL(page.url()).pathname, '/playground/');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    results.push({width,overflow:false,keyboard:true,localProductNavigation:true,externalRequests:0});
    await page.close();
  }
  const context = await browser.newContext({javaScriptEnabled:false});
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4518/');
  assert.equal(await page.getByRole('link',{name:'Try the playground'}).getAttribute('href'), 'https://grainulator.app/playground/');
  assert.equal(await page.locator('#page-title').isVisible(), true);
  await context.close();
  if (process.argv.includes('--assets')) {
    const asset = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
    for (const size of [16, 32, 180]) {
      await asset.setViewportSize({width:size,height:size});
      await asset.goto('http://127.0.0.1:4518/favicon.svg');
      await asset.evaluate(size => { const svg = document.documentElement; svg.setAttribute('width',size); svg.setAttribute('height',size); }, size);
      await asset.screenshot({path:`../grainulation-dogfood/site/${size === 180 ? 'apple-touch-icon' : `favicon-${size}`}.png`});
    }
    await asset.setViewportSize({width:1200,height:630});
    await asset.goto('http://127.0.0.1:4518/social.svg');
    await asset.screenshot({path:'../grainulation-dogfood/site/social.png'});
    await asset.goto('http://127.0.0.1:4518/');
    await asset.emulateMedia({media:'print'});
    assert.equal(await asset.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
    await asset.pdf({path:'.dogfood/grainulation-preview.pdf',format:'A4',printBackground:true});
    await asset.close();
  }
} finally { await browser.close(); }
fs.writeFileSync('.dogfood/organization-results.json',JSON.stringify(results,null,2));
console.log('PASS: rebuilt organization site, responsive layout, keyboard navigation, local product links, and no-JS content.');
