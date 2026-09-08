import fs from 'node:fs';
import path from 'node:path';
import {execute} from '../lib/runner.js';
const roots=process.argv.slice(2);
if(!roots.length)throw Error('Pass one or more absolute Node executable paths');
const report={at:new Date().toISOString(),platform:process.platform,arch:process.arch,results:[]};
for(const executable of roots){
 const version=(await execute([executable,'--version'],'',{cwd:process.cwd()})).stdout.trim();
 const major=version.match(/^v(\d+)/)?.[1];if(!['24','25'].includes(major))throw Error(`Unexpected test runtime ${version}`);
 const audit=`.dogfood/node-${major}`;fs.mkdirSync(audit,{recursive:true});
 const env={...process.env,PATH:`${path.dirname(executable)}${path.delimiter}${process.env.PATH}`,GRAINULATOR_TEST_REPORT_DIR:audit};
 for(const [name,args] of [['workspace',['scripts/test-workspace.mjs']],['package',['scripts/package-isolation-check.mjs']],['site-build',['scripts/build-site.mjs']]]){
  const r=await execute([executable,...args],'',{cwd:process.cwd(),env,timeoutMs:900000,maxBytes:16*1024*1024});
  fs.writeFileSync(path.join(audit,`${name}.log`),r.stdout+r.stderr+(r.failure||''));
  const item={version,name,passed:r.code===0&&!r.failure,exitCode:r.code,failure:r.failure||null,log:path.join(audit,`${name}.log`)};
  report.results.push(item);console.log(`${version} ${name}: ${item.passed?'PASS':'FAIL'}`);
  if(name==='package'&&fs.existsSync('.dogfood/package-isolation-audit.json'))fs.copyFileSync('.dogfood/package-isolation-audit.json',path.join(audit,'package-isolation-audit.json'));
  fs.writeFileSync('.dogfood/node-matrix-audit.json',JSON.stringify(report,null,2));
 }
}
report.passed=report.results.every(r=>r.passed);fs.writeFileSync('.dogfood/node-matrix-audit.json',JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
