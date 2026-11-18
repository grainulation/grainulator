#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { currentTarget, installRuntimeAsset, readRegular, sha256 } from '../lib/runtime-assets.js';
import { initializeRuntime, mutateRuntimeClaim, enrollRuntime, detachRuntimeEnrollment } from '../lib/runtime-enrollment.js';

const args = process.argv.slice(2);
const index = args.indexOf('--candidate-dir');
if (index < 0 || !args[index + 1]) throw new Error('Usage: node scripts/native-candidate-check.mjs --candidate-dir <directory>');
const directory = path.resolve(args[index + 1]);
const record = JSON.parse(readRegular(path.join(directory, 'asset-record.json')));
const metadata = JSON.parse(readRegular(path.join(directory, 'runtime-asset.json')));
assert.equal(record.target, currentTarget(), 'Candidate must execute on its actual native target');
assert.equal(metadata.target, record.target);
assert.equal(metadata.source_commit, record.source_commit);
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'grainulator-native-candidate-'));
try {
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  const workspace = path.join(root, 'workspace with spaces'); fs.mkdirSync(workspace);
  const manifest = { schema: 'grainulator.release.v1', version: metadata.version, source_commit: metadata.source_commit, assets: [record] };
  const manifestFile = path.join(root, 'release.json'); fs.writeFileSync(manifestFile, JSON.stringify(manifest) + '\n');
  const installed = installRuntimeAsset({ archive: path.join(directory, record.filename), manifest: manifestFile, trustedManifestSha256: sha256(readRegular(manifestFile)), home, version: metadata.version });
  const run = (command, argv = [], options = {}) => spawnSync(path.join(installed.asset_directory, `grainulator-runtime-${command}`), argv, { encoding: 'utf8', timeout: 30000, ...options });
  initializeRuntime(workspace, { run: { verification: { mode: 'strict' }, oracles: { unit: { cmd: [process.execPath, '-e', 'process.stdin.resume(); process.stdin.on("end",()=>process.exit(0));'] } } } });
  mutateRuntimeClaim(workspace, 'add', { id: 'c1', type: 'factual', topic: 'candidate', content: 'Offline local oracle protocol fixture.', evidence: 'tested', tags: ['load-bearing'], verified_by: { verifier: 'unit' } });
  const blocked = run('check', ['--dir', workspace, '--json', '--no-state']);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).status, 'blocked');
  const verified = run('verify', ['--dir', workspace, '--claim', 'c1', '--verifier', 'unit']);
  assert.equal(verified.status, 0, verified.stderr);
  const checked = run('check', ['--dir', workspace, '--json', '--no-state']);
  assert.equal(checked.status, 0, checked.stderr); assert.equal(JSON.parse(checked.stdout).status, 'ready');
  const driven = run('run', ['--dir', workspace, '--agent', process.execPath, '--max-rounds', '1', '--json']);
  assert.equal(driven.status, 0, driven.stderr); assert.equal(JSON.parse(driven.stdout).outcome, 'ready');
  const lessons = run('lessons', ['--dir', workspace]);
  assert.ok([0, 2].includes(lessons.status), lessons.stderr);
  assert.equal(JSON.parse(readRegular(path.join(workspace, '.grainulator/runtime/lessons.json'))).schema_version, 'grainulator.runtime.lessons.v1');
  const config = path.join(root, 'isolated host');
  const enrollment = enrollRuntime(workspace, { host: 'codex', configDirectory: config, expectedSettingsHash: 'absent', home });
  const hook = run('hook', ['--required'], { input: JSON.stringify({ cwd: workspace }), env: { PATH: '/nonexistent' } });
  assert.equal(hook.status, 0); assert.equal(hook.stdout, '', hook.stdout);
  // The native gate has no Brew/Node dependency, and a required unknown root blocks.
  const unknown = run('hook', ['--required'], { input: JSON.stringify({ cwd: root }), env: { PATH: '/nonexistent' } });
  assert.equal(unknown.status, 0); assert.equal(JSON.parse(unknown.stdout).decision, 'block');
  mutateRuntimeClaim(workspace, 'update', { content: 'Changed binding invalidates the recorded oracle verdict.' }, { id: 'c1' });
  const stale = run('hook', ['--required'], { input: JSON.stringify({ cwd: workspace }), env: { PATH: '/nonexistent' } });
  assert.equal(stale.status, 0); assert.equal(JSON.parse(stale.stdout).decision, 'block');
  const receiptFile = path.join(workspace, '.grainulator/runtime/enrollment.json');
  const detached = detachRuntimeEnrollment(workspace, { expectedEnrollmentHash: sha256(readRegular(receiptFile)), expectedSettingsHash: enrollment.settings_after_sha256 });
  assert.equal(detached.user_data_preserved, true);
  assert.ok(fs.existsSync(path.join(installed.asset_directory, 'grainulator-runtime-hook')));
  const result = { schema: 'grainulator.native-candidate-acceptance.v1', verdict: 'PASS', version: metadata.version, source_commit: metadata.source_commit, target: record.target, archive_sha256: record.sha256, metadata_sha256: record.metadata_sha256, execution: ['check-blocked', 'verify-local-fixture', 'check-ready', 'driver-terminal-trace', 'lessons', 'self-contained-hook-allow', 'required-unknown-root-block', 'stale-binding-block', 'explicit-owned-detach'], published: false, public_channel_install: false, real_host_discovery: false, providers_called: false };
  fs.writeFileSync(path.join(directory, 'candidate-acceptance.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
} finally { fs.rmSync(root, { recursive: true }); }
