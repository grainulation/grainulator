# Contributing to bean

Thanks for your interest in improving **bean**. bean is a _documentation-only_ skill:
it is Markdown and JSON, with no runtime code, no dependencies, no servers, and no
telemetry. Keep it that way.

## Ground rules

- **Doc-only.** No npm runtime dependencies, no postinstall scripts, no network calls,
  no hooks. The only code in this repo is the smoke test and (optionally) a version
  sync helper.
- **No emojis** in skill text, command output, or manifests.
- **Self-contained.** Reference files live under `skills/bean/references/` and are
  loaded on demand. Do not introduce external fetches at runtime.
- **Provider-neutral core.** The core loop in `SKILL.md` must work on any Claude Code or
  Codex install. Anything that depends on the grainulation stack goes in
  `references/grainulation.md` and must degrade gracefully when that stack is absent.

## Before you open a PR

1. `npm run format` — format all Markdown/JSON with Prettier.
2. `npm test` — the smoke test validates the plugin manifests and skill frontmatter.
3. If you changed the version, update it in `package.json`, `.claude-plugin/plugin.json`,
   `.claude-plugin/marketplace.json`, and `.codex-plugin/plugin.json` together, and add
   a `CHANGELOG.md` entry.

## Design philosophy

bean shapes the _procedure_ a model follows; it does not raise the model's capability
ceiling. New guardrails should earn their place by catching a real failure mode — not by
adding ceremony. When in doubt, prefer a smaller, sharper skill.
