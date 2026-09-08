import fs from 'node:fs';
import path from 'node:path';
import {execute} from '../lib/runner.js';
const report={at:new Date().toISOString(),node:process.version,checks:[]};
const env={...process.env,PATH:`${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`};
const groups=[
 [['lint',['npm','run','lint']],['runtime',['npm','run','test:runtime']],['migration',[process.execPath,'scripts/migration-check.mjs']]],
 [['site',['npm','run','test:site']]],
 [['host-next-actions',[process.execPath,'scripts/next-actions-host-check.mjs']],['host-integration',[process.execPath,'scripts/host-integration-check.mjs']]],
];
await Promise.all(groups.map(async checks=>{
 for(const [name,argv] of checks){
  const result=await execute(argv,'',{cwd:process.cwd(),env,timeoutMs:300000,maxBytes:16*1024*1024});
  const log=`.dogfood/final-${name}.log`;fs.writeFileSync(log,result.stdout+result.stderr+(result.failure||''));
  const passed=result.code===0&&!result.failure;report.checks.push({name,passed,exitCode:result.code,log});
  console.log(`${name}: ${passed?'PASS':'FAIL'}`);fs.writeFileSync('.dogfood/final-acceptance.json',JSON.stringify(report,null,2));
 }
}));
report.passed=report.checks.every(c=>c.passed);fs.writeFileSync('.dogfood/final-acceptance.json',JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
