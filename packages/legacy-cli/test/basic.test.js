const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'grainulation.js');
const run = (args = '', { timeout = 10_000 } = {}) => execSync(`node ${BIN} ${args}`, { encoding: 'utf-8', timeout });

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.log(`    ${err.message}`);
  }
}

console.log('\n  grainulation tests\n');

// ── Ecosystem registry ──────────────────────────────────────────

test('ecosystem exports all 7 tools', () => {
  const { TOOLS } = require('../lib/ecosystem');
  assert.equal(TOOLS.length, 7);
});

test('ecosystem includes wheat as entry point', () => {
  const { getByName } = require('../lib/ecosystem');
  const wheat = getByName('wheat');
  assert.ok(wheat);
  assert.equal(wheat.entryPoint, true);
  assert.equal(wheat.package, '@grainulation/wheat');
});

test('ecosystem getInstallable excludes grainulation itself', () => {
  const { getInstallable } = require('../lib/ecosystem');
  const tools = getInstallable();
  assert.equal(tools.length, 6);
  assert.ok(!tools.find((t) => t.name === 'grainulation'));
});

test('ecosystem getCategories groups correctly', () => {
  const { getCategories } = require('../lib/ecosystem');
  const cats = getCategories();
  assert.ok(cats.core);
  assert.ok(cats.meta);
});

// ── CLI basics ──────────────────────────────────────────────────

test('no args shows ecosystem overview', () => {
  const out = run();
  assert.ok(out.includes('grainulation'));
  assert.ok(out.includes('wheat'));
  assert.ok(out.includes('Ecosystem'));
});

test('--version prints version', () => {
  const out = run('--version');
  assert.match(out.trim(), /^grainulation v\d+\.\d+\.\d+$/);
});

test('--help shows overview', () => {
  const out = run('--help');
  assert.ok(out.includes('grainulation'));
  assert.ok(out.includes('doctor'));
});

test('unknown command exits with error', () => {
  try {
    run('nonexistent-command-xyz');
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok(err.status !== 0);
  }
});

// ── Doctor ──────────────────────────────────────────────────────

test('doctor runs without error', () => {
  const out = run('doctor', { timeout: 30_000 });
  assert.ok(out.includes('doctor'));
  assert.ok(out.includes('Node'));
  assert.ok(out.includes('npm'));
});

test('doctor shows DX tooling section', () => {
  const out = run('doctor', { timeout: 30_000 });
  assert.ok(out.includes('DX tooling'));
  assert.ok(out.includes('Biome'));
  assert.ok(out.includes('Git hooks'));
});

// ── Ecosystem registry: extended ──────────────────────────────

test('ecosystem tool names are all unique', () => {
  const { TOOLS } = require('../lib/ecosystem');
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test('ecosystem tool packages are all unique', () => {
  const { TOOLS } = require('../lib/ecosystem');
  const packages = TOOLS.map((t) => t.package);
  assert.equal(new Set(packages).size, packages.length);
});

test('every tool has required fields', () => {
  const { TOOLS } = require('../lib/ecosystem');
  for (const tool of TOOLS) {
    assert.ok(tool.name, `tool missing name`);
    assert.ok(tool.package, `${tool.name} missing package`);
    assert.ok(tool.role, `${tool.name} missing role`);
    assert.ok(tool.description, `${tool.name} missing description`);
    assert.ok(tool.category, `${tool.name} missing category`);
    assert.equal(typeof tool.entryPoint, 'boolean', `${tool.name} entryPoint not boolean`);
  }
});

test('only wheat is an entry point', () => {
  const { TOOLS } = require('../lib/ecosystem');
  const entryPoints = TOOLS.filter((t) => t.entryPoint);
  assert.equal(entryPoints.length, 1);
  assert.equal(entryPoints[0].name, 'wheat');
});

test('getByName returns null for unknown tool', () => {
  const { getByName } = require('../lib/ecosystem');
  assert.equal(getByName('nonexistent'), undefined);
});

test('getByName finds each of the 7 tools', () => {
  const { getByName, TOOLS } = require('../lib/ecosystem');
  for (const tool of TOOLS) {
    const found = getByName(tool.name);
    assert.ok(found);
    assert.equal(found.package, tool.package);
  }
});

// ── Router: unit tests ───────────────────────────────────────

test('router overview contains all tool names', () => {
  const { overview } = require('../lib/router');
  const text = overview();
  const { TOOLS } = require('../lib/ecosystem');
  for (const tool of TOOLS) {
    assert.ok(text.includes(tool.name), `overview missing ${tool.name}`);
  }
});

test('router overview mentions start command', () => {
  const { overview } = require('../lib/router');
  const text = overview();
  assert.ok(text.includes('grainulation init'));
});

test('router overview mentions doctor command', () => {
  const { overview } = require('../lib/router');
  const text = overview();
  assert.ok(text.includes('doctor'));
});

test('router overview mentions process management commands', () => {
  const { overview } = require('../lib/router');
  const text = overview();
  assert.ok(text.includes('up'));
  assert.ok(text.includes('down'));
  assert.ok(text.includes('ps'));
});

// ── CLI: extended tests ──────────────────────────────────────

test('-v also prints version', () => {
  const out = run('-v');
  assert.match(out.trim(), /^grainulation v\d+\.\d+\.\d+$/);
});

test('help command shows overview', () => {
  const out = run('help');
  assert.ok(out.includes('grainulation'));
  assert.ok(out.includes('wheat'));
});

test('-h shows overview', () => {
  const out = run('-h');
  assert.ok(out.includes('grainulation'));
  assert.ok(out.includes('Ecosystem'));
});

test('doctor output includes Tools section', () => {
  const out = run('doctor', { timeout: 30_000 });
  assert.ok(out.includes('Tools'));
  assert.ok(out.includes('Checking ecosystem health'));
});

// ── Doctor: unit tests ───────────────────────────────────────

test('doctor getVersion returns null for fake package', () => {
  const { getVersion } = require('../lib/doctor');
  const v = getVersion('@grainulation/definitely-not-real-xyz');
  assert.equal(v, null);
});

test('doctor getPnpmVersion returns a version string or null', () => {
  const { getPnpmVersion } = require('../lib/doctor');
  const v = getPnpmVersion();
  // pnpm may or may not be installed, but the function should not throw
  assert.ok(v === null || typeof v === 'string');
});

test('doctor getHooksPath returns a string or null', () => {
  const { getHooksPath } = require('../lib/doctor');
  const hp = getHooksPath();
  assert.ok(hp === null || typeof hp === 'string');
});

// ── Setup: ROLES validation ──────────────────────────────────

test('setup ROLES all have name, description, tools', () => {
  const { ROLES } = require('../lib/setup');
  for (const role of ROLES) {
    assert.ok(role.name, 'role missing name');
    assert.ok(role.description, 'role missing description');
    assert.ok(Array.isArray(role.tools), 'role tools not array');
    assert.ok(role.tools.length > 0, 'role has no tools');
  }
});

test('setup ROLES all reference valid tool names', () => {
  const { ROLES } = require('../lib/setup');
  const { getByName } = require('../lib/ecosystem');
  for (const role of ROLES) {
    for (const toolName of role.tools) {
      assert.ok(getByName(toolName), `ROLE "${role.name}" references unknown tool "${toolName}"`);
    }
  }
});

test('setup Full Ecosystem role has 6 tools', () => {
  const { ROLES } = require('../lib/setup');
  const full = ROLES.find((r) => r.name === 'Full Ecosystem');
  assert.ok(full);
  assert.equal(full.tools.length, 6);
});

test('setup Researcher role only has wheat', () => {
  const { ROLES } = require('../lib/setup');
  const researcher = ROLES.find((r) => r.name === 'Researcher');
  assert.ok(researcher);
  assert.deepEqual(researcher.tools, ['wheat']);
});

// ── Init command ─────────────────────────────────────────────────

test('init shows context detection', () => {
  // init may delegate to wheat and exit non-zero if wheat fails,
  // so capture output regardless of exit code
  try {
    const out = run('init');
    assert.ok(out.includes('grainulation init'));
    assert.ok(out.includes('Detected context'));
  } catch (err) {
    // If it exited non-zero, still check stdout for context output
    const out = (err.stdout || '') + (err.stderr || '');
    assert.ok(out.includes('grainulation init'), 'init header missing');
    assert.ok(out.includes('Detected context'), 'context detection missing');
  }
});

// ── Status command ───────────────────────────────────────────────

test('status shows installed tools section', () => {
  const out = run('status');
  assert.ok(out.includes('grainulation status'));
  assert.ok(out.includes('Installed tools'));
});

test('status shows current directory', () => {
  const out = run('status');
  assert.ok(out.includes('Current directory'));
});

// ── Router: init and status in overview ──────────────────────────

test('router overview mentions init command', () => {
  const { overview } = require('../lib/router');
  const text = overview();
  assert.ok(text.includes('init'));
  assert.ok(text.includes('status'));
});

// ── Summary ─────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
  console.log(`  \x1b[31m${failed} failed\x1b[0m, ${passed} passed\n`);
  process.exit(1);
} else {
  console.log(`  \x1b[32m${passed} passed\x1b[0m\n`);
}
