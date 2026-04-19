<p align="center">
  <img src="site/glitchy.png" alt="Glitchy — the Grainulator mascot" width="200">
</p>

<p align="center">
  <a href="https://grainulator.app"><img src="https://img.shields.io/badge/try_it_live-grainulator.app-ff6b35?style=for-the-badge" alt="Try it live"></a>
</p>

<p align="center">
  <a href="https://github.com/grainulation/grainulator/releases"><img src="https://img.shields.io/github/v/tag/grainulation/grainulator?label=version" alt="version"></a>
  <a href="https://github.com/grainulation/grainulator/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://github.com/grainulation/grainulator/actions"><img src="https://github.com/grainulation/grainulator/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://deepwiki.com/grainulation/grainulator"><img src="https://deepwiki.com/badge.svg" alt="Docs on DeepWiki"></a>
</p>

<h1 align="center">Grainulator</h1>

<p align="center"><strong>Research that compiles.</strong></p>

<p align="center">
Ask a question. Get a multi-pass investigation with typed claims, tension detection, and a confidence-graded answer. Not a chatbot — a research sprint that runs in under 60 seconds.
</p>

---

## What it does

- **Multi-pass investigation** — 3 research passes build evidence from different angles before synthesizing an answer
- **Typed claims, not vibes** — every finding is tagged as factual, constraint, risk, recommendation, or estimate with an evidence tier (stated / web / documented / tested / production)
- **Tension detection** — the compiler finds contradictions between claims and surfaces them before generating output
- **Confidence scoring** — a 7-pass compiler grades evidence strength, type coverage, and bias to produce a 0-100 confidence score

## Try the demo

**[grainulator.app](https://grainulator.app)** runs a sprint in your browser. Type a question, watch three research passes execute, and see the compiled answer with claim breakdown.

What to expect from a single sprint:

| Metric | Typical value |
|--------|---------------|
| Claims generated | 12-16 |
| Claim types | 5 (factual, constraint, risk, recommendation, estimate) |
| Tensions detected | 3-6 |
| Evidence tiers | web, documented, stated |
| Confidence score | 63-68 / 100 |
| Time to answer | 40-70 seconds |

The demo runs client-side to show the pipeline. The real tool (installed as a plugin) uses Claude for substantially higher quality research and deeper evidence.

## Install

**Step 1** — Add the marketplace (one-time):

```bash
claude plugin marketplace add https://github.com/grainulation/grainulator.git
```

**Step 2** — Install:

```bash
claude plugin install grainulator
```

> Inside Claude Code, use `/plugin` instead of `claude plugin`.

That's it. The plugin registers MCP servers, skills, hooks, and an autonomous agent.

**Requirements:** Claude Code with Node.js >= 20.

<details>
<summary><strong>Alternative: clone directly</strong></summary>

```bash
git clone https://github.com/grainulation/grainulator.git ~/.claude/plugins/grainulator
```

```bash
claude plugin add ~/.claude/plugins/grainulator
```

</details>

<details>
<summary><strong>Team deployment</strong></summary>

Commit to your project's `.claude/settings.json`:

```json
{
  "enabledPlugins": ["grainulator@grainulation-marketplace"]
}
```

For air-gapped environments, use `CLAUDE_CODE_PLUGIN_SEED_DIR` with the plugin baked into container images.

</details>

## Troubleshooting

**MCP server disconnected / "tool not found".** Claude Code's MCP
registry occasionally drops stdio-connected servers (sleep, network
hiccup, long-running session). Re-add the affected server:

```bash
claude mcp add wheat  -- npx -y -p @grainulation/wheat  wheat-mcp
claude mcp add mill   -- npx -y    @grainulation/mill   serve-mcp
claude mcp add silo   -- npx -y    @grainulation/silo   serve-mcp
```

Or run `/healthcheck` from any grainulator-enabled session to verify
all three servers are responding and get the exact fix command for
any that aren't.

**Plugin commands not showing up.** Restart Claude Code after
`claude plugin install` — plugin registration is read at startup.

**Permission prompts from hooks.** Grainulator's hooks (pre-compile,
post-claim) need `.claude/settings.json` permission. On first use
Claude Code will prompt; allow, or pre-approve in your user or
project settings.

## How it works

**You ask a question. Grainulator runs a research sprint.**

The sprint has two phases:

### 1. Investigation (3 passes)

Each pass approaches the question from a different angle — constraints, risks, alternatives — and produces typed claims. Claims accumulate in `claims.json`, the sprint's evidence ledger.

### 2. Compilation (7 passes)

The compiler runs seven analysis passes over the collected claims:

1. **Type coverage** — are there enough claim types to avoid blind spots?
2. **Evidence strength** — are claims grounded in documentation, or just stated?
3. **Conflict detection** — do any claims contradict each other?
4. **Bias scan** — is the evidence skewed toward one conclusion?
5. **Gap analysis** — what topics have thin coverage?
6. **Confidence scoring** — weighted score from all the above
7. **Synthesis** — final answer that acknowledges tensions and trade-offs

If unresolved conflicts exist, the compiler blocks output until you resolve them. The confidence score tells you how much to trust the answer.

## Commands

Once installed, just talk to Claude. The intent router detects what you want.

| Say this | Grainulator runs |
|----------|-----------------|
| "research how our auth system works" | Multi-pass research sprint |
| "challenge r003" | Adversarial testing of claim r003 |
| "what are we missing?" | Blind spot analysis |
| "write it up" | Compiled decision brief |
| "make slides" | Presentation deck |
| "where are we?" | Sprint status dashboard |

Or use slash commands directly:

| Command | What it does |
|---------|-------------|
| `/init` | Start a new research sprint |
| `/research` | Multi-pass investigation with evidence gathering |
| `/challenge` | Adversarial testing of a specific claim |
| `/witness` | Corroborate a claim against an external source |
| `/blind-spot` | Structural gap analysis |
| `/brief` | Compiled decision brief |
| `/present` | Presentation deck |
| `/status` | Sprint dashboard |
| `/pull` | Import knowledge from DeepWiki or Confluence |
| `/sync` | Publish artifacts to Confluence |
| `/calibrate` | Score predictions against actual outcomes |
| `/resolve` | Adjudicate conflicts between claims |

## Autonomous agent

The grainulator subagent runs full research sprints without intervention. It reads compiler output to decide what to do next — research, challenge, witness, blind-spot — until confidence is high enough for output.

Launch it: `"research X using grainulator"`

## Architecture

```
grainulator/
  .claude-plugin/     Plugin manifest + permissions
  skills/             13 prompt-engineered workflows
  agents/             Autonomous sprint subagent
  hooks/              Auto-compile on claim mutation
  lib/                Shared utilities
  site/               grainulator.app landing page + demo
```

**MCP servers:** wheat (claims engine), mill (format conversion), silo (knowledge store), DeepWiki (codebase research)

**Hooks:** Auto-compile fires on every claim mutation. Write-guards protect `claims.json` and `compilation.json` from manual edits.

**Orchard:** Multi-sprint orchestration via `orchard.json` dependency graphs for complex investigations that span multiple questions.

## The ecosystem

Grainulator is part of the [grainulation](https://github.com/grainulation/grainulation) ecosystem. Eight tools, each does one thing.

| Tool | What it does |
|------|-------------|
| [wheat](https://github.com/grainulation/wheat) | Research engine — structured evidence |
| [farmer](https://github.com/grainulation/farmer) | Permission dashboard — approve AI actions in real time |
| [barn](https://github.com/grainulation/barn) | Shared tools — templates, validators, sprint detection |
| [mill](https://github.com/grainulation/mill) | Format conversion — PDF, CSV, slides |
| [silo](https://github.com/grainulation/silo) | Knowledge storage — reusable claim libraries |
| [harvest](https://github.com/grainulation/harvest) | Analytics — cross-sprint patterns |
| [orchard](https://github.com/grainulation/orchard) | Orchestration — multi-sprint coordination |
| [grainulation](https://github.com/grainulation/grainulation) | Unified CLI — single entry point |

**You don't need all eight.** `/plugin install grainulator` gives you everything.

## Zero dependencies

Every grainulation tool runs on Node built-ins only. No npm install waterfall. No left-pad. No supply chain anxiety. MCP servers download on first use via `npx`.

## License

MIT
