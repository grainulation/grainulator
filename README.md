<p align="center">
  <img src="site/glitchy.png" alt="Glitchy — the Grainulator mascot" width="200">
</p>

<p align="center">
  <a href="https://grainulator.app"><img src="https://img.shields.io/badge/site-grainulator.app-8df6ff?style=flat" alt="site"></a>
  <a href="https://www.npmjs.com/package/@grainulation/grainulator"><img src="https://img.shields.io/npm/v/@grainulation/grainulator" alt="npm version"></a>
  <a href="https://github.com/grainulation/grainulator/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://github.com/grainulation/grainulator/actions"><img src="https://github.com/grainulation/grainulator/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://deepwiki.com/grainulation/grainulator"><img src="https://deepwiki.com/badge.svg" alt="Explore on DeepWiki"></a>
</p>

<p align="center"><strong>Research sprint orchestrator for Claude Code.</strong></p>

Grainulator turns Claude Code into a research workstation. Ask a question, get a decision-ready brief. Every finding tracked, challenged, and confidence-graded.

Under the hood it orchestrates the [grainulation](https://github.com/grainulation/grainulation) OSS toolchain (wheat, mill, silo) plus DeepWiki for codebase-aware research — all packaged as a single Claude Code plugin.

## Install

```bash
claude plugin install grainulator
```

Or add to your project's `.claude/settings.json` for team-wide deployment:

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

## Skills

| Skill | Description |
|-------|-------------|
| `/init` | Start a new research sprint |
| `/research` | Multi-pass investigation with evidence gathering |
| `/challenge` | Adversarial testing of a claim |
| `/witness` | Corroborate a claim against an external source |
| `/brief` | Generate a compiled decision brief |
| `/status` | Sprint dashboard snapshot |
| `/present` | Generate a presentation deck |
| `/blind-spot` | Structural gap analysis |

## The ecosystem

Grainulator is part of the [grainulation](https://github.com/grainulation/grainulation) ecosystem. Eight tools. Each does one thing. Use what you need.

| Tool | What it does | Install |
|------|-------------|---------|
| [wheat](https://github.com/grainulation/wheat) | Research engine. Grow structured evidence. | `npx @grainulation/wheat init` |
| [farmer](https://github.com/grainulation/farmer) | Permission dashboard. Approve AI actions in real time. | `npm i -g @grainulation/farmer` |
| [barn](https://github.com/grainulation/barn) | Shared tools. Templates, validators, sprint detection. | `npm i -g @grainulation/barn` |
| [mill](https://github.com/grainulation/mill) | Format conversion. Export to PDF, CSV, slides. | `npm i -g @grainulation/mill` |
| [silo](https://github.com/grainulation/silo) | Knowledge storage. Reusable claim libraries and packs. | `npm i -g @grainulation/silo` |
| [harvest](https://github.com/grainulation/harvest) | Analytics. Cross-sprint patterns and prediction scoring. | `npm i -g @grainulation/harvest` |
| [orchard](https://github.com/grainulation/orchard) | Orchestration. Multi-sprint coordination and dependencies. | `npm i -g @grainulation/orchard` |
| [grainulation](https://github.com/grainulation/grainulation) | Unified CLI. Single entry point to the ecosystem. | `npm i -g @grainulation/grainulation` |

**You don't need all eight.** Start with `claude plugin install grainulator`. That's it.

## Architecture

- **Plugin manifest**: `.claude-plugin/plugin.json`
- **MCP servers**: wheat (claims), mill (output conversion), silo (knowledge store), DeepWiki (codebase research)
- **Skills**: Prompt-engineered markdown files in `skills/<name>/SKILL.md`
- **Agent**: Autonomous sprint subagent in `agents/grainulator.md`
- **Hooks**: Auto-compile on claim mutation, write-guard on `.wheat/`

## Enterprise deployment

Three levels:

1. **Team lead**: Commit `.claude/settings.json` with `enabledPlugins` to your repo
2. **IT admin**: Deploy managed settings via MDM with pre-approved permissions
3. **Air-gapped**: Use `CLAUDE_CODE_PLUGIN_SEED_DIR` with the plugin baked into container images

## Zero dependencies

Every grainulation tool runs on Node built-ins only. No npm install waterfall. No left-pad. No supply chain anxiety.

## License

MIT
