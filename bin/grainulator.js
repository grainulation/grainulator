#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runTask } from '../lib/runner.js';
import { researchCLI } from '../lib/research-cli.js';
import { inspectBuild } from '../lib/build-info.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const [requestedCommand = 'help', ...requestedArgs] = process.argv.slice(2);
const evidencePrefix = requestedCommand === 'evidence';
const [command = 'help', ...args] = evidencePrefix ? requestedArgs : [requestedCommand, ...requestedArgs];
const evidenceCommands = new Set(['init', 'add', 'import', 'resolve', 'compile', 'search', 'status', 'guard', 'mcp', 'help', '--help', '-h']);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const children = {
  evidence: 'packages/evidence/bin/wheat.js', wheat: 'packages/evidence/bin/wheat.js',
  check: 'packages/runtime/bin/bean-check.js', memory: 'packages/memory/bin/silo.js',
  export: 'packages/exports/bin/mill.js', analytics: 'packages/analytics/bin/harvest.js',
  orchestrate: 'packages/orchestration/bin/orchard.js',
  legacy: 'packages/legacy-cli/bin/grainulation.js',
};
const commandHelp = {
  demo: 'grainulator demo [--dir <output-directory>] [--json]\nRun a synthetic offline repair and verifier example. Does not measure model quality.',
  run: 'grainulator run --task <text> --adapter <executable> [--adapter-args <JSON-array>] [--verify <JSON-argv>] [--dir <workspace>] [--max-rounds 3] [--timeout-ms 60000] [--adapter-format json|text] [--json]',
  preview: 'grainulator preview\nStart the local playground preview on http://127.0.0.1:4517.',
  connect: 'grainulator connect [--dir <workspace>]\nPrint direct MCP configuration without changing host settings. For native Codex workspace setup, use grainulator setup --dir /absolute/project.',
  doctor: 'grainulator doctor [--json]\nCheck the Node runtime, packaged components, and build integrity.',
};
function forward(entry, argv) {
  const child = spawn(process.execPath, [path.join(root, entry), ...argv], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
try {
  if (['--version', '-v', 'version'].includes(command)) console.log(args.includes('--json') ? JSON.stringify({version, build: inspectBuild(root)}) : version);
  else if (commandHelp[command] && (args.includes('--help') || args.includes('-h'))) console.log(commandHelp[command]);
  else if (evidencePrefix && !evidenceCommands.has(command)) { console.error(`Unknown evidence command: ${command}. Run grainulator evidence --help.`); process.exitCode = 1; }
  else if (command === 'setup') {
    if (args.includes('--help') || args.includes('-h')) console.log('grainulator setup --dir <absolute-project> [--json]\nSave the default native Codex workspace in ~/.config/grainulator/workspace.json. Restart Codex after changing it. GRAINULATOR_WORKSPACE overrides the saved default. Changes no host settings.');
    else {
      const {saveWorkspace} = await import('../lib/workspace-config.js');
      const result = saveWorkspace(option('--dir'));
      console.log(args.includes('--json') ? JSON.stringify(result) : `Workspace: ${result.workspace}\nSaved: ${result.config}\nRestart Codex to load this default workspace. GRAINULATOR_WORKSPACE overrides it when set.\nHost settings were not changed.`);
    }
  }
  else if (command === 'init') {
    if (args.includes('--help') || args.includes('-h')) console.log('grainulator init --question <text> [--dir <path>] [--audience <text>] [--constraints <semicolon-separated text>] [--done <text>] [--force] [--json]\nCreates only the sprint ledger and compilation. Leaves host settings and Git hooks unchanged.');
    else {
      const result = (await import('../lib/sprint-init.js')).initializeSprint(path.resolve(option('--dir', process.cwd())), {question: option('--question'), audience: option('--audience'), constraints: option('--constraints'), done: option('--done'), force: args.includes('--force')});
      console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : result.status === 'error' ? result.message : `Sprint initialized: ${result.directory}\n${result.output}`);
      if (result.status === 'error') process.exitCode = 1;
    }
  }
  else if (command === 'research') await researchCLI(args);
  else if (command === 'mcp') {
    if (args.includes('--help') || args.includes('-h')) console.log('grainulator mcp [--dir <workspace>] [--memory-dir <path>]\nOne local MCP server for evidence, memory, and exports. See docs/TOOLS.md.');
    else (await import('../lib/grainulator-mcp.js')).startServer({dir: path.resolve(option('--dir', process.cwd())), memoryDir: option('--memory-dir')});
  }
  else if (children[command]) forward(children[command], args);
  else if (['init', 'add', 'import', 'resolve', 'compile', 'search', 'status', 'guard'].includes(command)) {
    forward(children.evidence, [command, ...(command === 'init' && !args.includes('--headless') ? ['--headless'] : []), ...args]);
  } else if (command === 'preview') forward('scripts/preview.mjs', args);
  else if (command === 'doctor') {
    const build = inspectBuild(root);
    const required = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).engines.node;
    const minimumMajor = Number(required.match(/^>=(\d+)$/)?.[1]);
    const runtimeAvailable = Number.isFinite(minimumMajor) && Number(process.versions.node.split('.')[0]) >= minimumMajor;
    const checks = [{ component: 'node', available: runtimeAvailable, required, actual: process.version }, ...Object.entries(children).filter(([component]) => component !== 'wheat').map(([component, entry]) => ({ component, available: fs.existsSync(path.join(root, entry)) }))];
    const result = { mode: 'local', node: process.version, build, checks, adapters: ['command-json-v1', 'command-text'], enforcement: 'Managed command runner; host integration depends on adapter capabilities.' };
    console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : `Grainulator ${version} · ${build.id || build.status || 'invalid build'}\n${checks.map(c => `${c.available ? '✓' : '✗'} ${c.component}${c.required ? ` ${c.actual} (requires ${c.required})` : ''}`).join('\n')}\n${build.verified === null ? 'No integrity manifest in this checkout. Version is available above; release installs include a verifiable manifest.' : `${build.verified ? '✓' : '✗'} Packaged files match build manifest`}\n\nUse grainulator demo for an offline, verified repair example.`);
    process.exitCode = checks.every(c => c.available) && build.verified !== false ? 0 : 1;
  } else if (command === 'connect') {
    console.log(JSON.stringify({ mcpServers: { grainulator: { command: process.execPath, args: [path.join(root, 'bin/grainulator.js'), 'mcp', '--dir', path.resolve(option('--dir', process.cwd()))] } } }, null, 2));
  } else if ((command === 'run' || command === 'demo') && !args.includes('--help')) {
    const demo = command === 'demo';
    const cwd = path.resolve(option('--dir', demo ? path.join(root, '.dogfood/demo') : process.cwd()));
    if (demo) fs.mkdirSync(cwd, { recursive: true });
    const adapter = demo ? [process.execPath, path.join(root, 'evals/fixtures/repair-adapter.mjs')] : [option('--adapter'), ...JSON.parse(option('--adapter-args', '[]'))];
    const verifier = demo ? [process.execPath, path.join(root, 'evals/fixtures/answer-verifier.mjs')] : option('--verify') ? JSON.parse(option('--verify')) : null;
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
    if (demo && !args.includes('--json')) console.log('Offline protocol fixture. Exercises repair and verification; does not measure model quality.\n');
    const result = await runTask({ task: option('--task', demo ? 'Calculate 6 × 7. Return the number.' : ''), adapter, verifier, cwd, adapterFormat: option('--adapter-format', 'json'), maxRounds: Number(option('--max-rounds', 3)), timeoutMs: Number(option('--timeout-ms', 60000)), signal: controller.signal, onRound: r => { if (!args.includes('--json')) console.log(`Round ${r.round}: ${r.verification?.passed ? 'verification passed' : r.verification ? 'needs correction' : 'unverified'}`); } });
    console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : `\n${result.status}\n${result.rounds.at(-1)?.answer || result.error || ''}\nTrace: ${result.trace}`);
    process.exitCode = result.status === 'verified' ? 0 : 2;
  } else if (['help', '--help', '-h'].includes(command) || (command === 'run' && args.includes('--help'))) {
    console.log(`Grainulator\n\nUsage: node bin/grainulator.js <command> [options]\n\n  research         Run or resume an exported playground session (--help)\n  doctor           Check the local workspace\n  demo             Run the offline repair + verifier example\n  run              Attach a JSON command adapter to a bounded task loop\n  init / add / import / compile / status / search / resolve\n                   Work with an evidence sprint (--dir <directory>)\n  check            Evaluate a legacy execution ledger\n  memory / export / analytics / orchestrate\n                   Access the consolidated components\n  setup            Save the default native Codex workspace (--dir absolute-path)\n  --version / -v   Print the installed product version\n  connect          Print a local MCP configuration; changes no host settings\n  preview          Preview Grainulator and the sibling Grainulation site\n\nrun options:\n  --task <text> --adapter <executable> --adapter-args '<JSON array>'\n  --verify '<JSON argv>' --dir <workspace> --max-rounds 3 --timeout-ms 60000\n  --adapter-format json|text  Use text for ordinary prompt-in / answer-out CLIs\n  --json           Machine-readable output\n\nAdapter protocol and dogfood guide: docs/DOGFOOD.md\nNo release or installation into your global agent configuration is performed.`);
  } else { console.error(`Unknown command: ${command}. Run grainulator --help.`); process.exitCode = 1; }
} catch (error) { console.error(`Grainulator: ${error.message}`); process.exitCode = 1; }
