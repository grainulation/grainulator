const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
const { getInstallable } = require('./ecosystem');
const { getVersion } = require('./doctor');

/**
 * Interactive setup wizard.
 *
 * Asks what you're trying to do, then recommends and installs
 * the right subset of the ecosystem.
 */

const ROLES = [
  {
    name: 'Researcher',
    description: 'Run research sprints, grow evidence, write briefs',
    tools: ['wheat'],
  },
  {
    name: 'Team Lead',
    description: 'Coordinate multiple sprints, review analytics',
    tools: ['wheat', 'orchard', 'harvest'],
  },
  {
    name: 'Full Ecosystem',
    description: 'Everything. All 7 tools.',
    tools: ['wheat', 'barn', 'mill', 'silo', 'harvest', 'orchard'],
  },
];

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log('  \x1b[1;33mgrainulation setup\x1b[0m');
  console.log('  What are you trying to do?');
  console.log('');

  for (let i = 0; i < ROLES.length; i++) {
    const role = ROLES[i];
    console.log(`    \x1b[1m${i + 1}.\x1b[0m ${role.name}`);
    console.log(`       \x1b[2m${role.description}\x1b[0m`);
    console.log(`       Tools: ${role.tools.join(', ')}`);
    console.log('');
  }

  const answer = await ask(rl, '  Choose (1-4): ');
  const choice = parseInt(answer, 10);

  if (choice < 1 || choice > ROLES.length || Number.isNaN(choice)) {
    console.log('\n  \x1b[31mInvalid choice.\x1b[0m\n');
    rl.close();
    return;
  }

  const role = ROLES[choice - 1];
  const toInstall = [];

  console.log('');
  console.log(`  \x1b[1mSetting up: ${role.name}\x1b[0m`);
  console.log('');

  for (const toolName of role.tools) {
    const tool = getInstallable().find((t) => t.name === toolName);
    if (!tool) continue;

    const version = getVersion(tool.package);
    if (version) {
      console.log(`    \x1b[32m\u2713\x1b[0m ${tool.name} already installed (${version})`);
    } else {
      toInstall.push(tool);
      console.log(`    \x1b[33m+\x1b[0m ${tool.name} will be installed`);
    }
  }

  if (toInstall.length === 0) {
    console.log('');
    console.log('  \x1b[32mEverything is already installed.\x1b[0m');
    console.log('  Run \x1b[1mnpx @grainulation/wheat init\x1b[0m to start a research sprint.');
    rl.close();
    return;
  }

  console.log('');
  const confirm = await ask(rl, `  Install ${toInstall.length} package(s)? (y/N): `);

  if (confirm.toLowerCase() !== 'y') {
    console.log('\n  \x1b[2mAborted.\x1b[0m\n');
    rl.close();
    return;
  }

  console.log('');
  for (const tool of toInstall) {
    console.log(`  Installing ${tool.package}...`);
    try {
      execFileSync('npm', ['install', '-g', tool.package], { stdio: 'pipe' });
      console.log(`    \x1b[32m\u2713\x1b[0m ${tool.name} installed`);
    } catch (err) {
      console.log(`    \x1b[31m\u2717\x1b[0m ${tool.name} failed: ${err.message}`);
    }
  }

  console.log('');
  console.log('  \x1b[32mSetup complete.\x1b[0m');
  console.log('  Start with: npx @grainulation/wheat init');
  console.log('');
  rl.close();
}

module.exports = { run, ROLES };
