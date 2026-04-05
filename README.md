<p align="center">
  <img src="site/glitchy.png" alt="Glitchy — the Grainulator mascot" width="200">
</p>

<p align="center">
  <a href="https://github.com/grainulation/grainulator/releases"><img src="https://img.shields.io/github/v/tag/grainulation/grainulator?label=version" alt="version"></a>
  <a href="https://grainulator.app"><img src="https://img.shields.io/badge/demo-grainulator.app-8df6ff?style=flat" alt="demo"></a>
  <a href="https://github.com/grainulation/grainulator/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://github.com/grainulation/grainulator/actions"><img src="https://github.com/grainulation/grainulator/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://deepwiki.com/grainulation/grainulator"><img src="https://deepwiki.com/badge.svg" alt="Docs on DeepWiki"></a>
</p>

<p align="center"><strong>Research sprint orchestrator for Claude Code.</strong></p>

Ask a question, get a decision-ready brief. Every finding is tracked as a typed claim, adversarially challenged, confidence-graded, and compiled into self-contained output. Zero third-party dependencies.

## Try it

**[grainulator.app](https://grainulator.app)** — interactive demo with in-browser AI. No install needed.

## Install

### Step 1 — Add the marketplace

```bash
claude plugin marketplace add https://github.com/grainulation/grainulator/blob/main/.claude-plugin/marketplace.json
```

### Step 2 — Install the plugin

```bash
claude plugin install grainulator
```

**Requirements:** Node.js >= 20 (needed for MCP servers that run via npx).

For team-wide deployment, commit to your project's `.claude/settings.json`:

```json
{
  "enabledPlugins": ["grainulator@grainulation-marketplace"]
}
```

## Quick start

Once installed, just talk to Claude:

- **"research how our auth system works"** — runs a multi-pass research sprint
- **"challenge r003"** — adversarial testing of a specific claim
- **"what are we missing?"** — blind spot analysis
- **"write it up"** — generates a compiled brief

No slash syntax required. The intent router detects what you want and runs the right workflow.

## How it works

**Claims** are the unit of knowledge. Every finding from research, challenges, witnesses, and prototypes is stored as a typed claim in `claims.json`.

| Claim type | What it means |
|------------|--------------|
| `constraint` | Hard requirements, non-negotiable boundaries |
| `factual` | Verifiable statements about the world |
| `estimate` | Projections, approximations, ranges |
| `risk` | Potential failure modes, concerns |
| `recommendation` | Proposed courses of action |
| `feedback` | Stakeholder input, opinions |

**Evidence tiers** grade confidence: `stated` → `web` → `documented` → `tested` → `production`.

**The compiler** runs 7 passes over your claims — type coverage, evidence strength, conflict detection, bias scan — and produces a confidence score. If there are unresolved conflicts, it blocks output until you resolve them.

## Skills

| Skill | Description |
|-------|-------------|
| `/init` | Start a new research sprint |
| `/research` | Multi-pass investigation with evidence gathering |
| `/challenge` | Adversarial testing of a claim |
| `/witness` | Corroborate a claim against an external source |
| `/blind-spot` | Structural gap analysis |
| `/brief` | Generate a compiled decision brief |
| `/present` | Generate a presentation deck |
| `/status` | Sprint dashboard snapshot |
| `/pull` | Import knowledge from external sources (DeepWiki, Confluence) |
| `/sync` | Publish artifacts to external targets |
| `/calibrate` | Score predictions against actual outcomes |
| `/resolve` | Adjudicate conflicts between claims |
| `/feedback` | Record stakeholder input |

## Autonomous agent

The **grainulator subagent** (`agents/grainulator.md`) runs multi-pass research sprints autonomously. It reads the compiler output to decide what command to run next — research, challenge, witness, blind-spot — until the sprint reaches decision-ready confidence.

Launch it from Claude Code with: `"research X using grainulator"`.

## Demo site

[grainulator.app](https://grainulator.app) is a PWA that demos the research sprint concept in-browser:

- Mobile-first chat interface — no shader on mobile, dark background
- In-browser AI via WebLLM (SmolLM2-360M, ~200MB download)
- 50 pre-generated demo topics with fuzzy matching (instant Track A)
- Live local inference when model downloads (Track B)
- Conversational responses with progressive claim disclosure
- Compile flow with 7-pass confidence scoring

## Architecture

- **Plugin manifest**: `.claude-plugin/plugin.json`
- **MCP servers**: wheat (claims engine), mill (format conversion), silo (knowledge store), DeepWiki (codebase research)
- **Skills**: `skills/<name>/SKILL.md` — 13 prompt-engineered workflows
- **Agent**: `agents/grainulator.md` — autonomous sprint subagent
- **Hooks**: Auto-compile on claim mutation, write-guard on `claims.json` and `compilation.json`
- **Orchard**: Multi-sprint orchestration via `orchard.json` dependency graphs

## The ecosystem

Part of the [grainulation](https://github.com/grainulation/grainulation) ecosystem. Eight tools, each does one thing.

| Tool | What it does | Install |
|------|-------------|---------|
| [wheat](https://github.com/grainulation/wheat) | Research engine — grow structured evidence | `npx @grainulation/wheat init` |
| [farmer](https://github.com/grainulation/farmer) | Permission dashboard — approve AI actions in real time | `npm i -g @grainulation/farmer` |
| [barn](https://github.com/grainulation/barn) | Shared tools — templates, validators, sprint detection | `npm i -g @grainulation/barn` |
| [mill](https://github.com/grainulation/mill) | Format conversion — export to PDF, CSV, slides | `npm i -g @grainulation/mill` |
| [silo](https://github.com/grainulation/silo) | Knowledge storage — reusable claim libraries and packs | `npm i -g @grainulation/silo` |
| [harvest](https://github.com/grainulation/harvest) | Analytics — cross-sprint patterns and prediction scoring | `npm i -g @grainulation/harvest` |
| [orchard](https://github.com/grainulation/orchard) | Orchestration — multi-sprint coordination | `npm i -g @grainulation/orchard` |
| [grainulation](https://github.com/grainulation/grainulation) | Unified CLI — single entry point | `npm i -g @grainulation/grainulation` |

**You don't need all eight.** Start with `claude plugin install grainulator`. That's it.

## Enterprise deployment

Three levels:

1. **Team lead**: Commit `.claude/settings.json` with `enabledPlugins` to your repo
2. **IT admin**: Deploy managed settings via MDM with pre-approved permissions
3. **Air-gapped**: Use `CLAUDE_CODE_PLUGIN_SEED_DIR` with the plugin baked into container images

## Zero dependencies

Every grainulation tool runs on Node built-ins only. No npm install waterfall. No left-pad. No supply chain anxiety. The MCP servers download on first use via `npx` — no global install required.

## License

MIT
