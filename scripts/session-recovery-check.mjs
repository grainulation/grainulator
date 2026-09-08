import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSession, exportSession, importSession } from '../site/research/session.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function checkSessionRecovery() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'grainulator-recovery-'));
  const cli = process.env.GRAINULATOR_TEST_CLI || path.join(root, 'bin/grainulator.js');
  const secret = 'synthetic-recovery-key-do-not-export';
  const requests = [];
  let activeChild, interrupt = true;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    assert.equal(req.url, '/v1/chat/completions');
    assert.equal(req.headers.authorization, `Bearer ${secret}`);
    const pass = input.messages[0].content.startsWith('Investigate') ? 'research' : 'synthesis';
    requests.push(pass);
    if (pass === 'synthesis' && interrupt) {
      interrupt = false;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Unfinished text must not become a checkpoint"}}]}\n\n');
      setTimeout(() => activeChild.kill('SIGINT'), 30);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: 'recovery-fixture', choices: [{ finish_reason: 'stop', message: { content: `${pass} completed once` } }] }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  function run(source, destination) {
    return new Promise((resolve, reject) => {
      activeChild = spawn(process.execPath, [cli, 'research', '--session', source, '--dir', destination, '--api-key-env', 'RECOVERY_FIXTURE_KEY'], { cwd: directory, env: { ...process.env, RECOVERY_FIXTURE_KEY: secret }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; activeChild.stdout.on('data', b => { output += b; }); activeChild.stderr.on('data', b => { output += b; });
      const timer = setTimeout(() => { activeChild.kill('SIGKILL'); reject(Error('Recovery CLI timed out')); }, 15000);
      activeChild.once('error', error => { clearTimeout(timer); reject(error); });
      activeChild.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, output }); });
    });
  }
  try {
    const session = createSession({ question: 'Synthetic checkpoint recovery test', config: { provider: 'custom', model: 'recovery-fixture', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, reasoning: 'default', webSearch: false, challenge: false, timeoutMs: 10000, retries: 0 } });
    const source = path.join(directory, 'input.json'); await fs.writeFile(source, exportSession(session));
    const stopped = path.join(directory, 'stopped');
    const first = await run(source, stopped);
    assert.equal(first.code, 2, first.output);
    const checkpointFile = path.join(stopped, 'session.json');
    const checkpointText = await fs.readFile(checkpointFile, 'utf8');
    const checkpoint = importSession(JSON.parse(checkpointText));
    assert.match(first.output, /cancelled:/);
    assert.equal(checkpoint.status, 'partial');
    assert.deepEqual(checkpoint.steps.map(step => step.pass), ['research']);
    assert.ok(!checkpointText.includes('Unfinished text'));
    assert.ok(!checkpointText.includes(secret));
    const resumed = path.join(directory, 'resumed');
    const second = await run(checkpointFile, resumed);
    assert.equal(second.code, 0, second.output);
    const finalText = await fs.readFile(path.join(resumed, 'session.json'), 'utf8');
    const final = importSession(JSON.parse(finalText));
    assert.equal(final.status, 'complete');
    assert.deepEqual(final.steps.map(step => step.pass), ['research', 'synthesis']);
    assert.deepEqual(requests, ['research', 'synthesis', 'synthesis']);
    assert.equal(await fs.readFile(checkpointFile, 'utf8'), checkpointText);
    const refusal = await run(checkpointFile, resumed);
    assert.notEqual(refusal.code, 0);
    assert.equal(await fs.readFile(path.join(resumed, 'session.json'), 'utf8'), finalText);
    assert.equal(requests.length, 3);
    for (const destination of [stopped, resumed]) for (const file of ['session.json', 'SESSION.md']) assert.ok(!(await fs.readFile(path.join(destination, file), 'utf8')).includes(secret));
    return { passed: true, at: new Date().toISOString(), directory, cli, requests, checks: ['actual CLI SIGINT during streaming synthesis', 'atomic completed research checkpoint survives', 'incomplete stream is not a completed pass', 'new-directory continuation repeats only interrupted pass', 'source checkpoint unchanged', 'existing output refused before provider call', 'credential absent from JSON and Markdown'] };
  } finally {
    if (activeChild?.exitCode === null && !activeChild.killed) activeChild.kill('SIGTERM');
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await checkSessionRecovery();
  await fs.mkdir(path.join(root, '.dogfood'), { recursive: true });
  await fs.writeFile(path.join(root, '.dogfood/session-recovery-audit.json'), JSON.stringify(report, null, 2));
  console.log(`PASS: ${report.checks.length} interrupted CLI recovery checks.`);
}
