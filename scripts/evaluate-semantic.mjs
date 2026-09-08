import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {callHost} from './lib/host-call.mjs';
import {usageTotals} from './lib/evaluation-usage.mjs';
import {runTask} from '../lib/runner.js';
import {tasks,score} from '../evals/semantic-tasks.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-semantic-'));
const output=path.join(root,'.dogfood/semantic-evaluation.json');
const report={at:new Date().toISOString(),protocol:'semantic-v2',directory,casesHash:createHash('sha256').update(JSON.stringify(tasks)).digest('hex'),repetitions:2,caseCount:tasks.length,budget:{oneShotCalls:1,grainulatorMaxCalls:2,tokenAdmissionBudgetPerArm:40000,timeoutPerCallMs:60000},limitations:['Synthetic held-out cases authored and frozen before this run; not a general benchmark.','Separate independent one-shot baseline; verifier has expected values, models never receive them.','A 40,000 consumed-token admission budget prevents starting another call after exhaustion; it does not cap an in-flight host call.','Equal admission ceilings do not imply equal consumed tokens. Cross-host token/cost comparisons are unsupported.','Host-model defaults differ; compare arms only within the same host.'],results:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));save();
await Promise.all([['codex','gpt-6-astra'],['claude','fable']].map(async([host,model])=>{
 for(let repetition=0;repetition<report.repetitions;repetition++)for(const [i,task] of tasks.entries()){
  const cwd=path.join(directory,host,`${task.id}-${repetition}`);fs.mkdirSync(cwd,{recursive:true});
  const logs=path.join(cwd,'grainulator-logs');fs.mkdirSync(logs);
  const config=path.join(cwd,'adapter.json');fs.writeFileSync(config,JSON.stringify({host,model,logs,tokenAdmissionBudget:report.budget.tokenAdmissionBudgetPerArm}));
  const row={host,model,task:task.id,family:task.family,repetition};
  for(const arm of (i+repetition)%2?['grainulator','oneShot']:['oneShot','grainulator']){
   const started=Date.now();
   try{
    if(arm==='oneShot'){
     const call=await callHost(host,`${task.prompt}\nSolve carefully and check your answer before responding. Do not use tools.`,{cwd,model,timeoutMs:60000,log:path.join(cwd,'one-shot.json')});
     row[arm]={...score(task,call.answer),answer:call.answer,calls:[call],durationMs:Date.now()-started};
    }else{
     const result=await runTask({task:task.prompt,adapter:[process.execPath,path.join(root,'evals/cli-adapter.mjs'),config],verifier:[process.execPath,path.join(root,'evals/semantic-verifier.mjs'),task.id],cwd,maxRounds:2,timeoutMs:65000});
     const calls=fs.readdirSync(logs).filter(f=>f.endsWith('.metrics.json')).map(f=>JSON.parse(fs.readFileSync(path.join(logs,f))));
     const answer=result.rounds.at(-1)?.answer||'';
     row[arm]={...score(task,answer),answer,status:result.status,error:result.error||null,calls,trace:result.trace,durationMs:Date.now()-started};
    }
    row[arm].consumed=usageTotals(row[arm].calls);
   }catch(error){row[arm]={semantic:false,format:false,error:error.message,calls:[],durationMs:Date.now()-started};}
  }
  report.results.push(row);save();console.log(`${host} ${task.id} #${repetition+1}: one-shot=${row.oneShot.semantic}/${row.oneShot.format}, grainulator=${row.grainulator.semantic}/${row.grainulator.format}`);
 }
}));
report.summary=Object.fromEntries(['codex','claude'].map(host=>[host,Object.fromEntries(['oneShot','grainulator'].map(arm=>{
 const rows=report.results.filter(r=>r.host===host).map(r=>r[arm]);
 return [arm,{total:rows.length,semanticPasses:rows.filter(r=>r.semantic).length,formatPasses:rows.filter(r=>r.format).length,errors:rows.filter(r=>r.error).length,...usageTotals(rows.flatMap(r=>r.calls)),durationMs:rows.reduce((n,r)=>n+r.durationMs,0)}];
}))]));
report.completed=true;save();console.log(JSON.stringify(report.summary,null,2));
if(report.results.some(r=>r.oneShot.error||r.grainulator.error))process.exitCode=1;
