/**
 * Smoke tests for the grainulator plugin.
 *
 * Validates that plugin.json parses correctly, skill files have valid
 * YAML frontmatter, hooks.json is valid, and .mcp.json is well-formed.
 *
 * Uses node:test + node:assert -- zero dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── plugin.json ──────────────────────────────────────────────────────────────

describe('plugin.json', () => {
  let plugin;

  it('parses as valid JSON', () => {
    const raw = fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8');
    plugin = JSON.parse(raw);
  });

  it('has required fields', () => {
    assert.ok(plugin.name, 'missing name');
    assert.ok(plugin.version, 'missing version');
    assert.ok(plugin.description, 'missing description');
    assert.ok(plugin.skills, 'missing skills');
    assert.ok(plugin.agents, 'missing agents');
    assert.ok(plugin.hooks, 'missing hooks');
    assert.ok(plugin.mcpConfig, 'missing mcpConfig');
  });

  it('referenced paths exist', () => {
    assert.ok(fs.existsSync(path.join(ROOT, plugin.skills)), `skills dir missing: ${plugin.skills}`);
    assert.ok(fs.existsSync(path.join(ROOT, plugin.agents)), `agents dir missing: ${plugin.agents}`);
    assert.ok(fs.existsSync(path.join(ROOT, plugin.hooks)), `hooks file missing: ${plugin.hooks}`);
    assert.ok(fs.existsSync(path.join(ROOT, plugin.mcpConfig)), `mcp config missing: ${plugin.mcpConfig}`);
  });
});

// ── Skill files ──────────────────────────────────────────────────────────────

describe('skill files', () => {
  const skillsDir = path.join(ROOT, 'skills');
  // Skills use subdirectory format: skills/<name>/SKILL.md
  const skillDirs = fs.readdirSync(skillsDir).filter(f =>
    fs.statSync(path.join(skillsDir, f)).isDirectory()
  );

  it('has at least one skill directory', () => {
    assert.ok(skillDirs.length > 0, 'no skill subdirectories found');
  });

  for (const dir of skillDirs) {
    const skillFile = path.join(skillsDir, dir, 'SKILL.md');

    it(`${dir}/SKILL.md exists and has YAML frontmatter with name and description`, () => {
      assert.ok(fs.existsSync(skillFile), `${dir}/SKILL.md does not exist`);
      const content = fs.readFileSync(skillFile, 'utf8');
      assert.ok(content.startsWith('---'), `${dir}/SKILL.md missing frontmatter delimiter`);
      const endIdx = content.indexOf('---', 3);
      assert.ok(endIdx > 3, `${dir}/SKILL.md missing closing frontmatter delimiter`);
      const frontmatter = content.slice(3, endIdx);
      assert.ok(/^name:\s*.+$/m.test(frontmatter), `${dir}/SKILL.md missing "name" in frontmatter`);
      assert.ok(/^description:\s*.+$/m.test(frontmatter), `${dir}/SKILL.md missing "description" in frontmatter`);
    });
  }
});

// ── hooks.json ───────────────────────────────────────────────────────────────

describe('hooks.json', () => {
  let hooks;

  it('parses as valid JSON', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8');
    hooks = JSON.parse(raw);
  });

  it('has hooks array', () => {
    assert.ok(Array.isArray(hooks.hooks), 'hooks.hooks is not an array');
    assert.ok(hooks.hooks.length > 0, 'hooks array is empty');
  });

  it('each hook has type, matcher, and script', () => {
    for (const hook of hooks.hooks) {
      assert.ok(hook.type, 'hook missing type');
      assert.ok(hook.matcher, 'hook missing matcher');
      assert.ok(hook.script, 'hook missing script');
    }
  });
});

// ── .mcp.json ────────────────────────────────────────────────────────────────

describe('.mcp.json', () => {
  let mcp;

  it('parses as valid JSON', () => {
    const raw = fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8');
    mcp = JSON.parse(raw);
  });

  it('has mcpServers object', () => {
    assert.ok(mcp.mcpServers, 'missing mcpServers');
    assert.ok(typeof mcp.mcpServers === 'object', 'mcpServers is not an object');
  });

  it('does not use ${CWD} in env values', () => {
    const raw = fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8');
    assert.ok(!raw.includes('${CWD}'), '.mcp.json contains unsupported ${CWD} variable');
  });
});
