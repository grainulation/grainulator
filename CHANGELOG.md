# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
