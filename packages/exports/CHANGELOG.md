# Changelog

## 1.1.4 — 2026-04-19

### Added

- MCP crash safety via `@grainulation/barn/mcp-crash` — `uncaughtException` and `unhandledRejection` on the stdio server path now emit structured JSON to stderr and exit(1) so Claude Code sees a clean EOF and can reload the transport.

### Changed

- Bumped `@grainulation/barn` to `^1.2.2`.

## 1.1.2 — 2026-04-18

### Changed

- Refactored to extract `format-shared` helpers and use `@grainulation/barn` for MCP JSON-RPC

### Fixed

- Wired `formats-esm.test.js` into `npm test` and skipped shared modules in the test harness
- Corrected `exports` map — formats are `.mjs`, not `.js`
- Resolved variable shadowing flagged by eslint audit
- DeepWiki docs link (was broken)
- Wheat chip label shortened from "evidence compiler" to "compiler"

### Docs

- Added SECURITY.md
- README honesty pass (production polish), added `publishConfig`, expanded `.gitignore` to cover `.env`

## 1.1.1 — 2026-04-11

### Changed

- Landing copy: export-focused hero, compiler framed as context rather than pitch
- Updated wheat ecosystem chip and added tagline to footer

### Fixed

- Included tokens CSS in the npm tarball (was missing after the `server.js` exclusion)

### Internal

- Extracted PDF worker script to address a Socket AI-anomaly alert
- Excluded `server.js` and `public/` from the npm tarball — reduces Socket network+URL alerts
- Removed `publish.yml`; CI skips publish when the version already exists on npm

## 1.1.0 — 2026-04-11

Security hardening release.

### Security

- Fixed PDF exporter template injection (Rx-2)
- MCP paths are now contained to the workspace (Rx-8)
- CSP meta tag added (Rx-6)
- `.farmer-token` and runtime files added to `.gitignore` (Rx-003)

### Internal

- Missing runtime files added to `.gitignore` (Rx-10)

## 1.0.4 — 2026-03-31

### Fixed

- Backfill claim content from `claims.json` when `compilation.json` lacks it (previously broke export for slim compilations)

## 1.0.3 — 2026-03-31

### Fixed

- Renamed format modules to `.mjs` — fixes Node 18 ESM import in a CJS package
- Resolved remaining `.js` → `.mjs` references in `bin/mill.js`, `lib/server.js`, and tests
- Format discovery was filtering on `.js` only, so 25 formats were invisible — now filters `.mjs`
- Node 18 → 20 in CONTRIBUTING and landing page; dev UI footer shows correct version

### Docs

- npm badge now shows the full scoped package name

## 1.0.2 — 2026-03-22

### Fixed

- CI: reverted `type: module` (broke CJS tests); applied Biome lint fixes

## 1.0.1 — 2026-03-22

### Added

- Improved accessibility and Confluence export across output formats
- SEO: `robots.txt` and `sitemap.xml`
- README polish: badges, consistent structure, ecosystem links

### Changed

- Aligned `engines.node` to `>=20`
- DeepWiki badge, static license badge, and `type: module` consistency pass
- Governance files (CODE_OF_CONDUCT, CONTRIBUTING) included in the npm package

### Fixed

- FAQ questions with inline logos now wrap in `<span>` for proper flex alignment
- FAQ logo spacing: removed `space-between`, used `gap: 4px` + `margin-left: auto`
- Open Graph image updated — correct brand colors, bracket logo, exact nav logo rendered via puppeteer
- PNG og-image and apple-touch-icon for link-preview support

### Performance

- Instant rendering on mobile — no animations, no blur, no orbs
- Disabled backdrop-filter and ambient animation; simplified reveal transitions on mobile

## 1.0.0

Initial release.

- 24 export formats (CSV, Markdown, JSON-LD, NDJSON, BibTeX, RIS, YAML, SQL, GraphML, DOT, and more)
- Web workbench UI with format preview, copy, and download
- SSE live-reload when source files change
- `mill serve` with `--source` flag for cross-directory compilation reading
- `mill export`, `mill convert`, `mill publish`, `mill formats` CLI commands
- Zero runtime dependencies
