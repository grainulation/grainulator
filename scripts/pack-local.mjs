import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command } from './lib/local-checks.mjs';
import { inspectBuild, portableMcpBytes } from '../lib/build-info.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, '.dogfood/builds'));
fs.mkdirSync(output, { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'grainulator-local-build-'));
const [inventory] = JSON.parse(command(['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root }));
const sourceHash = crypto.createHash('sha256');
const names = inventory.files.map(f => f.path).filter(name => name !== 'build-info.json').sort();
for (const name of names) {
  const source = fs.readFileSync(path.join(root, name));
  const bytes = name === '.mcp.json' ? portableMcpBytes(source) : source;
  sourceHash.update(name).update('\0').update(bytes).update('\0');
  const dest = path.join(stage, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, name), dest);
  if (name === '.mcp.json') fs.writeFileSync(dest, bytes);
}
const source_sha256 = sourceHash.digest('hex');
const id = `local-${source_sha256.slice(0, 16)}`;
const packageFile = path.join(stage, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const version = `${pkg.version.split('-')[0]}-local.${source_sha256.slice(0, 16)}`;
pkg.version = version;
fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
for (const name of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'plugin.json']) {
  const target = path.join(stage, name);
  if (!fs.existsSync(target)) continue;
  const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
}
const files = Object.fromEntries(names.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(stage, name))).digest('hex')]));
fs.writeFileSync(path.join(stage, 'build-info.json'), JSON.stringify({ schema: 1, id, version, source_sha256, files }, null, 2) + '\n');
const verified = inspectBuild(stage);
if (!verified.verified) throw Error(JSON.stringify(verified));
const [pack] = JSON.parse(command(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', output], { cwd: stage }));
const archive = path.join(output, pack.filename);
const report = { id, version, source_sha256, archive, archive_sha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), file_count: names.length, stage };
fs.writeFileSync(path.join(output, `${id}.json`), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
