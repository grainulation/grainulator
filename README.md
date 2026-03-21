# Grainulator

Research sprint orchestrator for [Claude Code](https://claude.com/claude-code). Structured research with claims, evidence tiers, and compiled output.

**https://grainulator.app**

## What it does

Grainulator turns Claude Code into a research workstation. Say "research how auth works in our repo" and it runs a structured sprint: gathering evidence, tracking claims with evidence tiers, detecting conflicts, and compiling polished briefs.

Under the hood it orchestrates the grainulation OSS toolchain (wheat, mill, silo) plus DeepWiki for codebase-aware research -- all packaged as a single Claude Code plugin.

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

- **"research how our auth system works"** -- runs a multi-pass research sprint
- **"challenge r003"** -- adversarial testing of a specific claim
- **"what are we missing?"** -- blind spot analysis
- **"write it up"** -- generates a compiled brief

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

## Architecture

- **Plugin manifest**: `.claude-plugin/plugin.json`
- **MCP servers**: wheat (claims), mill (output conversion), silo (knowledge store), DeepWiki (codebase research)
- **Skills**: Prompt-engineered markdown files in `skills/`
- **Agent**: Autonomous sprint subagent in `agents/grainulator.md`
- **Hooks**: Auto-compile on claim mutation, write-guard on `.wheat/`

## Enterprise deployment

Three levels of deployment:

1. **Team lead**: Commit `.claude/settings.json` with `enabledPlugins` to your repo
2. **IT admin**: Deploy managed settings via MDM with pre-approved permissions
3. **Air-gapped**: Use `CLAUDE_CODE_PLUGIN_SEED_DIR` with the plugin baked into container images

## License

Apache 2.0
