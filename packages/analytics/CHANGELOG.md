# Changelog

## 1.1.5 — 2026-04-20

### Fixed

- **`harvest serve` dashboard 404.** `lib/server.js:548-550` reads `PUBLIC_DIR/index.html` at runtime, but `public/` was not declared in `package.json#files`, so the directory was absent from published tarballs 1.1.0–1.1.4. Any user running `npx @grainulation/harvest serve` hit `HTTP 500: Error reading dashboard`. Added `"public/"` to the `files` array. The dev loop was always green because the file exists locally — only installed users were affected.

### Internal

- Added `test/tarball.test.js` regression test that asserts `public/index.html` (and every other load-bearing file) is present in `npm pack --dry-run` output AND after extracting a real tarball. Prevents the same drift class from recurring silently.

## 1.1.4 — 2026-04-19

### Security

- **Symlink-safe static serve.** The `public/` static file guard previously used `path.resolve()` + `startsWith()`, which could be bypassed by a symlink planted inside `public/` pointing at e.g. `/etc`. Replaced with `resolveSafe()` from `@grainulation/barn/paths`, which resolves via `fs.realpathSync` and rejects symlink escape. Defense in depth — no known exploit against the prior guard.

### Internal

- CI: install dependencies before running tests
- CI: allow `@grainulation/*` in the zero-dependency gate

## 1.1.3 — 2026-04-19

(Production-polish sprint release — SBOM + OIDC provenance; security-remediation prescriptions shipped.)

## 1.1.2 -- 2026-04-18

### Added

- `--version` flag support in the harvest CLI

### Changed

- Refactored CLI to use `@grainulation/barn/cli` vlog

### Removed

- Dead code and unused imports flagged by eslint audit
- Dead `lib/templates.js` (zero imports)

### Docs

- Added SECURITY.md
- README honesty pass (production polish), expanded `.gitignore` to cover `.env`, deleted a stale artifact

## 1.1.1 -- 2026-04-11

### Changed

- Landing copy: metrics-from-compiler narrative
- Updated wheat ecosystem chip and added tagline to footer

### Fixed

- DeepWiki docs link (was broken)
- Wheat chip label shortened from "evidence compiler" to "compiler"

### Internal

- Removed JSDoc URLs from `farmer.js`
- Removed `publish.yml` (manual publishing); CI skips publish when the version already exists on npm
- Trimmed npm tarball — removed local-only files from the package

## 1.1.0 -- 2026-04-11

Security hardening release.

### Security

- Path traversal guard added to the static server (Rx-7)
- CSP meta tag added (Rx-6)

### Internal

- Missing runtime files added to `.gitignore` (Rx-10)

## 1.0.4 -- 2026-04-09

### Security

- Bearer token auth added to the `farmer.js` client (P0 blind-spot fix)
- `.farmer-token` and runtime files added to `.gitignore` (Rx-003)

### Fixed

- Node 18 → 20 on the landing page

### Docs

- npm badge now shows the full scoped package name

## 1.0.3 -- 2026-03-22

### Fixed

- CI: reverted `type: module` (broke CJS tests); applied Biome lint fixes

## 1.0.2 -- 2026-03-22

### Added

- Token tracker, wrapped report, and integration into the `report` command

### Changed

- DeepWiki badge, static license badge, and `type: module` consistency pass
- Aligned `engines.node` to `>=20` (removed `.0.0` suffix)

## 1.0.1 -- 2026-03-20

### Changes

- `harvest serve` now serves the web app dashboard (`public/index.html`) instead of server-generated template HTML
- Removed dead code: `SSE_SCRIPT` injection, `injectSSE()`, unused `buildHtml`/`loadDashboardSprints` imports
- Added `harvest serve` and `harvest connect farmer` documentation to README

## 1.0.0 -- 2026-03-16

Initial release.

- Sprint analytics dashboard with bar charts and velocity tracking
- Cross-sprint analysis and comparison views
- Prediction calibration scoring
- Knowledge decay detection
- Claim type distribution and evidence tier breakdown
- SSE live updates
