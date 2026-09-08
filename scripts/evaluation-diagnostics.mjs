import fs from 'node:fs';
import {tasks,score,semanticScore} from '../evals/tasks.mjs';
const report=JSON.parse(fs.readFileSync('.dogfood/model-evaluation.json','utf8'));
const rows=report.results.map(row=>{
 const task=tasks.find(t=>t.id===row.task),first=row.baseline.calls[0]?.answer||'';
 const final=row.grainulator.calls.at(-1)?.answer||'';
 return {host:row.host,task:row.task,oneShotContract:score(task,first).passed,oneShotSemantic:semanticScore(task,first).passed,baselineSemantic:semanticScore(task,row.baseline.answer||'').passed,grainulatorSemantic:semanticScore(task,final).passed};
});
const summary=Object.fromEntries(['codex','claude'].map(host=>[host,Object.fromEntries(['oneShotContract','oneShotSemantic','baselineSemantic','grainulatorSemantic'].map(key=>[key,rows.filter(r=>r.host===host&&r[key]).length]))]));
const result={at:new Date().toISOString(),source:report.at,postHoc:true,note:'Diagnostics from preserved outputs; primary scores unchanged. One-shot scores use the baseline first candidate, not new paid calls. Semantic scoring tolerates prose around one JSON object.',rows,summary};
fs.writeFileSync('.dogfood/evaluation-diagnostics.json',JSON.stringify(result,null,2));console.log(JSON.stringify(summary,null,2));
