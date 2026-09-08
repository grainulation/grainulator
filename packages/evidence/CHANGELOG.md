# Changelog

All notable changes to this project will be documented in this file.

## 1.1.8 — 2026-04-20

### Fixed

- `fix(pkg): include public/ in npm tarball` — the dashboard UI served by `wheat serve` has been 404'ing on `/` since 1.0.1, when `public/` was silently dropped from the `files` array in `package.json`. `public/index.html` (the 63KB dashboard template) is now shipped again, so `npx @grainulation/wheat serve` renders the dashboard instead of returning HTTP 404.

### Internal

- New test `test/tarball.test.js` asserts that every load-bearing runtime file (including `public/index.html`, `lib/server.js`, `lib/serve-mcp.js`, the CLI bins, and the compiler bundle) appears in `npm pack --dry-run --json` output AND survives a real `npm pack` + `tar xzf` roundtrip. Prevents this class of packaging regression forever — zero new dependencies, Node built-ins only.

## 1.1.7 — 2026-04-19

### Changed

- `lib/serve-mcp.js` now adopts `@grainulation/barn/mcp-crash#installCrashHandlers` in place of the ~84-line inline crash handler added in 1.1.6. Behaviour is unchanged (structured JSON on stderr, exit 1 on `uncaughtException` / `unhandledRejection`) but every Grainulation MCP server now shares identical semantics.
- Test-only env hook renamed from `WHEAT_MCP_CRASH_TEST` to `BARN_MCP_CRASH_TEST` to match the cross-service helper.

### Fixed

- `toolDeepwiki` now attaches `res.on("error")` alongside the existing `data`/`end` listeners. A mid-stream `ECONNRESET` (or other `IncomingMessage` error event) is now reported as a clean JSON-RPC error instead of a potentially unhandled `error` event on the response body.

### Internal

- `@grainulation/barn` dep bumped `^1.2.1` → `^1.2.2` (adds the `/mcp-crash` subpath export).

## 1.1.6 — 2026-04-19

### Changed

- `lib/install-prompt.js` routes `~/.grainulation/usage.json` writes through `atomicWriteJSON` from `@grainulation/barn/atomic`. Concurrent wheat invocations can no longer produce a torn JSON on the usage file.

### Fixed

- **Picomatch ReDoS (GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj).** Transitive devDep bumped 2.3.1 → 2.3.2 via `npm audit fix`. DevDep-only (via `@changesets/cli`) — never shipped to consumers; bundle is unchanged.

### Internal

- CI: install dependencies before running the test matrix (fixes subprocess module resolution)
- CI: prettier pass + MCP test harness chunk-safety fix

## 1.1.5 — 2026-04-19

(Production-polish sprint release — SBOM + OIDC provenance; refuted status + atomic writes + barn containment shipped.)

## 1.1.4 — 2026-04-18

### Changed

- Refactored to use `@grainulation/barn` for JSON-RPC, path guards, and CLI verbose logging — consolidates shared utilities across the ecosystem

### Fixed

- Corrected all user-facing references to the `wheat-mcp` invocation
- Corrected MCP package invocation in `wheat init`
- Removed dead code and unused parameters flagged by eslint audit
- Added missing `execFileSync` import in `serve-mcp.js`

### Docs

- Fixed broken `add-claim` example in the README quick-start
- Added SECURITY.md
- README honesty pass (production polish), added `publishConfig`, expanded `.gitignore` to cover `.env`
- CI: fixed zero-dep gate

## 1.1.2 — 2026-04-11

### Changed

- Dropped Node 18 from the CI matrix — `engines` already required `>=20`

### Fixed

- DeepWiki link in docs (was broken)
- Wheat chip label shortened from "evidence compiler" to "compiler"
- Bottom padding added to CTA section (32px)
- Tightened margins around the npx install CTA block and CTA section padding (24px → 8px)

### Internal

- Trimmed npm tarball — removed local-only files from the package

## 1.1.1 — 2026-04-11

### Added

- Revised landing page: contrasting hero, claim definition, before/after, install CTA
- Syntax highlighting on sprint terminal examples

### Changed

- Aligned meta tags, softened the Jake example, updated ecosystem chip, added tagline
- Centralized environment variables to `defaults.js`; removed doc URLs
- Static imports in the wheat CLI — eliminated a computed dynamic import
- Inlined compiler calls — eliminated 4 `child_process` spawns

### Removed

- `publish.yml` workflow — publishing is now manual (token-create-publish-delete)

### Internal

- CI skips publish when the version already exists on npm

## 1.1.0 — 2026-04-11

Security hardening release.

### Security

- CSP meta tag added (Rx-6)
- MCP `dir` parameter is now contained to the workspace (Rx-4)
- Fixed a prefix-collision in directory containment by appending `path.sep` (w105)

### Internal

- Missing runtime files added to `.gitignore` (Rx-10)

### Docs

- Restored CI badge and npm downloads badge

## 1.0.17 — 2026-04-09

### Added

- `claims-ops.js` extracted with new CLI commands: `add`, `search`, `resolve`

### Changed

- README value-prop rewritten per HN feedback (Rx-3)

### Fixed

- P0 onboarding issues (Rx-001, Rx-005)

### Security

- Bearer auth added to the farmer probe and generated hooks (Rx-002)
- `.farmer-token` and runtime files added to `.gitignore` (Rx-003)

## 1.0.16 — 2026-04-06

### Added

- Anti-rationalization tables and personas for the `/challenge`, `/witness`, and `/blind-spot` slash commands

## 1.0.15 — 2026-04-03

### Added

- Optional `dir` parameter on all MCP tool calls for sub-sprint isolation
- Parent-directory sprint detection warning in `wheat init`
- Sub-sprints documentation in README

## 1.0.14 — 2026-04-03

### Added

- MCP Server Troubleshooting section in `templates/claude.md` — every `wheat init` now includes max-2-retry rule, manual re-add command, and `/grainulator:healthcheck` reference

## 1.0.3 — 2026-03-21

### Performance

- **`--quiet` mode** now skips sprint detection and manifest generation (3.5x faster)
- `detect-sprints.js` consolidated from 2 batch git calls to 1

### Docs & Governance

- Added CODE_OF_CONDUCT.md and CONTRIBUTING.md

## 1.0.2 — 2026-03-20

### Performance

- **14x compile speedup** (3.5s to 0.25s) via three changes:
  - Batch git queries in detect-sprints.js (2 calls instead of 32)
  - Export `buildManifest()` from generate-manifest.js for direct import
  - Replace subprocess spawn in wheat-compiler.js with inline `buildManifest()` call
- Slim `compilation.json` — strip claim content from `resolved_claims` (25% smaller, ~17K fewer tokens per read). Build scripts hydrate content from claims.json on demand.

### Changes

- MCP server version now reads from package.json instead of hardcoded constant
- `/brief` defaults to fast next-steps only; full brief is opt-in via `--full` flag

## 1.0.1 — 2026-03-18

### Changes

- `wheat init` now accepts `--non-interactive` as an alias for `--headless`
- MCP server exposes `wheat/init` tool for cross-session sprint bootstrap
- `wheat connect farmer` now also runs `wheat update` (slash commands) and writes sprint paths to `.farmer-config.json`
- Added `/next` slash command -- routes next steps through Farmer for mobile feedback
- 18 slash command templates (was 17)
- Compiler error messages now show expected claim shape when schema violations are detected
- Pre-commit hook prefers local wheat binary over `npx --yes` (addresses Socket supply-chain flag)
- MCP server uses `execFileSync` instead of `execSync` (no shell invocation)

### Docs & Site

- Rewritten landing page copy for clarity -- plain language, no forced analogies
- Added FAQ entries: "What are claims?", "What's a sprint?", "How is this different from Obra?"
- Added structured data for Google rich results: FAQPage, HowTo, enhanced SoftwareApplication schema
- SEO keywords targeting real search queries (architecture decision, ADR, technology evaluation, Claude Code)
- Updated concepts.md with engineering mental model table and sprint definition
- Updated README tagline and "How it works" section
- All docs now reference 18 slash commands

## 1.0.0 — 2026-03-17

First stable release. Published to npm as `@grainulation/wheat`.

## 0.9.0-beta.1 — 2026-03-13

First public beta of Wheat, a research sprint framework for structured decision-making.

### What's included

- **CLI entrypoint** (`bin/wheat.js`) — dispatches `init`, `compile`, `guard`, `status`, `update` subcommands
- **Conversational init** (`lib/init.js`) — interactive, quick (`--question`), and headless (`--headless`) modes for bootstrapping a sprint in any repo
- **Bran compiler** (`compiler/wheat-compiler.js`) — 7-pass compilation pipeline that validates claims, detects conflicts, checks evidence strength, and produces `compilation.json`
- **Sprint detection** (`compiler/detect-sprints.js`) — git-based multi-sprint discovery without config pointers
- **Manifest generator** (`compiler/generate-manifest.js`) — topic-map manifest for AI-assisted codebase navigation
- **Guard hook** (`lib/guard.js`) — PreToolUse hook for Claude Code that blocks output artifact generation unless compilation is fresh and passing
- **Status checker** (`lib/status.js`) — terminal snapshot of sprint health
- **Command updater** (`lib/update.js`) — syncs slash command templates to `.claude/commands/`
- **18 slash command templates** — `/research`, `/prototype`, `/challenge`, `/witness`, `/blind-spot`, `/status`, `/brief`, `/present`, `/feedback`, `/resolve`, `/replay`, `/calibrate`, `/handoff`, `/merge`, `/connect`, `/evaluate`, `/init`, `/next`
- **CLAUDE.md template** — auto-generated AI assistant configuration with intent router
- **Explainer HTML template** — dark scroll-snap presentation template for output artifacts
- **GitHub CI workflow** — tests across Node 18, 20, 22; verifies zero dependencies
- **Zero npm dependencies** — uses only Node built-in modules

### Architecture

```
bin/wheat.js          CLI entrypoint
lib/                  Subcommand handlers (init, compile, guard, status, update)
compiler/             Bran compiler + sprint detection + manifest generation
templates/            CLAUDE.md template, slash commands, HTML templates
```

### Requirements

- Node.js >= 18
- Git (for sprint detection and guard hooks)
