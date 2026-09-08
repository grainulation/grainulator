# Changelog

## 1.1.2 -- 2026-04-18

### Docs

- Added SECURITY.md and CODE_OF_CONDUCT.md
- Production polish: `publishConfig`, `.env` and `.idea` ignored

### Internal

- Removed unused imports flagged by eslint audit
- Biome and prettier formatting passes (CI lint fix)

## 1.1.1 -- 2026-04-11

### Changed

- Landing copy: contrast hero, build-system anchor, concrete zero-dep framing, corrected compiler card
- Applied witness and blind-spot landing copy fixes to the grainulation hub

### Fixed

- Removed orphaned `workspaces` field (`packages/` does not exist)
- Centered tool card content (logo + description)
- Forced 4x2 tool card grid (was auto-fill)
- Balanced tool card grid and added spacing from separator
- Added padding to before/after comparison cards

### Internal

- Removed `publish.yml` (manual publishing); CI skips publish when the version already exists on npm
- Biome formatting on `server.mjs`
- Trimmed npm tarball — removed local-only files from the package

## 1.1.0 -- 2026-04-11

Security hardening release.

### Security

- Converted `execSync` to `execFileSync` across grainulation (addresses Socket AI-risk alert)
- Removed `postinstall` script (Socket install-scripts alert)
- Moved inline `require()` calls to top-level (Socket AI-anomaly alert)
- CSP meta tag added (Rx-6)
- `shell: true` removed from spawn calls (Rx-5)
- `.farmer-token` and runtime files added to `.gitignore` (Rx-003)

### Fixed

- Removed Grainulator from the ecosystem site — back to 8 tools
- Node 18 → 20 on the landing page and in CONTRIBUTING
- Grainulator re-added as the 9th tool; version updated in the footer

### Removed

- Broken scorecard workflow (`ossf/scorecard-action@v2` is unavailable)

### Internal

- Missing runtime files added to `.gitignore` (Rx-10)

### Docs

- npm badge now shows the full scoped package name

## 1.0.2 -- 2026-03-22

### Fixed

- CI: reverted `type: module` (broke CJS tests); applied Biome lint fixes

## 1.0.1 -- 2026-03-22

Published to npm — removed `private: true` flag.

### Added

- CI pipeline, git hooks, and workspace setup (dx)
- `/batch` skill for cross-repo change dispatch
- Real `favicon.svg` and `WebSite` structured data (SEO)
- `robots.txt` and `sitemap.xml` (SEO)
- Mermaid flowchart replacing the ASCII journey diagram
- README polish: badges, consistent structure, ecosystem links

### Changed

- DeepWiki badge, static license badge, and `type: module` consistency pass
- Farmer description updated to mention admin + viewer roles; switched to SSE framing
- Replaced favicon and apple-touch-icon with the new grain logo

### Fixed

- Wave-1 code review fixes — pre-commit hook + CI matrix (x065, x069)
- `doctor` subprocess calls now have timeouts to prevent CI hangs on Node 22
- Open Graph image updated — correct brand colors, bracket logo, exact nav logo rendered via puppeteer
- PNG og-image and apple-touch-icon for link-preview support

### Performance

- Instant rendering on mobile — no animations, no blur, no orbs
- Disabled backdrop-filter and ambient animation; simplified reveal transitions on mobile

## 1.0.0 -- 2026-03-16

Initial release.

- Unified ecosystem CLI aggregating all grainulation tools
- Tool aggregation dashboard with ecosystem navigation grid
- Cross-tool health checks
- Sprint overview across all tools
- Global controls for ecosystem-wide operations
