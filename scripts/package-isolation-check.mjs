import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {command,mcp,toolJSON} from './lib/local-checks.mjs';
import {createSession,exportSession} from '../site/research/session.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-install-'));
const report={at:new Date().toISOString(),passed:false,directory:dir,checks:[]};
const check=(name,fn)=>{fn();report.checks.push(name);};
try {
  if(process.env.GRAINULATOR_TEST_ARCHIVE){report.archive=path.resolve(process.env.GRAINULATOR_TEST_ARCHIVE);report.archiveBytes=fs.statSync(report.archive).size;}
  else {const packed=JSON.parse(command(['npm','pack','--ignore-scripts','--json','--pack-destination',dir],{cwd:root}))[0];report.archive=path.join(dir,packed.filename);report.archiveBytes=packed.size;}
  const consumer=path.join(dir,'consumer');fs.mkdirSync(consumer);fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({name:'isolated-consumer',version:'0.0.0',private:true}));
  command(['npm','install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(dir,'empty-cache'),report.archive],{cwd:consumer});
  report.checks.push('offline install with empty npm cache and scripts disabled');
  const installed=path.join(consumer,'node_modules/@grainulation/grainulator');report.installed=installed;
  check('retired application and notification hook absent from archive',()=>{
    for(const entry of ['apps','site/dashboard.html','site/product-navigation.js','hooks/sprint-status-notifier.cjs','packages/evidence/lib/connect.js','packages/evidence/lib/disconnect.js','packages/analytics/lib/farmer.js','packages/orchestration/lib/farmer.js'])assert.equal(fs.existsSync(path.join(installed,entry)),false,entry);
    const manifest=JSON.parse(fs.readFileSync(path.join(installed,'package.json')));assert.equal(manifest.dependencies?.ws,undefined);
  });
  const cli=path.join(installed,'bin/grainulator.js');
  const run=args=>command([process.execPath,cli,...args],{cwd:consumer});
  for(const args of [['dashboard','--help'],['evidence','connect','farmer'],['evidence','disconnect','farmer'],['analytics','connect','farmer'],['orchestrate','connect','farmer'],['legacy','farmer','start']])check(`retired command rejected: ${args.join(' ')}`,()=>assert.throws(()=>run(args)));
  check('installed binary is not a workspace symlink',()=>assert.equal(fs.lstatSync(installed).isSymbolicLink(),false));
  check('installed onboarding documents have their local link targets',()=>{
    const guides=['README.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','SECURITY.md','CHANGELOG.md',...fs.readdirSync(path.join(installed,'docs')).filter(name=>name.endsWith('.md')).map(name=>`docs/${name}`),...fs.readdirSync(path.join(installed,'packages')).map(name=>`packages/${name}/README.md`).filter(name=>fs.existsSync(path.join(installed,name)))];
    for(const guide of guides){
      const text=fs.readFileSync(path.join(installed,guide),'utf8');
      for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){
        const href=match[1];if(/^(?:[a-z]+:|#)/i.test(href))continue;
        const relative=href.split('#')[0];if(!relative)continue;
        const target=path.resolve(installed,path.dirname(guide),relative);
        assert.ok(target.startsWith(installed+path.sep)&&fs.existsSync(target),`${guide}: missing packaged link ${href}`);
      }
    }
  });
  check('CLI help',()=>assert.match(run(['--help']),/Grainulator/));
  check('doctor validates the required runtime and packaged components',()=>{const checks=JSON.parse(run(['doctor','--json'])).checks;assert.ok(checks.every(c=>c.available));assert.equal(checks.find(c=>c.component==='node').required,JSON.parse(fs.readFileSync(path.join(installed,'package.json'))).engines.node);});
  if(fs.existsSync(path.join(installed,'build-info.json')))check('identified build verifies all recorded files',()=>{const build=JSON.parse(run(['doctor','--json'])).build;assert.equal(build.verified,true);assert.match(build.id,/^(?:local-|release-[^-]+-)[a-f0-9]{16}$/);});
  for(const component of ['evidence','memory','export','analytics','orchestrate','legacy'])check(`${component} help`,()=>run([component,'--help']));
  const sprint=path.join(dir,'sprint');
  check('evidence init',()=>run(['init','--dir',sprint,'--question','Can the installed archive run independently?','--audience','test','--constraints','Local only','--done','Validated artifact']));
  check('evidence add',()=>run(['add','--dir',sprint,'--id','r001','--type','factual','--topic','installation','--content','A synthetic installation test claim.','--evidence','stated']));
  check('evidence compile with grouped next steps',()=>{const out=run(['compile','--dir',sprint]);assert.match(out,/^Auto\n/);assert.match(out,/\nManual\n/);assert.doesNotMatch(out,/Status:|Claims:/);});
  assert.ok(JSON.parse(fs.readFileSync(path.join(sprint,'claims.json'))).claims.some(c=>c.id==='r001'));
  const sessionFile=path.join(dir,'session.json');fs.writeFileSync(sessionFile,exportSession(createSession({question:'Test session portability',context:'Fixture only.',config:{webSearch:false}})));
  check('research preparation from exported session',()=>run(['research','--session',sessionFile,'--dir',path.join(dir,'research'),'--prepare-only']));
  for(const [name,args,tool] of [['grainulator',['mcp','--dir',sprint],'status'],['wheat',['wheat','mcp','--dir',sprint],'wheat/status'],['mill',['export','serve-mcp','--dir',sprint],'mill/formats'],['silo',['memory','serve-mcp'],'silo/list']]) {
    const client=mcp([process.execPath,cli,...args],{cwd:sprint,env:{SILO_STORE:path.join(dir,'silo')}});
    try {
      const init=await client.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'grainulator-install-check',version:'1'}});assert.equal(init.serverInfo.name,name);
      client.notify('notifications/initialized');
      const list=await client.request('tools/list');assert.ok(list.tools.some(t=>t.name===tool));
      const value=toolJSON(await client.request('tools/call',{name:tool,arguments:{dir:sprint}}));assert.equal(value.status,'ok');if(name==='wheat'||name==='grainulator'){assert.ok(Array.isArray(value.next_actions.auto));assert.ok(Array.isArray(value.next_actions.manual));assert.match(value.next_actions_instruction,/Auto and Manual/);}
      if(name==='grainulator') {
        assert.equal(list.tools.length,19);assert.ok(list.tools.every(tool=>!tool.name.includes('/')));
        assert.equal(toolJSON(await client.request('tools/call',{name:'wheat/status',arguments:{dir:sprint}})).status,'ok');
        assert.equal(toolJSON(await client.request('tools/call',{name:'memory_store',arguments:{dir:sprint,name:'Installed artifact'}})).claimCount,3);
        assert.equal(toolJSON(await client.request('tools/call',{name:'memory_search',arguments:{query:'synthetic'}})).count,1);
        assert.ok(toolJSON(await client.request('tools/call',{name:'exports_formats',arguments:{}})).count>0);
        assert.match(toolJSON(await client.request('tools/call',{name:'exports_convert',arguments:{format:'markdown'}})).output,/synthetic installation/);
        const resources=await client.request('resources/list');assert.equal(resources.resources.length,7);assert.ok(resources.resources.every(resource=>resource.uri.startsWith('grainulator://')));
        report.checks.push('installed unified evidence, memory, export, canonical resources and hidden aliases');
      }
      report.checks.push(`${name} MCP initialize, tools/list, tools/call`);
    } finally {await client.close();}
  }
  report.passed=true;
} catch(error) {report.error=error.message;process.exitCode=1;}
fs.mkdirSync(path.join(root,'.dogfood'),{recursive:true});fs.writeFileSync(path.join(root,'.dogfood/package-isolation-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
