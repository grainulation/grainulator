import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {callHost} from './lib/host-call.mjs';import {runTask} from '../lib/runner.js';import {tasks,score} from '../evals/tasks.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-evaluation-'));
const output=path.join(root,'.dogfood/model-evaluation.json');const report={at:new Date().toISOString(),protocol:'pilot-v1',directory:dir,budget:{maxCallsPerArm:2,timeoutPerCallMs:60000},limitations:['Four synthetic tasks; one paired trial per model/task; not a general quality benchmark.','Equal call ceilings, not equal consumed tokens. Baseline self-reviews; Grainulator stops when independently verified.','Model defaults/system prompts differ between hosts; compare within each host only.','Reported Claude USD is provider-estimated API-equivalent usage; Codex subscription USD is unavailable.'],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));save();
for(const [host,model] of [['codex','gpt-6-astra'],['claude','fable']])for(const [index,task] of tasks.entries()) {
 const cwd=path.join(dir,host,task.id);fs.mkdirSync(cwd,{recursive:true});const row={host,model,task:task.id};
 const logs=path.join(cwd,'logs');fs.mkdirSync(logs);const configFile=path.join(cwd,'adapter.json');fs.writeFileSync(configFile,JSON.stringify({host,model,logs}));
 for(const arm of index%2?['grainulator','baseline']:['baseline','grainulator']) {
  const start=Date.now();try {
   if(arm==='baseline') {
    const first=await callHost(host,task.prompt+'\nSolve carefully and check your answer before responding. Do not use tools.',{cwd,model,log:path.join(logs,'baseline-1.json'),timeoutMs:60000});
    const second=await callHost(host,`${task.prompt}\nYour first candidate was:\n${first.answer}\nIndependently self-review the candidate against all supplied rules, correct any errors, and return your final answer. Do not use tools.`,{cwd,model,log:path.join(logs,'baseline-2.json'),timeoutMs:60000});
    row[arm]={...score(task,second.answer),answer:second.answer,durationMs:Date.now()-start,calls:[first,second]};
   } else {
    const run=await runTask({task:task.prompt,adapter:[process.execPath,path.join(root,'evals/cli-adapter.mjs'),configFile],verifier:[process.execPath,path.join(root,'evals/verifier.mjs'),task.id],cwd,maxRounds:2,timeoutMs:65000});
    const calls=fs.readdirSync(logs).filter(f=>f.endsWith('.metrics.json')).map(f=>JSON.parse(fs.readFileSync(path.join(logs,f))));
    row[arm]={...score(task,run.rounds.at(-1)?.answer||''),status:run.status,durationMs:Date.now()-start,calls,trace:run.trace,error:run.error||null};
   }
  } catch(error){row[arm]={passed:false,error:error.message,durationMs:Date.now()-start,calls:[]};}
  console.log(`${host} ${task.id} ${arm}: ${row[arm].error?'ERROR':row[arm].passed?'PASS':'FAIL'}`);
 }
 report.results.push(row);save();
}
report.summary=Object.fromEntries(['codex','claude'].map(host=>[host,Object.fromEntries(['baseline','grainulator'].map(arm=>{
 const rows=report.results.filter(r=>r.host===host).map(r=>r[arm]);const calls=rows.flatMap(r=>r.calls);
 return [arm,{passed:rows.filter(r=>r.passed).length,total:rows.length,errors:rows.filter(r=>r.error).length,calls:calls.length,durationMs:rows.reduce((n,r)=>n+r.durationMs,0),inputTokens:calls.reduce((n,c)=>n+(c.usage?.input_tokens||0)+(c.usage?.cache_read_input_tokens||0)+(c.usage?.cache_creation_input_tokens||0),0),outputTokens:calls.reduce((n,c)=>n+(c.usage?.output_tokens||0),0),reportedCostUsd:calls.every(c=>c.costUsd!==null)?calls.reduce((n,c)=>n+c.costUsd,0):null}];
}))]));save();console.log(JSON.stringify(report.summary,null,2));
if(report.results.some(r=>r.baseline.error||r.grainulator.error))process.exitCode=1;
