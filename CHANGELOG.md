# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-04-19

### Added

- **Bearer auth on farmer hooks.** The sprint-status notifier hook now
  attaches a Bearer token when `.farmer-token` is present. Narrow-scope
  tokens ensure admin/viewer credentials can't be reused against hook
  endpoints — aligns grainulator's hook transport with farmer's
  opportunistic-auth hardening.
- **`/healthcheck` host-capability probe.** Checks Claude Code's
  current tool/MCP contract and flags drift before it causes silent
  skill failures. Run before a sprint to verify the environment is
  compatible.

### Fixed

- **Windows hook compatibility.** Inline JS in `hooks.json` silently
  failed on Windows cmd.exe (no fail-closed). Extracted to `.cjs`
  files invoked via `node ${CLAUDE_PLUGIN_ROOT}/hooks/<name>.cjs` so
  Windows runs the same code path as macOS/Linux.
- Port env override now respected by hook scripts.

### Changed

- Skills: extracted shared WCAG checklist so `brief` and `present`
  skills reference one source instead of duplicating.

### Internal

- `.env` added to `.gitignore`.

## [1.6.2] - 2026-04-18

### Added

- `SECURITY.md` — private-disclosure policy via GitHub Security
  Advisories or `security@grainulator.app`, 90-day window, explicit
  scope and credit clauses.
- `CODE_OF_CONDUCT.md` + `CONTRIBUTING.md` — standard OSS files aligned
  with the rest of the ecosystem.
- README "Troubleshooting" section covering MCP server reconnect
  (`claude mcp add wheat|mill|silo ...`) and pointing at the
  `/healthcheck` skill for diagnostics.
- `skills/_templates/wcag-shared.md` — shared WCAG checklist that
  brief + present skills now reference instead of inlining twice.
- `scripts/sync-version.js` — source-of-truth for the 3-way version
  sync (package.json → plugin.json → marketplace.json), wired into
  the `npm version` lifecycle hook so bumps stay in sync.

### Changed

- Bumped `package.json` version from 1.6.0 to 1.6.2 so it matches
  plugin.json and marketplace.json entries; prior drift meant users
  pointing at the git HEAD saw one version while the marketplace
  served another.

### Fixed

- Smart-fetch skill wrote `mcp__silo__smart-fetch` but the runtime
  tool name is `mcp__silo__silo_smart-fetch`. Tool was unreachable.

## [1.3.0] - 2026-04-03

### Added

- `/healthcheck` skill — pre-flight MCP server verification with parallel pings, failure class diagnosis, and fix commands
- Agent definition updated with healthcheck skill reference

## [1.1.0] - 2026-03-31

### Added

- `/setup` skill for post-install MCP server verification and onboarding.
- Privacy policy page (`site/privacy.html`) for marketplace submission.

### Changed

- MCP server source in marketplace.json switched from GitHub SSH to HTTPS git URL.
- Wheat MCP invocation changed from `wheat mcp` subcommand to dedicated `wheat-mcp` binary (fixes connection drops in Claude Code plugin transport).

### Fixed

- `plugin.json`: renamed `mcpConfig` to `mcpServers` (official schema).
- `plugin.json`: added `./` prefix to all paths (required by plugin spec).
- `plugin.json`: explicit agent file path instead of directory glob.
- `hooks.json`: converted to event-keyed object format with `{ hooks: {} }` wrapper for auto-discovery.
- Smoke tests updated to match new plugin schema.
- Biome schema bumped to 2.4.9, template string lint warnings resolved.
- Contact email updated to info@grainulator.app.

## [1.0.0] - 2026-03-21

### Changed

- Removed all pricing and cost references from the landing page and metadata.
- Added focus trap to terminal dialog overlay for keyboard accessibility.
- Final copy polish pass (typography, quotes, dashes).

### Fixed

- Terminal overlay now traps Tab focus and restores focus on close.

## [0.1.0] - 2026-03-21

### Added

- Plugin manifest (`.claude-plugin/plugin.json`) with skills, agents, hooks, and MCP config.
- 9 skills in subdirectory format (`skills/<name>/SKILL.md`):
  - `/init` -- start a new research sprint
  - `/research` -- multi-pass investigation with evidence gathering
  - `/challenge` -- adversarial testing of a specific claim
  - `/witness` -- corroborate a claim against an external source
  - `/brief` -- generate a compiled decision brief
  - `/status` -- sprint dashboard snapshot
  - `/present` -- generate a presentation deck
  - `/blind-spot` -- structural gap analysis
  - `/router` -- intent detection for plain-language messages
- Autonomous sprint agent (`agents/grainulator.md`) with Plan-Compile-Execute loop.
- MCP server configuration for wheat, mill, silo, and DeepWiki.
- Hooks: auto-compile on claim mutation, write-guard on `.wheat/` directory.
- Landing page at `site/index.html` for grainulator.app.
- Smoke tests (`test/smoke.test.js`) validating plugin structure.
- MIT license.
