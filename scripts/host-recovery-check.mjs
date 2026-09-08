import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { callHost } from './lib/host-call.mjs';
import { command } from './lib/local-checks.mjs';

const artifact = JSON.parse(fs.readFileSync('.dogfood/package-isolation-audit.json', 'utf8'));
assert.ok(artifact.passed, 'Run test:install first');
const cli = path.join(artifact.installed, 'bin/grainulator.js');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grainulator-host-recovery-'));
const fixture = path.join(directory, 'wait.mjs');
fs.writeFileSync(fixture, `import fs from 'node:fs'; import readline from 'node:readline';
const send = (id,result) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => { const msg=JSON.parse(line); if(!('id' in msg))return;
if(msg.method==='initialize')send(msg.id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'recovery-fixture',version:'1'}});
else if(msg.method==='tools/list')send(msg.id,{tools:[{name:'wait',description:'Synthetic interruption test: record that the call started, then wait until the host process is interrupted. No external effects.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
else if(msg.method==='tools/call'){fs.writeFileSync(process.argv[2],'waiting');setTimeout(()=>send(msg.id,{content:[{type:'text',text:'Wait ended without interruption'}]}),120000);}
else send(msg.id,{});});
`);
const selected = new Set(process.argv.slice(2));
const report = { at: new Date().toISOString(), directory, installed: artifact.installed, results: [] };
for (const [host, model] of [['codex', 'gpt-6-astra'], ['claude', 'fable']]) {
  if (selected.size && !selected.has(host)) continue;
  const cwd = path.join(directory, host); fs.mkdirSync(cwd);
  const marker = randomUUID(), waiting = path.join(cwd, 'waiting');
  command([process.execPath, cli, 'init', '--dir', cwd, '--question', 'Synthetic interrupted native host recovery', '--audience', 'test', '--constraints', 'Use only this disposable fixture', '--done', 'Persisted claim survives interruption'], { cwd });
  const base = { grainulator: { command: process.execPath, args: [cli, 'mcp', '--dir', cwd], enabledTools: ['add_claim', 'search'] } };
  try {
    const first = await callHost(host, `Use the Grainulator add_claim tool once to add claim h001, type factual, topic recovery, evidence stated, content exactly "${marker}". Do not use other tools. This is a synthetic integration test. Reply with the ID.`, { cwd, model, mcpConfig: { mcpServers: base }, sessionId: randomUUID(), timeoutMs: 120000, log: `.dogfood/recovery-${host}-first.json` });
    assert.ok(first.sessionId); assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, 'claims.json'))).claims.find(claim => claim.id === 'h001')?.content, marker);
    const controller = new AbortController(); let observedWait = false;
    const timer = setInterval(() => { if (fs.existsSync(waiting)) { observedWait = true; controller.abort(); } }, 100);
    let interrupted;
    try {
      interrupted = await callHost(host, 'Call the recovery wait tool exactly once now. This is a synthetic host-interruption test; the harness will stop this process while the tool is pending. Do not call any other tool.', { cwd, model, mcpConfig: { mcpServers: { ...base, recovery: { command: process.execPath, args: [fixture, waiting], enabledTools: ['wait'] } } }, sessionId: first.sessionId, resume: true, signal: controller.signal, timeoutMs: 120000, log: `.dogfood/recovery-${host}-interrupted.json` });
    } catch (error) { interrupted = { error: error.message }; } finally { clearInterval(timer); }
    assert.ok(observedWait, 'Host never entered the controlled pending MCP call');
    assert.match(interrupted.error || '', /cancelled|aborted/i, 'Host did not report interruption');
    const resumed = await callHost(host, 'The harness interrupted your previous turn during a synthetic wait tool. That test is finished. Continue this same session and use Grainulator search to retrieve h001. Return its exact content. Do not add or mutate claims, and do not call the wait tool.', { cwd, model, mcpConfig: { mcpServers: base }, sessionId: first.sessionId, resume: true, timeoutMs: 120000, log: `.dogfood/recovery-${host}-resumed.json` });
    assert.equal(resumed.sessionId, first.sessionId); assert.ok(resumed.answer.includes(marker)); assert.ok(resumed.toolCalls.length > 0);
    const claims = JSON.parse(fs.readFileSync(path.join(cwd, 'claims.json'))).claims;
    assert.equal(claims.filter(claim => claim.id === 'h001').length, 1); assert.equal(claims.find(claim => claim.id === 'h001').content, marker);
    report.results.push({ host, model, passed: true, sessionId: first.sessionId, checks: ['installed Grainulator MCP mutation', 'native host interrupted while MCP tool pending', 'same native session resumed without bypass', 'real MCP retrieval after interruption', 'persisted claim unchanged and not duplicated'] });
    console.log(`PASS: ${host} interrupted native session resumes installed Grainulator tools.`);
  } catch (error) { report.results.push({ host, model, passed: false, error: error.message }); console.error(`FAIL: ${host}: ${error.message}`); }
  fs.writeFileSync('.dogfood/host-recovery-audit.json', JSON.stringify(report, null, 2));
}
report.passed = report.results.length > 0 && report.results.every(result => result.passed);
fs.writeFileSync('.dogfood/host-recovery-audit.json', JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
