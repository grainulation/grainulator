/** Compile in isolation; runtime JS is checked in so installed Grainulator needs only Node. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (!['--write', '--check'].includes(mode) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/typescript-build.mjs --write|--check');
}
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'grainulator-typescript-'));
try {
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    '--project', path.join(root, 'tsconfig.json'), '--outDir', output], { cwd: root, stdio: 'inherit' });
  const generated = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (entry.name.endsWith('.js')) generated.push(path.relative(output, file));
    }
  }
  collect(output);
  for (const relative of generated.sort()) {
    const source = path.join(root, 'typescript', relative.replace(/\.js$/, '.ts'));
    const banner = `// Generated from typescript/${relative.replace(/\.js$/, '.ts')}; edit that source and run npm run build:types.\n`;
    assert.ok(fs.statSync(source).isFile(), `Missing canonical source for ${relative}`);
    const expected = execFileSync(process.execPath,
      [path.join(root, 'node_modules/@biomejs/biome/bin/biome'), 'check', '--write', `--stdin-file-path=${relative}`],
      { cwd: root, input: banner + fs.readFileSync(path.join(output, relative), 'utf8'), encoding: 'utf8' });
    const target = path.join(root, relative);
    if (mode === '--write') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, expected);
    } else {
      assert.equal(fs.readFileSync(target, 'utf8'), expected,
        `${relative} is stale; edit its TypeScript source and run npm run build:types`);
    }
  }
  console.log(`${mode === '--write' ? 'Generated' : 'Verified'} ${generated.length} TypeScript runtime modules.`);
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
