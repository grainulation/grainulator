import fs from 'node:fs';import path from 'node:path';
import {callHost} from '../scripts/lib/host-call.mjs';
import {canStartCall} from '../scripts/lib/evaluation-usage.mjs';
const config=JSON.parse(fs.readFileSync(process.argv[2]));const req=JSON.parse(fs.readFileSync(0,'utf8'));
if(config.tokenAdmissionBudget){
 const previous=fs.readdirSync(config.logs).filter(f=>f.endsWith('.metrics.json')).map(f=>JSON.parse(fs.readFileSync(path.join(config.logs,f))));
 if(!canStartCall(previous,config.tokenAdmissionBudget))throw Error('Consumed-token admission budget exhausted; no additional model call started');
}
const prompt=`${req.task}\n\n${req.feedback?`Previous independent check: ${req.feedback}\nCorrect the result.`:'Solve carefully and check your answer before responding.'}\nDo not use tools.`;
const log=path.join(config.logs,`${req.runId}-${req.round}.json`);
const result=await callHost(config.host,prompt,{cwd:process.cwd(),model:config.model,log,timeoutMs:60000});
fs.writeFileSync(log+'.metrics.json',JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({answer:result.answer}));
