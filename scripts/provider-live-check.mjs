import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleResearch } from '../lib/research-http.js';
import { createSession, exportSession, importSession, runResearch } from '../site/research/session.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = `Usage: node scripts/provider-live-check.mjs [openai|openrouter]

Makes two real model calls: local HTTP research, then exported-session CLI continuation.
Configure OPENAI_API_KEY for openai or OPENROUTER_API_KEY for openrouter in your environment.
Optional: GRAINULATOR_LIVE_MODEL selects an exact model ID.
Web search and retries are off; provider billing applies.
Exit codes: 0 passed, 1 failed, 2 missing credentials (no calls).
Reports: .dogfood/provider-live-<provider>.json
`;
if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(usage); process.exit(0); }
const provider = process.argv[2] || 'openai';
const variable = { openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY' }[provider];
if (!variable) { console.error('Choose openai or openrouter.\n' + usage); process.exit(1); }
const report = { at: new Date().toISOString(), provider, passed: false };
await fs.mkdir(path.join(root, '.dogfood'), { recursive: true });
const reportFile = path.join(root, `.dogfood/provider-live-${provider}.json`);
if (!process.env[variable]) {
  report.status = 'blocked'; report.reason = `Missing ${variable}; no live requests made.`;
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  console.error(`BLOCKED: ${report.reason}`); process.exitCode = 2;
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'grainulator-live-provider-'));
  const model = process.env.GRAINULATOR_LIVE_MODEL || (provider === 'openai' ? 'gpt-6-astra' : 'anthropic/claude-fable-5.1');
  const server = http.createServer(async (req, res) => { if (!await handleResearch(req, res, server.address().port)) { res.writeHead(404); res.end(); } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const controller = new AbortController(); let requests = 0;
    const session = createSession({ question: 'What is 17 multiplied by 23? Give the result and a one-sentence arithmetic check.', instructions: 'This is a synthetic transport acceptance check. Be concise and do not browse.', config: { provider, model, webSearch: false, challenge: false, reasoning: 'low', maxOutputTokens: 4096, retries: 0, timeoutMs: 120000 } });
    const stopped = await runResearch(session, { signal: controller.signal, onEvent: event => { if (event.type === 'checkpoint') controller.abort(); }, complete: async ({ config, system, user, signal }) => {
      requests++;
      const response = await fetch(`${origin}/api/research/pass`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ config, system, user }), signal });
      assert.equal(response.status, 200);
      const events = (await response.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      if (events.some(event => event.type === 'error')) throw Error(events.find(event => event.type === 'error').error);
      const result = events.find(event => event.type === 'result')?.result;
      assert.ok(result?.text?.trim(), 'Live research pass returned no completed output');
      return result;
    } });
    assert.equal(stopped.status, 'cancelled'); assert.equal(stopped.steps.length, 1); assert.equal(requests, 1);
    const checkpoint = exportSession(stopped); assert.ok(!checkpoint.includes(process.env[variable]));
    const source = path.join(directory, 'session.json'); await fs.writeFile(source, checkpoint, { mode: 0o600 });
    const destination = path.join(directory, 'resumed');
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'bin/grainulator.js'), 'research', '--session', source, '--dir', destination], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(Error('Live CLI continuation timed out')); }, 150000);
      child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('exit', code => { clearTimeout(timer); resolve({ code, output }); });
    });
    assert.equal(result.code, 0, result.output);
    const finalText = await fs.readFile(path.join(destination, 'session.json'), 'utf8');
    assert.ok(!finalText.includes(process.env[variable]));
    const final = importSession(JSON.parse(finalText));
    assert.equal(final.status, 'complete'); assert.deepEqual(final.steps[0], stopped.steps[0]); assert.equal(final.steps.length, 2);
    assert.equal(await fs.readFile(source, 'utf8'), checkpoint);
    Object.assign(report, { passed: true, status: 'passed', directory, model, checks: ['real local research HTTP endpoint forwards an authenticated provider request', 'completed response survives export with no credential', 'actual CLI resumes remaining synthesis pass', 'prior pass and source checkpoint unchanged'], passes: final.steps.map(step => ({ pass: step.pass, model: step.model, elapsedMs: step.elapsedMs, usage: step.usage })) });
    console.log(`PASS: ${provider} HTTP research + export + CLI continuation.`);
  } catch (error) {
    // Scrub any provider error before persisting it; never print credential material.
    report.status = 'failed'; report.reason = String(error.message).replaceAll(process.env[variable], '[redacted]');
    console.error(`FAIL: ${report.reason}`); process.exitCode = 1;
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 }); }
}
