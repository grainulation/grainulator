import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {callHost} from './lib/host-call.mjs';import {command} from './lib/local-checks.mjs';
const artifact=JSON.parse(fs.readFileSync('.dogfood/package-isolation-audit.json'));assert.ok(artifact.passed,'Run test:install first');
const cli=path.join(artifact.installed,'bin/grainulator.js');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-live-hosts-'));
const selected=new Set(process.argv.slice(2));
const prior=fs.existsSync('.dogfood/host-integration-audit.json')?JSON.parse(fs.readFileSync('.dogfood/host-integration-audit.json')).results:[];
const report={at:new Date().toISOString(),directory:dir,installed:artifact.installed,results:selected.size?prior.filter(r=>!selected.has(r.host)):[]};
for(const [host,model] of [['codex','gpt-6-astra'],['claude','fable']]) {
  if(selected.size&&!selected.has(host))continue;
  const cwd=path.join(dir,host);fs.mkdirSync(cwd);
  command([process.execPath,cli,'init','--dir',cwd,'--question','Can this host call the installed evidence engine?','--audience','test','--constraints','Synthetic local test only','--done','A recorded MCP tool call'],{cwd});
  const config={mcpServers:{grainulator:{command:process.execPath,args:[cli,'mcp','--dir',cwd],enabledTools:['add_claim','compile','status','search']}}};
  try {
    const marker=randomUUID();
    const first=await callHost(host,`Use the Grainulator MCP tools, not shell or file editing. Add exactly one factual claim with id h001, topic host-test, evidence stated, and content "${marker}" to the current sprint. Then call the compiler and status tools. In your final reply include the claim ID and count. This is a synthetic integration test.`,{cwd,model,mcpConfig:config,sessionId:randomUUID(),timeoutMs:120000,log:`.dogfood/host-${host}-first.json`});
    const claims=JSON.parse(fs.readFileSync(path.join(cwd,'claims.json')));assert.equal(claims.claims.find(c=>c.id==='h001')?.content,marker);
    assert.ok(first.toolCalls.length>=1,'No observed tool invocation');
    const second=await callHost(host,'Continue this same session. Use the MCP search tool to retrieve h001. Return its exact content and do not add another claim.',{cwd,model,mcpConfig:config,sessionId:first.sessionId,resume:true,timeoutMs:90000,log:`.dogfood/host-${host}-resume.json`});
    assert.ok(second.answer.includes(marker));assert.ok(second.toolCalls.length>=1);
    report.results.push({host,model,passed:true,first,continuation:second});
    console.log(`${host}: MCP mutation, compilation, and session continuation passed`);
  } catch(error){report.results.push({host,model,passed:false,error:error.message});console.log(`${host}: failed; details saved`);}
  fs.writeFileSync('.dogfood/host-integration-audit.json',JSON.stringify(report,null,2));
}
report.passed=report.results.every(r=>r.passed);fs.writeFileSync('.dogfood/host-integration-audit.json',JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
