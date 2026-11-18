/** Release contract gate: inspect executable contracts, not arbitrary user/provenance text. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TOOLS,RESOURCES} from '../lib/grainulator-mcp.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
assert.deepEqual(Object.keys(pkg.bin),['grainulator']);
const tools=['evidence_health','premise_links','correct_claim','observe_source','findings','finding_action','duplicate_candidates','acceptance_check','acceptance_set','compile','add_claim','import_claims','resolve','search','status','init','deepwiki','sync_log','memory_search','memory_list','memory_pull','memory_store','memory_packs','memory_graph','memory_confluence','memory_smart_fetch','exports_convert','exports_formats','exports_preview'];
assert.deepEqual(TOOLS.map(t=>t.name).sort(),tools.sort());
assert.equal(new Set(RESOURCES.map(r=>r.uri)).size,7);assert.ok(RESOURCES.every(r=>r.uri.startsWith('grainulator://')));
for(const component of ['evidence','memory','exports','analytics','orchestration','shared','runtime']){const metadata=JSON.parse(fs.readFileSync(path.join(root,'packages',component,'package.json')));assert.equal(metadata.name,`@grainulation/grainulator-${component}`);assert.equal(metadata.version,pkg.version);assert.equal(metadata.private,true);assert.equal(metadata.bin,undefined);}
assert.equal(fs.existsSync(path.join(root,'packages/legacy-cli')),false);
const [packed]=JSON.parse(execFileSync('npm',['pack','--dry-run','--json','--ignore-scripts'],{cwd:root,encoding:'utf8'}));
const forbidden=[/@grainulation\/(?:wheat|bean|barn|silo|mill|harvest|orchard)(?=[\s/"'`]|$)/, /(?:wheat|silo|mill):\/\//, /["'`](?:wheat|silo|mill)\/[a-z_-]+["'`]/, /process\.env\.(?:WHEAT_|SILO_|BARN_)/, /["'`]\.(?:wheat|silo|bean|grainulation)(?:["'`/])/, /wheat\.config\.json|orchard\.json|wheat-manifest\.json/];
const historical=new Set(['CHANGELOG.md']); // exact immutable release history, not executable fallback
const failures=[];
for(const entry of packed.files){const relative=entry.path;if(relative.startsWith('migration/'))failures.push(`${relative}: converter shipped in normal base`);if(/packages\/runtime\/(?:\.claude-plugin|\.codex-plugin|skills)\//.test(relative))failures.push(`${relative}: nested plugin`);if(historical.has(relative)||relative.endsWith('/LICENSE')||relative.endsWith('/CHANGELOG.md')||!/(?:\.(?:js|mjs|cjs|json|html|md|ya?ml)|\/grainulator\.1)$/.test(relative))continue;const source=fs.readFileSync(path.join(root,relative),'utf8');for(const rule of forbidden)if(rule.test(source))failures.push(`${relative}: ${rule}`);if(relative.endsWith('.html')&&/\b(?:Wheat|Silo|Mill|Harvest|Orchard|Barn|Bean)\b/.test(source))failures.push(`${relative}: historical visible template branding`);}
assert.deepEqual(failures,[],'Legacy executable/product contracts remain in the base archive');
console.log(`Canonical surface verified: ${TOOLS.length} tools, ${RESOURCES.length} resources, one root binary and ${packed.files.length} shipped files.`);
