#!/usr/bin/env node
// Native installation/host behavior is executed by native-candidate-check.mjs.
// This portable entry-point check deliberately needs no Rust toolchain or host.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const env={...process.env,GRAINULATOR_RUNTIME_ASSET_DIR:path.join(root,'does-not-exist-native-asset')};
const help=spawnSync(process.execPath,[path.join(root,'bin/grainulator.js'),'runtime','--help'],{env,encoding:'utf8'});
assert.equal(help.status,0,help.stderr);
assert.match(help.stdout,/enroll/);
assert.match(help.stdout,/manifest-sha256/);
const missing=spawnSync(process.execPath,[path.join(root,'bin/grainulator.js'),'runtime','check','--json'],{env,encoding:'utf8'});
assert.equal(missing.status,3,missing.stderr);
const error=JSON.parse(missing.stdout);
assert.equal(error.status,'error');
assert.equal(error.error.code,'E_RUNTIME_NOT_INSTALLED');
assert.equal(fs.existsSync(env.GRAINULATOR_RUNTIME_ASSET_DIR),false);
console.log('PASS: native help is portable and missing assets fail without fallback');
