import { spawnSync } from 'node:child_process';
const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || 'Package measurement failed');
const [pack] = JSON.parse(result.stdout);
if (!Number.isFinite(pack.size) || pack.size <= 0) throw new Error('Invalid package size');
if (pack.size > 5 * 1024 * 1024) throw new Error(`Package exceeds 5 MiB: ${pack.size}`);
console.log(`Package measured: ${pack.size} bytes, ${pack.files.length} files (dry run; no release).`);
