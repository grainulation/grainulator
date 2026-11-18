/** Read-only evidence status. Compilation is an explicit separate mutation. */
import {loadClaims} from './load-claims.js';
import {getStatus} from './claims-ops.js';
import nextActions from './next-actions.cjs';
export async function run(dir,args) {
  const json=args.includes('--json'), loaded=loadClaims(dir);
  if(!loaded.data){
    if(loaded.errors.length){const message=loaded.errors[0].message;if(json)console.log(JSON.stringify({schema_version:'grainulator.status.v1',status:'error',error:{code:loaded.errors[0].code,message}}));else console.error(message);process.exitCode=1;return;}
    const result={schema_version:'grainulator.status.v1',status:'no_sprint',error:'no_sprint',message:'No sprint found in this directory. Run grainulator init first.'};console.log(json?JSON.stringify(result):result.message);return;
  }
  const data=loaded.data,meta=data.meta||{},claims=data.claims||[],active=claims.filter(c=>c.status==='active');
  const inspected=getStatus(dir),tiers={};for(const claim of active)tiers[claim.evidence]=(tiers[claim.evidence]||0)+1;
  const result={schema_version:'grainulator.status.v1',question:meta.question||null,phase:meta.phase||'unknown',status:inspected.compilation_status,next_actions:inspected.next_actions,claims:{total:claims.length,active:active.length,superseded:claims.filter(c=>c.status==='superseded').length},evidence:tiers,topics:inspected.topic_list,conflicts:{unresolved:inspected.conflicts.length},...(meta.initiated?{age:{days:Math.floor((Date.now()-new Date(meta.initiated).getTime())/86400000),initiated:meta.initiated}}:{})};
  if(json)console.log(JSON.stringify(result,null,2));else console.log(`\n  ${result.question||'No question set'}\n  Phase:       ${result.phase}\n  Status:      ${result.status}\n  Claims:      ${claims.length} total, ${active.length} active\n  Topics:      ${result.topics.join(', ')}\n\n${nextActions.formatNextActions(result.next_actions)}`);
}
