# Changelog

## 1.2.3 — 2026-04-19

### Added

- MCP crash safety via `@grainulation/barn/mcp-crash` — `uncaughtException` and `unhandledRejection` on the stdio server path now emit structured JSON to stderr and exit(1) so Claude Code sees a clean EOF and can reload the transport.

### Changed

- Bumped `@grainulation/barn` to `^1.2.2`.

## 1.2.2 — 2026-04-19

### Security

- **Rx-12: CQL injection in Confluence adapter.** `listPages()` and `_findPageByTitle()` interpolated user-supplied `spaceKey`/`title` directly into CQL, relying on `encodeURIComponent` for safety. `encodeURIComponent` only URL-encodes — a value containing `"` or `\` could break out of the CQL literal and append an arbitrary clause. Added `_cqlEscape()` that escapes backslash then double-quote so user-controlled values stay inside the string literal.

### Internal

- CI: install dependencies before running tests
- CI: allow `@grainulation/*` in the zero-dependency gate
- Prettier pass + MCP test harness chunk-safety fix

## 1.2.1 — 2026-04-19

(Release cut during production-polish sprint; see git log for detail — SBOM + OIDC provenance added; security-remediation sprint prescriptions shipped.)

## 1.2.0 — 2026-04-18

### Added

- **Smart-fetch module** — size-efficient HTML extraction with semantic heuristics, bounded LRU cache (atomic writes), regression fixtures with opt-in live mode, and an MCP tool (`silo/smart-fetch`)
- `silo fetch <url>` CLI with `--mode auto|concise|full|meta-only`, `--no-cache`, `--privacy`
- `silo cache stats`, `silo cache clear`, `silo cache purge <domain>` for cache management

### Changed

- LRU eviction now uses a monotonic sequence counter instead of timestamps, avoiding millisecond-precision collisions on rapid-fire writes (falls back to timestamps for legacy entries)
- Refactored to use `@grainulation/barn` for MCP JSON-RPC, path guards, and vlog

### Fixed

- Skip caching on redirect to close B2 fully
- Addressed witness and blind-spot findings from the smart-fetch sprint

### Docs

- Added SECURITY.md
- README honesty pass (production polish), added `publishConfig`, expanded `.gitignore` to cover `.env`

## 1.1.2 — 2026-04-11

### Fixed

- DeepWiki docs link (was broken)
- Wheat chip label shortened from "evidence compiler" to "compiler"

### Removed

- Unused imports and dead code flagged by eslint audit

### Internal

- Trimmed npm tarball — removed local-only files from the package

## 1.1.1 — 2026-04-11

### Changed

- Landing copy: reusability-focused hero, compiler framed as integration context
- Updated wheat ecosystem chip and added tagline to footer
- Moved env var reads from `lib/` to entry points — eliminates a Socket env-var alert

### Internal

- Removed `publish.yml` (manual publishing); CI skips publish when the version already exists on npm

## 1.1.0 — 2026-04-11

Security hardening release.

### Security

- MCP paths are now contained to the workspace (Rx-8)
- CSP meta tag added (Rx-6)

### Internal

- Missing runtime files added to `.gitignore` (Rx-10)

## 1.0.5 — 2026-04-09

### Security

- Validate claims on silo pack ingestion (Rx-004)
- `.farmer-token` and runtime files added to `.gitignore` (Rx-003)

## 1.0.4 — 2026-03-27

### Added

- PR QA Simulation built-in knowledge pack (#1)

### Fixed

- Node 18 → 20 on the landing page and in CONTRIBUTING; MCP server version bumped to `1.0.3` in the code path
- Dev UI footer now shows correct version

### Docs

- npm badge now shows the full scoped package name

## 1.0.3 — 2026-03-25

### Added

- `coverage-ramp` knowledge pack
- Coverage-ramp pack rewritten as v2.0 — tech-agnostic, cleaner onboarding

## 1.0.2 — 2026-03-22

### Fixed

- CI: reverted `type: module` (broke CJS tests); applied Biome lint fixes

## 1.0.1 — 2026-03-22

### Added

- Enterprise knowledge packs, hackathon category packs, and graph search
- SEO: `robots.txt` and `sitemap.xml`
- README polish: badges, consistent structure, ecosystem links
- Governance files (CODE_OF_CONDUCT, CONTRIBUTING) included in the npm package

### Changed

- Aligned `engines.node` to `>=20` (removed `.0.0` suffix)
- DeepWiki badge, static license badge, and `type: module` consistency pass

### Fixed

- Knowledge packs: 3-col layout; key-features top padding; features grid 3x2 with 2 new tiles; bottom padding on the key-features section
- Open Graph image updated — correct brand colors, bracket logo, exact nav logo rendered via puppeteer
- PNG og-image and apple-touch-icon for link-preview support

### Performance

- Instant rendering on mobile — no animations, no blur, no orbs
- Disabled backdrop-filter and ambient animation; simplified reveal transitions on mobile

## 1.0.0

Initial release.

- 11 built-in knowledge packs (compliance, architecture, security, testing, and more)
- Web pack browser with search and claim table
- Store, Search, ImportExport, Templates, and Packs library classes
- `silo pull`, `silo store`, `silo search`, `silo publish` CLI commands
- File-watching with automatic state refresh
- SSE live-reload
- Zero runtime dependencies
