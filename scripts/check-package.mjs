import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectBuild } from '../lib/build-info.js';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Package measurement failed');
const [pack] = JSON.parse(result.stdout);
if (!Number.isFinite(pack.size) || pack.size <= 0) throw new Error('Invalid package size');
if (pack.size > 5 * 1024 * 1024) throw new Error(`Package exceeds 5 MiB: ${pack.size}`);
console.log(`Package measured: ${pack.size} bytes, ${pack.files.length} files (dry run; no release).`);

const build = inspectBuild(fileURLToPath(new URL('../', import.meta.url)));
if (build.verified !== true) throw new Error(`Release integrity manifest is missing or stale; run npm run build:identity after final shipped edits: ${JSON.stringify(build)}`);
console.log(`Release identity verified: ${build.id}`);

const manifest = JSON.parse(fs.readFileSync(new URL('../build-info.json', import.meta.url)));
assert.deepEqual(Object.keys(manifest.files).sort(), pack.files.map(file => file.path).filter(name => name !== 'build-info.json').sort(), 'Release manifest inventory differs from package; run npm run build:identity');
