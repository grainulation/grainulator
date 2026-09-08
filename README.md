<p align="center">
  <a href="https://grainulator.app"><img src="site/glitchy.png" alt="Glitchy — the Grainulator mascot" width="200"></a>
</p>

<h1 align="center">Grainulator</h1>

<p align="center"><strong>Evidence and verification for the model you already use.</strong></p>

<p align="center">
  Keep the evidence. Challenge the answer. Know what to do next.<br>
  A shared workflow for research, engineering, and model-assisted work.
</p>

<p align="center">
  <a href="https://grainulator.app/playground/"><img src="https://img.shields.io/badge/explore_the_playground-grainulator.app-98f3ef?style=for-the-badge" alt="Explore the Grainulator playground"></a>
</p>

<p align="center">
  <a href="https://github.com/grainulation/grainulator/releases"><img src="https://img.shields.io/github/v/release/grainulation/grainulator?label=release" alt="Latest GitHub release"></a>
  <a href="https://github.com/grainulation/grainulator/actions/workflows/ci.yml"><img src="https://github.com/grainulation/grainulator/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI on main"></a>
  <a href="docs/INSTALLATION.md"><img src="https://img.shields.io/badge/node-%E2%89%A524-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24 or later"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
  <a href="https://deepwiki.com/grainulation/grainulator"><img src="https://deepwiki.com/badge.svg" alt="Docs on DeepWiki"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/INSTALLATION.md">Installation</a> ·
  <a href="docs/UPGRADING.md">Upgrading</a> ·
  <a href="docs/TOOLS.md">Tools</a> ·
  <a href="docs/PLUGIN-TESTING.md">Agent setup</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

## What it adds

Good models still need a way to keep track of evidence, revisit assumptions, and verify their work. Grainulator gives them that process, with a local ledger that stays with the task as it moves between models and sessions.

| Capability | What it gives you |
| --- | --- |
| **Evidence that stays with the work** | Typed claims, sources, evidence tiers, and provenance that survive edits and exports. |
| **A check on the answer** | Conflict detection, weak-support signals, and explicit gaps to investigate. |
| **Clear next actions** | Two lists: what the agent can continue automatically, and what needs your input. |
| **Sessions you can carry forward** | Configurable research, stop/resume, reusable context, and credential-free exports. |
| **Verification for your task** | A managed command loop that can use a verifier you provide. |

**One package, one MCP server.** Use the CLI, connect an MCP-compatible agent, or load the bundled Claude Code or Codex plugin. The consolidated components are included; separate ecosystem installations are not required.

## Quick start

Requires **Node.js 24+**. Node 25 is the development default.

**Upgrading from 1.x?** Follow the [migration checklist](docs/UPGRADING.md) to update the correct plugin scope, reconnect the single MCP server, and review retired Farmer instructions without changing your research data.

```sh
git clone --branch v2.0.1 https://github.com/grainulation/grainulator.git
cd grainulator
npm ci --ignore-scripts
node bin/grainulator.js doctor
node bin/grainulator.js preview
```

Open **[localhost:4517/playground/](http://127.0.0.1:4517/playground/)** to choose your model, configure the workflow, and run research with your provider key.

Want to look around first? The **[public playground](https://grainulator.app/playground/)** lets you explore the controls and export a setup. Model execution happens in your local installation.

> **Distribution:** v2.0.1 is a [GitHub release](https://github.com/grainulation/grainulator/releases/tag/v2.0.1), not an npm registry release. For a separate local installation, follow the [archive installation guide](docs/INSTALLATION.md).

### Connect your agent

From the project you want Grainulator to access:

```sh
node /path/to/grainulator/bin/grainulator.js connect --dir "$PWD"
```

Register the printed MCP configuration in your host, then restart its connection. The command prints configuration; it does not change your host settings.

For bundled skills, agents, and hooks, use the **[native plugin setup guide](docs/PLUGIN-TESTING.md)**. Native Codex needs an explicit workspace: run `node /path/to/grainulator/bin/grainulator.js setup --dir /absolute/project` once, then restart Codex. A per-launch `GRAINULATOR_WORKSPACE` overrides that saved default. CLI and direct MCP access remain available to other hosts.

## Put it to work

With Grainulator connected, give your agent the outcome you need:

> Use Grainulator to investigate whether we should migrate this service. Record the evidence, challenge the assumptions, implement the agreed changes, and verify them. Keep the remaining next steps split into Auto and Manual.

The work follows a simple cycle:

1. **Record** findings with their sources and evidence tiers.
2. **Check** for conflicts, weak support, and missing perspectives.
3. **Act** on the gaps that matter, then verify the requested result.
4. **Continue** from the saved ledger or export the session to another workflow.

There are no fixed claim-count or research-pass quotas. **Auto** lists work the agent can continue within your authorization. **Manual** lists decisions, access, or actions that need you. When you ask only for next steps, those two lists are the entire response.

<details>
<summary><strong>Example: record a claim from the terminal</strong></summary>

```sh
node bin/grainulator.js init --dir ./sprints/migration \
  --question 'Should we migrate this service?' \
  --audience engineers --constraints 'Preserve existing user data' \
  --done 'A verified plan with remaining risks documented'

node bin/grainulator.js add --dir ./sprints/migration \
  --id r001 --type constraint --topic migration \
  --content 'Existing user data must remain readable.' --evidence stated

node bin/grainulator.js compile --dir ./sprints/migration
```

The equivalent MCP tool is **`add_claim`** on the **`grainulator`** server. See the [tool reference](docs/TOOLS.md) for evidence, memory, export, analytics, and orchestration operations.

</details>

## Explore the docs

| Guide | Start here for… |
| --- | --- |
| [Installation](docs/INSTALLATION.md) | Tagged source, isolated archives, and verified build identity. |
| [Upgrading from 1.x](docs/UPGRADING.md) | Host updates, renamed tools, existing data, and retired setup instructions. |
| [Agent setup](docs/PLUGIN-TESTING.md) | Claude Code, Codex, and actual plugin acceptance checks. |
| [Research sessions](docs/RESEARCH.md) | Models, feature controls, credentials, export, and resume. |
| [Tools](docs/TOOLS.md) | The canonical CLI and MCP interface. |
| [Execution adapters](docs/ADAPTERS.md) | Attaching a model command and a task-specific verifier. |
| [Architecture](docs/STRUCTURE.md) | The workspace layout and internal modules. |
| [Evaluation](docs/EVALUATION.md) | What has been measured and what remains unproven. |
| [Contributing](CONTRIBUTING.md) | Development setup, tests, and changes to the project. |

## Verification and limits

CI checks Node 24 and 25, isolated package installation, plugin contracts, Rust runtime conformance, lint, and the static playground in a browser. Native host and live-provider acceptance have separate [verification guides](docs/READINESS.md).

The compiler checks the structure and support recorded in the ledger; it does not establish that a source is true. Evaluations do not establish a general accuracy or efficiency gain, and per-pass limits are not a whole-session spending cap. Keep those distinctions when interpreting results.

<details>
<summary><strong>Run the development checks</strong></summary>

```sh
npm test
npm run test:install
npm run lint
```

Browser and runtime prerequisites are in [CONTRIBUTING.md](CONTRIBUTING.md). The offline `node bin/grainulator.js demo` exercises the adapter/verifier protocol without a provider account.

</details>

---

<p align="center">
  Built by <a href="https://grainulation.com">Grainulation</a> ·
  <a href="LICENSE">MIT licensed</a> ·
  <a href="https://github.com/grainulation/grainulator/issues">Issues & ideas</a>
</p>
