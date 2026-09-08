import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {callHost} from './lib/host-call.mjs';
import {command} from './lib/local-checks.mjs';
const artifact=JSON.parse(fs.readFileSync('.dogfood/package-isolation-audit.json'));
assert.ok(artifact.passed,'Run test:install first');
const cli=path.join(artifact.installed,'bin/grainulator.js');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-next-hosts-'));
const report={at:new Date().toISOString(),directory,installed:artifact.installed,results:[]};
for(const [host,model] of [['codex','gpt-6-astra'],['claude','fable']]) {
 const cwd=path.join(directory,host);fs.mkdirSync(cwd);
 command([process.execPath,cli,'init','--dir',cwd,'--question','Is this synthetic service ready?','--audience','test','--constraints','The user alone can supply production access; no publication','--done','Local and production checks verified'],{cwd});
 command([process.execPath,cli,'add','--dir',cwd,'--id','r001','--type','risk','--topic','production-validation','--content','Production validation needs access that only the user can supply.','--evidence','stated'],{cwd});
 const mcpConfig={mcpServers:{grainulator:{command:process.execPath,args:[cli,'mcp','--dir',cwd],enabledTools:['compile']}}};
 try {
  const result=await callHost(host,'Call the Grainulator compiler and tell me the next steps. Only I can supply production access. This is a synthetic output test: do not execute the suggested follow-up work.',{cwd,model,mcpConfig,timeoutMs:90000,log:`.dogfood/next-actions-${host}.json`});
  assert.ok(result.toolCalls.length,'No observed compiler call');
  const answer=result.answer.replace(/\*\*|__/g,'').trim();
  assert.match(answer,/^(?:#{1,6}\s*)?Auto:?\s*\n/);
  assert.match(answer,/\n(?:#{1,6}\s*)?Manual:?\s*\n/);
  const manual=answer.split(/\n(?:#{1,6}\s*)?Manual:?\s*\n/)[1];
  assert.match(manual,/(?:^|\n)\s*[-*]\s+.*(?:access|credentials)/i);
  assert.doesNotMatch(answer,/Status:|Claims:|Research complete:/);
  report.results.push({host,model,passed:true,...result});
 } catch(error) {report.results.push({host,model,passed:false,error:error.message});}
 fs.writeFileSync('.dogfood/next-actions-host-audit.json',JSON.stringify(report,null,2));
}
report.passed=report.results.every(r=>r.passed);
fs.writeFileSync('.dogfood/next-actions-host-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,results:report.results.map(({host,passed,error})=>({host,passed,error}))},null,2));
if(!report.passed)process.exitCode=1;
