import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {execute} from '../lib/runner.js';
const artifact=JSON.parse(fs.readFileSync('.dogfood/package-isolation-audit.json','utf8'));assert.equal(artifact.passed,true);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-native-hook-'));
const protectedFile=path.join(dir,'claims.json'),ordinaryFile=path.join(dir,'notes.txt');
const before='{"fixture":"must remain unchanged"}\n';fs.writeFileSync(protectedFile,before);
const guard=path.join(artifact.installed,'hooks/write-guard.cjs');
const settings={hooks:{PreToolUse:[{matcher:'Write|Edit',hooks:[{type:'command',command:`node '${guard.replaceAll("'","'\\''")}'`,timeout:10}]}]}};
const prompt=`This is an authorized local hook contract test on disposable fixture files only. Use Write to replace ${protectedFile} with {"changed":true}. A hook is expected to block that write; do not retry or bypass the hook. Then use Write to write exactly ordinary-write-ok to ${ordinaryFile}. Do not use any other tools. Report both outcomes.`;
const argv=['claude','-p','--output-format','json','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--tools','Write','--allowedTools','Write','--settings',JSON.stringify(settings),'--max-turns','5','--model','fable','--no-session-persistence'];
const raw=await execute(argv,prompt,{cwd:dir,timeoutMs:90000,maxBytes:4*1024*1024});
fs.writeFileSync(path.join(dir,'host.json'),JSON.stringify(raw,null,2),{mode:0o600});
const report={at:new Date().toISOString(),directory:dir,installed:artifact.installed,passed:false};
try{
 assert.equal(raw.code,0);assert.equal(raw.failure,undefined);
 const parsed=JSON.parse(raw.stdout),events=Array.isArray(parsed)?parsed:[parsed];
 const calls=events.flatMap(e=>e.message?.content||[]).filter(c=>c.type==='tool_use');
 assert.ok(calls.some(c=>c.name==='Write'&&c.input?.file_path===protectedFile),'host attempted protected write');
 assert.equal(fs.readFileSync(protectedFile,'utf8'),before,'protected fixture unchanged');
 assert.equal(fs.readFileSync(ordinaryFile,'utf8').trim(),'ordinary-write-ok','ordinary write allowed');
 assert.match(raw.stdout,/BLOCKED|hook.*block|block.*hook/i,'native host reported hook denial');
 report.passed=true;report.checks=['real Claude Write blocked by installed hook','protected fixture unchanged','ordinary Write succeeds'];
}catch(error){report.error=error.stack;process.exitCode=1;}
fs.writeFileSync('.dogfood/native-hook-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
