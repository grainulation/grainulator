import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {command} from './lib/local-checks.mjs';
const configuredLegacy=process.env.GRAINULATOR_LEGACY_WHEAT;
if (!configuredLegacy) { console.error('Set GRAINULATOR_LEGACY_WHEAT to the legacy CLI file to test migration. No default checkout is assumed.'); process.exit(1); }
const legacy=path.resolve(configuredLegacy);
const report={at:new Date().toISOString(),passed:false,checks:[]};
const artifact=JSON.parse(fs.readFileSync('.dogfood/package-isolation-audit.json'));const cli=path.join(artifact.installed,'bin/grainulator.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grainulator-migration-'));report.directory=dir;
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try {
 assert.ok(artifact.passed);assert.ok(fs.existsSync(legacy),'Set GRAINULATOR_LEGACY_WHEAT to an existing legacy CLI');
 const old=path.join(dir,'old');fs.mkdirSync(old);
 command([process.execPath,legacy,'init','--headless','--dir',old,'--question','Legacy migration fixture','--audience','test','--constraints','Preserve IDs and metadata','--done','Round trip'],{cwd:old});
 command([process.execPath,legacy,'add','--dir',old,'--id','m001','--type','factual','--topic','migration','--content','Preserve this old claim','--evidence','stated'],{cwd:old});
 const claimsFile=path.join(old,'claims.json');const original=JSON.parse(fs.readFileSync(claimsFile));original.meta.custom_extension={nested:['keep',42]};original.claims.find(c=>c.id==='m001').custom_extension={owner:'fixture'};fs.writeFileSync(claimsFile,JSON.stringify(original,null,2));
 const config={mcpServers:{unrelated:{command:'fixture-other',args:['preserve']}},preferences:{theme:'user-choice'}};
 fs.writeFileSync(path.join(old,'host-config.json'),JSON.stringify(config));const hashes=Object.fromEntries(['claims.json','host-config.json'].map(name=>[name,digest(path.join(old,name))]));
 const upgraded=path.join(dir,'upgraded');fs.cpSync(old,upgraded,{recursive:true});
 command([process.execPath,cli,'add','--dir',upgraded,'--id','m002','--type','feedback','--topic','migration','--content','New-version fixture','--evidence','stated'],{cwd:upgraded});
 command([process.execPath,cli,'compile','--dir',upgraded,'--summary'],{cwd:upgraded});
 const next=JSON.parse(fs.readFileSync(path.join(upgraded,'claims.json')));
 assert.deepEqual(next.meta,original.meta);assert.deepEqual(next.claims.find(c=>c.id==='m001'),original.claims.find(c=>c.id==='m001'));assert.ok(next.claims.some(c=>c.id==='m002'));report.checks.push('legacy CLI creates data; installed CLI preserves IDs, custom claim fields and nested metadata');
 command([process.execPath,legacy,'status','--dir',upgraded],{cwd:upgraded});
 command([process.execPath,legacy,'add','--dir',upgraded,'--id','m003','--type','feedback','--topic','migration','--content','Rollback-version write','--evidence','stated'],{cwd:upgraded});
 assert.ok(JSON.parse(fs.readFileSync(path.join(upgraded,'claims.json'))).claims.some(c=>c.id==='m003'));report.checks.push('legacy CLI reads and writes new-version data after downgrade');
 const restored=path.join(dir,'restored');fs.cpSync(old,restored,{recursive:true});for(const [name,hash] of Object.entries(hashes)){assert.equal(digest(path.join(old,name)),hash);assert.equal(digest(path.join(restored,name)),hash);}report.checks.push('source copy untouched; snapshot rollback restores claims and unrelated host config byte for byte');
 report.passed=true;
} catch(error){report.error=error.message;process.exitCode=1;}
fs.writeFileSync('.dogfood/migration-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
