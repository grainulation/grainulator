# Contributing to Grainulator

Thanks for your interest in contributing to the Grainulator plugin.

## What Grainulator is

Grainulator is a Claude Code plugin that packages skills, agents, and
hook wiring for research-sprint workflows. It's distributed via the
grainulation marketplace, not npm.

## Getting started

```bash
git clone https://github.com/grainulation/grainulator.git
cd grainulator
npm install
npm test
```

The plugin expects to run inside Claude Code. For local smoke-testing,
install it as a development plugin:

```bash
# From inside Claude Code
/plugin install /path/to/local/grainulator
```

## Filing issues

- Search existing issues before opening a new one.
- For bugs, include reproduction steps, your Claude Code version, and
  relevant MCP server logs (from `~/.claude/logs/`).
- For feature requests, describe the use case and what existing skill
  or command would have been relevant.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. If you're adding or changing a skill, update the skill's `SKILL.md`
   and any relevant test.
3. Run `npm test`; add tests if you're adding functionality.
4. Keep PRs focused — one change per PR.
5. Use Biome for formatting: `npx biome format --write .` before
   committing (CI enforces this).

## Skills

Skills live in `skills/<name>/SKILL.md`. Each skill is one markdown
file with YAML frontmatter (`name`, `description`, `tools`) and a
prompt body. Keep tools lists minimal — only what the skill actually
needs.

Shared snippets live under `skills/_templates/` (files prefixed `_`
are not loaded as skills). Reference them from a SKILL.md with the
`${CLAUDE_PLUGIN_ROOT}/skills/_templates/<file>` path.

## Version bumps

Grainulator uses `npm version <patch|minor|major>` which runs the
`version` script automatically — it syncs the new version into
`.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
and stages them so the bump commit is complete.

## Security

See `SECURITY.md` for private-disclosure channels.

## Code of conduct

See `CODE_OF_CONDUCT.md`.
