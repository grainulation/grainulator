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
  // A deleted/renamed canonical source stops emitting, but its old runtime file
  // would otherwise remain packaged and silently escape the freshness check.
  // All current canonical runtime sources live below lib; also inspect any new
  // emitted top-level trees so extending that layout retains the same check.
  const emitted = new Set(generated);
  function rejectOrphans(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'target', '.git'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) rejectOrphans(file);
      else if (entry.isFile() && entry.name.endsWith('.js') &&
        fs.readFileSync(file, 'utf8').startsWith('// Generated from typescript/')) {
        const relative = path.relative(root, file);
        assert.ok(emitted.has(relative),
          `Orphaned generated runtime module ${relative}; restore its canonical TypeScript source or remove the retired runtime file`);
      }
    }
  }
  for (const directory of new Set(['lib', ...generated.map(file => file.split(path.sep)[0])])) {
    rejectOrphans(path.join(root, directory));
  }
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
