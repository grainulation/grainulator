import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createHandler } from '../lib/grainulator-mcp.js';
const dir = path.resolve('.dogfood/audit-render');
fs.mkdirSync(dir, {recursive:true});
const fixture = {schema_version:'1.0', meta:{question:'A long source URL https://example.com/'+'x'.repeat(200)}, claims:[
  {id:'risk', type:'risk', topic:'audit', content:'</script><script>globalThis.__injected=1</script><img src=x onerror="globalThis.__injected=1"> '+ 'unbroken'.repeat(100), status:'active', evidence:'tested'},
  {id:'recommendation', type:'recommendation', topic:'audit', content:'Check keyboard navigation and narrow viewports.', status:'active', evidence:'documented'},
]};
fs.writeFileSync(path.join(dir,'claims.json'),JSON.stringify(fixture));
const call = createHandler({dir,memoryDir:path.join(dir,'memory')});
const launch = process.env.GRAINULATOR_CHROME ? {executablePath:process.env.GRAINULATOR_CHROME} : {};
const browser = await chromium.launch({headless:true,...launch});
const results=[];
try {
 for(const format of ['html-report','executive-summary','slide-deck']) {
  const output=path.join(dir,format+'.html');
  const rpc=JSON.parse(await call('tools/call',{name:'exports_convert',arguments:{dir,source:'claims.json',format,output}},1));
  assert.equal(JSON.parse(rpc.result.content[0].text).status,'ok');
  for(const width of [390,1280]) {
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
   await page.goto('file://'+output);
   await page.keyboard.press('Tab');
   const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+2,injected:globalThis.__injected??null,focus:document.activeElement.tagName,lang:document.documentElement.lang,text:document.body.innerText.length}));
   await page.screenshot({path:path.join(dir,`${format}-${width}.png`),fullPage:true});
   results.push({format,width,...result,errors});
   assert.equal(result.overflow,false,`${format} ${width} overflow`);
   assert.equal(result.injected,null);assert.deepEqual(errors,[]);assert.equal(result.lang,'en');assert.ok(result.text>100);
   assert.notEqual(result.focus,'BODY',`${format} keyboard entry`);
   await page.close();
  }
 }
} finally {
 await browser.close();
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));
}
console.log(JSON.stringify(results,null,2));
