import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// A real native-plugin acceptance check. No mcp_servers overrides are injected.
// Installation is a separate, explicitly coordinated step. This check reads an
// installed cache and uses invocation-only plugin settings with current auth.
const root=fileURLToPath(new URL('../',import.meta.url));
const previous=process.argv.includes('--resume-only')?JSON.parse(fs.readFileSync(path.join(root,'.dogfood/codex-plugin-audit.json'))):null;
const fixture=previous?.fixture||fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-codex-plugin-'));
const report={...previous,at:new Date().toISOString(),node:process.version,fixture,checks:previous?.checks||[],passed:false};
delete report.error;
const successful=call=>{
  if(call.status!=='completed'||call.error||call.result?.isError||call.result?.is_error)return false;
  return (call.result?.content||[]).some(part=>{try{return JSON.parse(part.text).status==='ok';}catch{return false;}});
};
const env={...process.env,PATH:[path.dirname(process.execPath),process.env.PATH].filter(Boolean).join(path.delimiter)};
const run=(argv,{cwd=fixture,input,timeout=180000}={})=>{
  const result=spawnSync(argv[0],argv.slice(1),{cwd,env,input,encoding:'utf8',timeout,maxBuffer:16*1024*1024});
  if(result.status!==0)throw Error(`${argv[0]} ${argv[1]} failed: ${result.error?.message||result.stderr||result.stdout}`);
  return result.stdout;
};
try {
  const [marketplaceArg,cacheArg,marketName='grainulator-local-test']=process.argv.slice(2);
  assert.ok(marketplaceArg&&cacheArg,'Usage: node scripts/codex-plugin-check.mjs MARKETPLACE_ROOT INSTALLED_PLUGIN_ROOT [MARKETPLACE_NAME]');
  const marketplace=path.resolve(marketplaceArg),cache=path.resolve(cacheArg);
  const manifest=JSON.parse(fs.readFileSync(path.join(cache,'plugin.json')));
  const nativeMcp=JSON.parse(fs.readFileSync(path.join(cache,'mcp.json')));
  assert.equal(manifest.name,'grainulator');assert.ok(nativeMcp.mcpServers.grainulator);
  if(previous&&previous.pluginCache!==cache){
    const witnessFlag=process.argv.indexOf('--witness-root');
    const witnessRoot=witnessFlag>=0?path.resolve(process.argv[witnessFlag+1]):previous.pluginCache;
    const oldBuild=JSON.parse(fs.readFileSync(path.join(witnessRoot,'build-info.json')));
    assert.equal(oldBuild.version,previous.version,'mutation witness must be the previously tested version');
    const newBuild=JSON.parse(fs.readFileSync(path.join(cache,'build-info.json')));
    const executable=name=>/\.(?:[cm]?js|wasm)$/.test(name)||['mcp.json','.mcp.json'].includes(name);
    const runtime=Object.keys(oldBuild.files).filter(executable).sort();
    assert.deepEqual(Object.keys(newBuild.files).filter(executable).sort(),runtime,'runtime file inventory changed; a new mutation test is required');
    for(const name of runtime)assert.equal(newBuild.files[name],oldBuild.files[name],`${name} changed; a new mutation test is required`);
    report.mutationWitness={version:previous.version,pluginCache:previous.pluginCache,threadId:previous.threadId,witnessRoot,identicalRuntimeFiles:runtime.length};
  }
  report.version=manifest.version;report.pluginCache=cache;report.marketplace=marketplace;
  report.checks.push('installed cache contains native manifest and bundled MCP configuration');
  const sprint=path.join(fixture,'sprint');fs.mkdirSync(sprint,{recursive:true});report.workspace=sprint;
  if(process.argv.includes('--saved-workspace')) {
    env.GRAINULATOR_CONFIG=path.join(fixture,'workspace.json');
    delete env.GRAINULATOR_WORKSPACE;
    run([process.execPath,path.join(cache,'bin/grainulator.js'),'setup','--dir',sprint]);
    report.binding='saved configuration; no GRAINULATOR_WORKSPACE';
  } else env.GRAINULATOR_WORKSPACE=sprint;
  const pluginKey=`grainulator@${marketName}`;
  const userConfigPath=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'config.toml');
  const userConfig=fs.existsSync(userConfigPath)?fs.readFileSync(userConfigPath,'utf8'):'';
  const pluginEntries=[];
  for(const match of userConfig.matchAll(/^\[plugins\."([^"]+)"\]$/gm))if(match[1]!==pluginKey)pluginEntries.push(`${JSON.stringify(match[1])}={enabled=false}`);
  const toolPolicy=['init','add_claim','compile','status','search'].map(name=>`${name}={approval_mode="approve"}`).join(',');
  pluginEntries.push(`${JSON.stringify(pluginKey)}={enabled=true,mcp_servers={grainulator={default_tools_approval_mode="approve",tools={${toolPolicy}}}}}`);
  const isolatedFlags=['-c',`plugins={${pluginEntries.join(',')}}`];
  for(const match of userConfig.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+|"[^"]+")\]$/gm)){
    const key=match[1].startsWith('"')?JSON.parse(match[1]):match[1];
    assert.match(key,/^[A-Za-z0-9_-]+$/,'test helper requires a simple direct MCP server identifier');
    isolatedFlags.push('-c',`mcp_servers.${key}.enabled=false`);
  }
  // Override one complete plugins table: quoted segments in dotted CLI keys
  // otherwise become literal quoted keys in Codex 0.153.4.
  const flags=[...isolatedFlags,'-c',`marketplaces.${marketName}.source_type="local"`,'-c',`marketplaces.${marketName}.source=${JSON.stringify(marketplace)}`,'-c','project_doc_max_bytes=0','-c','features.shell_tool=false'];
  const resolved=JSON.parse(run(['codex','mcp','list','--json',...flags],{cwd:sprint}));
  fs.writeFileSync(path.join(fixture,'resolved-mcp.json'),JSON.stringify(resolved,null,2));
  const active=resolved.filter(server=>server.enabled);
  assert.deepEqual(active.map(server=>server.name),['grainulator']);
  assert.equal(active[0].transport.args[0],path.join(cache,'bin/grainulator-plugin.js'));
  report.checks.push('only selected cached Grainulator server is enabled; bundled absolute executable verified');
  const prompt=run(['codex','debug','prompt-input',...flags,'Native plugin discovery check'],{cwd:sprint});
  fs.writeFileSync(path.join(fixture,'prompt-input.json'),prompt);
  const promptText=JSON.parse(prompt).flatMap(item=>item.content||[]).map(item=>item.text||'').join('\n');
  const rootLine=promptText.split('\n').find(line=>line.includes('`'+path.join(cache,'skills')+'`'));
  const alias=rootLine?.match(/`(r\d+)`/)?.[1];
  assert.ok(promptText.split('\n').some(line=>line.includes('grainulator:status:')&&(line.includes(path.join(cache,'skills/status/SKILL.md'))||(alias&&line.includes(`${alias}/status/SKILL.md`)))),'status skill must be discovered from installed plugin');
  assert.ok(!promptText.includes('/plugins/cache/grainulation-marketplace/'),'old remote Grainulator skills must not appear in isolated catalog');
  report.checks.push('native installed status skill appears in model-visible prompt');
  if(!previous){
  const request=`This is a synthetic native-plugin acceptance check. Use the installed Grainulator plugin MCP tools to initialize a sprint in ${sprint} with question Native plugin acceptance, audience test. Add one factual claim id c001, topic plugin, content NATIVE-CODEX-PLUGIN-ACCEPTANCE, evidence stated. Compile and read status. All tools must receive dir ${sprint}. Do not use shell, direct file edits, external research or other plugins. End with Auto and Manual next steps.`;
  const result=spawnSync('codex',['exec','--model','gpt-6-astra','--skip-git-repo-check','--json','--approve-for-me','--cd',sprint,...flags,'-'],{cwd:sprint,env,input:request,encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024});
  fs.writeFileSync(path.join(fixture,'session.jsonl'),result.stdout||'');fs.writeFileSync(path.join(fixture,'session.stderr'),result.stderr||'');
  assert.equal(result.status,0,result.error?.message||result.stderr);
  const events=result.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const calls=events.filter(event=>event.type==='item.completed'&&event.item?.type==='mcp_tool_call').map(event=>event.item);
  report.toolCalls=calls.map(call=>({server:call.server,tool:call.tool,status:call.status,error:call.error}));
  for(const name of ['init','add_claim','compile','status'])assert.ok(calls.some(call=>call.tool===name&&successful(call)),`native ${name} call missing`);
  assert.ok(calls.every(call=>call.server.includes('grainulator')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(sprint,'claims.json'))).claims.find(claim=>claim.id==='c001')?.content,'NATIVE-CODEX-PLUGIN-ACCEPTANCE');
  report.checks.push('native plugin init, add_claim, compile, status and persisted claim');
  const threadId=events.find(event=>event.type==='thread.started')?.thread_id;
  assert.match(threadId||'',/^[0-9a-f-]{36}$/i,'first native run must return its own session UUID');
  report.threadId=threadId;
  }
  const threadId=report.threadId;
  assert.match(threadId||'',/^[0-9a-f-]{36}$/i);
  const savedEvents=fs.readFileSync(path.join(fixture,'session.jsonl'),'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  for(const name of ['init','add_claim','compile','status'])assert.ok(savedEvents.some(event=>event.type==='item.completed'&&event.item?.tool===name&&successful(event.item)),`saved native ${name} result must be successful`);
  const beforeResume=fs.readFileSync(path.join(sprint,'claims.json'),'utf8');
  const resumeRequest=`Resume this exact native-plugin acceptance session. Make a fresh call to the installed Grainulator search MCP tool now; a remembered answer is not sufficient. Find claim c001 in ${sprint} using query NATIVE-CODEX-PLUGIN-ACCEPTANCE. Report its exact content and Auto/Manual next steps. No mutations, shell, direct file edits, external research or other plugins.`;
  const continued=spawnSync('codex',['exec','--model','gpt-6-astra','--skip-git-repo-check','--json','--approve-for-me',...flags,'resume',threadId,'-'],{cwd:sprint,env,input:resumeRequest,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
  fs.writeFileSync(path.join(fixture,'resume.jsonl'),continued.stdout||'');fs.writeFileSync(path.join(fixture,'resume.stderr'),continued.stderr||'');
  assert.equal(continued.status,0,continued.error?.message||continued.stderr);
  const continuation=continued.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const resumeCalls=continuation.filter(event=>event.type==='item.completed'&&event.item?.type==='mcp_tool_call').map(event=>event.item);
  assert.equal(continuation.find(event=>event.type==='thread.started')?.thread_id,threadId,'resume must use only the fixture thread');
  assert.ok(resumeCalls.some(call=>call.tool==='search'&&successful(call)),'continued native search call missing');
  const answer=continuation.filter(event=>event.type==='item.completed'&&event.item?.type==='agent_message').map(event=>event.item.text).join('\n');
  assert.ok(answer.includes('NATIVE-CODEX-PLUGIN-ACCEPTANCE'));
  assert.equal(fs.readFileSync(path.join(sprint,'claims.json'),'utf8'),beforeResume,'continuation retrieval must not mutate the ledger');
  report.resumeToolCalls=resumeCalls.map(call=>({server:call.server,tool:call.tool,status:call.status,error:call.error}));
  report.checks.push('exact native session continuation retrieves the persisted claim through plugin search');
  report.checks=[...new Set(report.checks)];
  report.passed=true;
} catch(error){report.error=error.message;process.exitCode=1;}
finally {
  fs.mkdirSync(path.join(root,'.dogfood'),{recursive:true});
  fs.writeFileSync(path.join(root,'.dogfood/codex-plugin-audit.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
