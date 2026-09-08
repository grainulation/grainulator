import fs from 'node:fs';
import path from 'node:path';
import {execute} from '../../lib/runner.js';
export function hostArgs(host,{cwd,model,mcpConfig,sessionId,resume=false,hooks=false}={}) {
  if(host==='codex') {
    const args=['codex','exec','--ignore-user-config','--skip-git-repo-check','--json','-c','project_doc_max_bytes=0','-c','features.shell_tool=false'];
    if(model)args.push('--model',model);
    for(const [name,server] of Object.entries(mcpConfig?.mcpServers||{})) {
      args.push('-c',`mcp_servers.${name}.command=${JSON.stringify(server.command)}`,'-c',`mcp_servers.${name}.args=${JSON.stringify(server.args)}`);
      if(server.enabledTools){args.push('-c',`mcp_servers.${name}.enabled_tools=${JSON.stringify(server.enabledTools)}`);args.push('-c',`mcp_servers.${name}.tools={${server.enabledTools.map(tool=>`${JSON.stringify(tool)}={approval_mode="approve"}`).join(',')}}`);}
    }
    if(resume)args.push('resume',sessionId,'-');else args.push('--sandbox','read-only','--cd',cwd,...(sessionId?[]:['--ephemeral']),'-');
    return args;
  }
  if(host==='claude') {
    const args=['claude','-p','--output-format','json','--strict-mcp-config','--mcp-config',JSON.stringify(mcpConfig||{mcpServers:{}}),'--setting-sources','','--tools','','--max-turns','5'];
    if(!hooks)args.push('--settings','{"disableAllHooks":true}');
    if(model)args.push('--model',model);
    if(resume)args.push('--resume',sessionId);else if(sessionId)args.push('--session-id',sessionId);else args.push('--no-session-persistence');
    if(mcpConfig)args.push('--allowedTools',...Object.keys(mcpConfig.mcpServers).map(name=>`mcp__${name}__*`));
    return args;
  }
  throw Error(`Unsupported host: ${host}`);
}
export async function callHost(host,prompt,opts={}) {
  const started=Date.now();const argv=hostArgs(host,opts);
  const raw=await execute(argv,prompt,{cwd:opts.cwd,timeoutMs:opts.timeoutMs||90000,signal:opts.signal,maxBytes:4*1024*1024});
  const record={host,model:opts.model||'host default',durationMs:Date.now()-started,exitCode:raw.code,failure:raw.failure||null};
  if(opts.log){fs.mkdirSync(path.dirname(opts.log),{recursive:true});fs.writeFileSync(opts.log,JSON.stringify({record,stdout:raw.stdout,stderr:raw.stderr},null,2),{mode:0o600});}
  if(raw.failure||raw.code!==0)throw Error(`${host}: ${raw.failure||raw.stderr.slice(-1000)||raw.stdout.slice(-1000)}`);
  let answer='',usage=null,costUsd=null,sessionId=null,toolCalls=[];
  if(host==='claude') {
    const parsed=JSON.parse(raw.stdout);const events=Array.isArray(parsed)?parsed:[parsed];const data=events.findLast(e=>e.type==='result')||parsed;if(data.is_error)throw Error(data.result||JSON.stringify(data));
    answer=data.result;usage=data.usage||null;costUsd=data.total_cost_usd??null;sessionId=data.session_id;record.actualModels=Object.keys(data.modelUsage||{});
    toolCalls=events.flatMap(e=>(e.message?.content||[]).filter(c=>c.type==='tool_use'));record.permissionDenials=data.permission_denials||[];
  } else {
    const events=raw.stdout.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    for(const event of events) {
      if(event.type==='thread.started')sessionId=event.thread_id;
      if(event.type==='turn.completed')usage=event.usage;
      if(event.type==='item.completed'&&event.item?.type==='agent_message')answer=event.item.text;
      if(event.type==='item.completed'&&['mcp_tool_call','command_execution','web_search'].includes(event.item?.type))toolCalls.push(event.item);
    }
  }
  if(!answer?.trim())throw Error(`${host}: no final answer`);
  return {...record,answer,usage,costUsd,sessionId,toolCalls};
}
