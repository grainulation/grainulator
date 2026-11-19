<p align="center">
  <a href="https://grainulator.dev"><img src="docs/mascot.png" alt="Glitchy — the Grainulator mascot" width="200"></a>
</p>

<h1 align="center">Grainulator</h1>

<p align="center"><strong>Evidence and verification for the model you already use.</strong></p>

<p align="center">
  Keep the evidence. Challenge the answer. Know what to do next.<br>
  A shared workflow for research, engineering, and model-assisted work.
</p>

<p align="center">
  <a href="https://grainulator.dev/"><img src="https://img.shields.io/badge/website-grainulator.dev-98f3ef?style=for-the-badge" alt="See the Grainulator homepage"></a>
</p>

<p align="center">
  <a href="https://github.com/grainulation/grainulator/actions/workflows/ci.yml"><img src="https://github.com/grainulation/grainulator/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI on main"></a>
  <a href="docs/INSTALLATION.md"><img src="https://img.shields.io/badge/node-%E2%89%A524-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24 or later"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
  <a href="https://deepwiki.com/grainulation/grainulator"><img src="https://img.shields.io/badge/docs-DeepWiki-1f6feb" alt="Docs on DeepWiki"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/INSTALLATION.md">Installation</a> ·
  <a href="docs/UPGRADING.md">Upgrading</a> ·
  <a href="docs/TOOLS.md">Tools</a> ·
  <a href="docs/AGENT-SETUP.md">Agent setup</a> ·
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

Grainulator works with Claude Code and Codex through plugins. It also provides a command-line tool and an MCP connection for other agents. You do not need to install its components separately.

## Quick start

Requires **Node.js 24 or later**; Node 24 and 26 LTS are the tested release lines. Node 24 is the development default.

**Upgrading from an earlier version?** Follow the [migration checklist](docs/UPGRADING.md) to update the plugin and keep your existing research data.

```sh
git clone --branch v3.0.1 https://github.com/grainulation/grainulator.git
cd grainulator
npm ci --ignore-scripts
node bin/grainulator.js doctor
```

To use Grainulator inside your agent, follow the **[Claude Code or Codex setup guide](docs/AGENT-SETUP.md)**.

Start a portable research session without making provider calls:

```sh
grainulator research --question "What evidence answers this question?" --dir ./research-session --prepare-only
```

See [CLI research](docs/RESEARCH.md) for provider configuration and checkpoint continuation.

> **Grainulator 3:** one CLI/plugin with a unified configuration and separately verified native runtime assets. Follow [installation](docs/INSTALLATION.md), [upgrading](docs/UPGRADING.md), [configuration](docs/CONFIGURATION.md) and [data retention](docs/UNINSTALL.md). The [shared Homebrew tap](https://github.com/grainulation/homebrew#available-formulae) lists available stable formulas.

### Other agents: connect through MCP

Add an MCP server that runs this command, with your project's absolute path:

```sh
node /absolute/path/to/grainulator/bin/grainulator.js mcp --dir /absolute/path/to/project
```

Antigravity installs the full plugin. See the [agent setup guide](docs/AGENT-SETUP.md) for Antigravity, Cursor and other MCP agents.

For the full Claude Code or Codex plugin, use the **[agent setup guide](docs/AGENT-SETUP.md)**. Codex needs a project folder; the guide shows how to set it. CLI and direct MCP access remain available to other hosts.

Or point your coding agent (Claude Code, Codex, or Antigravity) at this checkout:

```text
Read README.md and AGENTS.md in the Grainulator repository. Run node bin/grainulator.js doctor
and node bin/grainulator.js demo, and report the exit codes and final status lines. Then tell me
which routes below this machine can run, and ask me before starting any model-backed or paid run.
```

| Route | What it does | Needs | Time / Cost |
| --- | --- | --- | --- |
| **1. Local ledger & offline demo** | Runs `doctor`, `demo`, `init`, `add`, and `compile` | Node.js ≥24; no credentials | ~2 s · $0 (no model calls) |
| **2. Managed command verifier** | Runs `grainulator run --adapter ... --verify ...` with soundness-break (`exit 3`) enforcement | Route 1 + local verifier script | Per-round timeout & round cap |
| **3. Host plugin or MCP server** | Connects `add_claim`, `compile`, `resolve`, `memory`, and `exports` to Claude Code, Codex, Antigravity, or MCP hosts | Route 1 + host agent | Host session · $0 Grainulator overhead |
| **4. Semantic & adversarial evals** | Runs `evals/rejected-claims` (offline) or `scripts/evaluate-semantic.mjs` (model-backed) | Route 1 (+ API credentials for live model matrix) | Offline $0 · live matrix requires explicit budget |

## Put it to work

For necessary-premise links, current source checks, recorded verification runs,
audit findings and missing acceptance criteria, see
[evidence maintenance](docs/EVIDENCE-MAINTENANCE.md). Start with
`node bin/grainulator.js maintain --help`; all operations use an explicit sprint.

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
| [Upgrading](docs/UPGRADING.md) | Host updates, renamed tools, existing data, and retired setup instructions. |
| [Agent setup](docs/AGENT-SETUP.md) | Use Grainulator with Claude Code, Codex, or another agent. |
| [Research sessions](docs/RESEARCH.md) | Models, feature controls, credentials, export, and resume. |
| [Tools](docs/TOOLS.md) | The canonical CLI and MCP interface. |
| [Execution adapters](docs/ADAPTERS.md) | Attaching a model command and a task-specific verifier. |
| [Architecture](docs/STRUCTURE.md) | The workspace layout and internal modules. |
| [Evaluation](docs/EVALUATION.md) | What has been measured and what remains unproven. |
| [Contributing](CONTRIBUTING.md) | Development setup, tests, and changes to the project. |

## Verification and limits

CI checks Node 24 and 26, isolated package installation, plugin contracts, Rust runtime conformance, lint, and credential-free CLI/MCP research and export workflows. Native host and live-provider acceptance have separate [verification guides](docs/READINESS.md).

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
