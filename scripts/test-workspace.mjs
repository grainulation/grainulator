import { execute } from '../lib/runner.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const targets = ['.', ...fs.readdirSync(path.join(root, 'packages')).filter(name => fs.existsSync(path.join(root, 'packages', name, 'package.json'))).map(name => `packages/${name}`)];
const results = [];
const audit = process.env.GRAINULATOR_TEST_REPORT_DIR || '.dogfood';
fs.mkdirSync(path.join(root, audit, 'test-logs'), { recursive: true });
for (const target of targets) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, target, 'package.json')));
  const script = target === '.' ? 'test:plugin' : 'test';
  if (!pkg.scripts?.[script]) continue;
  const result = await execute(['npm', 'run', script], '', { cwd: path.join(root, target), timeoutMs: 240000, maxBytes: 16 * 1024 * 1024 });
  const log = `${audit}/test-logs/${target === '.' ? 'plugin' : path.basename(target)}.log`;
  fs.writeFileSync(path.join(root, log), (result.stdout || '') + (result.stderr || '') + (result.failure || ''));
  results.push({ package: pkg.name, passed: result.code === 0 && !result.failure, exitCode: result.code, log });
  console.log(`${result.code === 0 && !result.failure ? 'PASS' : 'FAIL'} ${pkg.name} — ${log}`);
}
const core = await execute([process.execPath, '--test', ...fs.readdirSync(path.join(root, 'test/dogfood')).filter(f => f.endsWith('.test.mjs')).map(f => `test/dogfood/${f}`)], '', { cwd: root, timeoutMs: 120000, maxBytes: 16 * 1024 * 1024 });
fs.writeFileSync(path.join(root, audit, 'test-logs/core.log'), (core.stdout || '') + (core.stderr || ''));
results.push({ package: 'dogfood integration', passed: core.code === 0 && !core.failure, log: `${audit}/test-logs/core.log` });
console.log(`${core.code === 0 && !core.failure ? 'PASS' : 'FAIL'} dogfood integration`);
fs.writeFileSync(path.join(root, audit, 'test-results.json'), JSON.stringify({ at: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, results }, null, 2));
process.exitCode = results.every(r => r.passed) ? 0 : 1;
