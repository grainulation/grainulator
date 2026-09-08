import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {callHost} from './lib/host-call.mjs';
const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-host-smoke-'));
const results=[];
for(const [host,model] of [['codex','gpt-6-astra'],['claude','fable']]) {
  try {const result=await callHost(host,'Reply with exactly GRAINULATOR_HOST_OK. Do not use tools.',{cwd,model,timeoutMs:60000,log:`.dogfood/host-smoke-${host}.json`});results.push(result);console.log(`${host}: ${result.answer}`);}
  catch(error){results.push({host,error:error.message});console.log(`${host}: failed; see report`);}
}
fs.writeFileSync('.dogfood/host-smoke.json',JSON.stringify(results,null,2));
