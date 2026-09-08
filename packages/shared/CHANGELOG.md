# Changelog

## 1.3.1 — 2026-04-19

Patch: closes the five per-site print blindspots surfaced by the Phase 3
agents (farmer, harvest, orchard, mill, wheat) in the shared
`grainulation-print.css`, and adds a zero-dep cross-link linter for the
ecosystem's `site/llms.txt` discoverability graph. Additive only — no
breaking changes.

- `public/grainulation-print.css` — additive site-specific rule groups:
  - **farmer**: inline `style="color:#fff"` on branded `<strong>` wordmarks
    was invisible on white paper. Now force-blackened via attribute selector
    (handles `#fff` + `#FFFFFF`, with and without post-colon space).
  - **harvest**: `.bar`, `.bar-group`, `.accuracy-chart` now set
    `print-color-adjust: exact` (plus `-webkit-` and pre-spec `color-adjust`
    fallback) so chart bars retain color at print.
  - **orchard**: `.dep-graph`, `.dep-node`, `.node-box` forced to
    transparent background + neutral border + black text; dark-theme CSS
    variables were washing out on white.
  - **mill**: `.term-timeline`, `.term-step`, `.term-cmd`, `.term-dot`,
    `.term-output` now flatten cleanly; `.before-after` collapses to a
    single column to mirror the on-screen mobile rule.
  - **wheat**: `.copy-wrap::before` traffic-light chrome (32 px decorative
    pseudo-element) hidden in print.
  - Header comment expanded to document the per-site `print-local.css`
    override convention; existing rules untouched.
- `@grainulation/barn/llms-txt-lint` — new export + `barn llms-txt-lint`
  CLI subcommand. Zero-dep cross-link linter for ecosystem `site/llms.txt`
  files. Auto-discovers siblings at `../<repo>/site/llms.txt` (override
  with `--root`), parses the markdown structure (H1, blockquote,
  per-section link lists), and flags four issue kinds: **missing-sibling**
  (ecosystem list omits a known sibling), **h1-drift** (H1 disagrees with
  `package.json` name), **description-drift** (same sibling described
  differently across the 8 files, word-overlap threshold), and
  **unfilled** placeholder bleed-through (e.g. a stray `{{SIBLING_LINKS}}`).
  Report-only — never edits any llms.txt file. Markdown to stdout by
  default, `--json` for CI, `--quiet` for summary-only.
- `docs/sync-assets.md` — expanded "Overriding a shared primitive per-site"
  guidance so consumers know when to reach for `print-local.css` vs. when
  to PR upstream to barn.

No breaking changes. Still zero runtime dependencies.

## 1.3.0 — 2026-04-19

Shared SEO / print primitives + vendor-at-build mechanism. Unblocks the
eight per-site SEO adoption sprints (seo-barn, seo-wheat, seo-mill, …) by
giving every consumer one canonical place to pull shared assets from,
with zero CSP loosening.

- `@grainulation/barn/print-css` — new export. Canonical print
  stylesheet (`public/grainulation-print.css`) for every grainulation
  site. Hides nav + ambient animations + copy buttons, reflows to full
  page width, renders black-on-white serif, expands external URLs via
  `a[href]::after`, enforces `page-break-inside: avoid` on cards and
  major sections, reveals collapsed FAQ panels, drops sticky/fixed
  positioning. Safe to ship alongside an existing on-screen stylesheet —
  scoped under `@media print` only.
- `@grainulation/barn/llms-txt-template` — new export. Template for
  per-site `/llms.txt` (LLM discoverability per llmstxt.org). Contains
  `{{SITE_NAME}}`, `{{QUOTABLE_ONE_LINER}}`, `{{OVERVIEW}}`, `{{REPO}}`,
  `{{SITE_URL}}`, `{{SIBLING_LINKS}}` placeholders. Follows the
  llmstxt.org spec exactly: H1 title, blockquote summary, descriptive
  paragraphs, H2-delimited link lists, Optional section. Each site
  creates its concrete `llms.txt` from this once; the template is NOT
  auto-synced (prevents overwriting site-specific content).
- `@grainulation/barn/sync-assets` — new CLI (`barn sync-assets --target
  <dir>`) and ESM export. Zero-dep vendor-at-build mechanism using only
  `node:fs`, `node:crypto`, `node:path`. Copies shared primitives (print
  CSS, tokens CSS, status-icons SVG) from `barn/public/` into a
  consumer's `site/` dir. Idempotent: sha256-hash equality means the
  copy is skipped. `--strict` flag exits non-zero on any drift instead
  of overwriting, useful in CI. `--dry-run` and `--verbose` flags
  supported. Wired into `bin/barn.js` dispatcher so `npx
  @grainulation/barn sync-assets` works.
- `barn/docs/sync-assets.md` — documents the vendor-at-build pattern
  rationale (CSP gate), the consumer integration recipe for
  `pages.yml`, and the procedure for registering new shared primitives.
- Canary applied to barn's own site: inline-SVG favicon replaced with
  `<link rel="icon" href="/apple-touch-icon.png" type="image/png"
  sizes="180x180">`, meta description trimmed from 187 → 158 chars,
  `<link rel="stylesheet" media="print" href="/grainulation-print.css">`
  added, `site/llms.txt` created from the new template,
  `.github/workflows/pages.yml` now runs `node tools/sync-assets.js
  --target ./site` before deploy.

No breaking changes. Existing exports, CLI subcommands, and bin entries
are untouched. Still zero runtime dependencies.

## 1.2.2 — 2026-04-19

Shared MCP crash-safety helper — the battle-tested `uncaughtException` /
`unhandledRejection` pattern from `wheat/lib/serve-mcp.js` extracted into
barn so wheat / mill / silo / farmer MCP servers can all use one canonical
implementation.

- `@grainulation/barn/mcp-crash` — new export. Provides
  `installCrashHandlers({ service, version, onExit, stderr, exit })` which
  registers `uncaughtException` + `unhandledRejection` listeners that emit
  a structured JSON payload to stderr (per MCP 2024-11-05 stdio spec,
  stdout is reserved for JSON-RPC framing), run an optional synchronous
  cleanup hook, and `process.exit(1)` so parent plugin hosts see a clean
  EOF and surface a reload prompt. Recursive-crash fallback exits 2.
  `BARN_MCP_CRASH_TEST=uncaught|unhandled` env hook lets consumers write
  real end-to-end crash tests without monkey-patching `process`. Ships
  both ESM (`lib/mcp-crash.js`) and CJS (`lib/mcp-crash.cjs`) entry points.

Still zero runtime dependencies.

## 1.2.1

Follow-up bundle for the dedup cascade — absorbs two more pieces of
logic that wheat/harvest/orchard had been duplicating, so every
consumer has one source of truth.

- `@grainulation/barn/detect-sprints` — canonical version of the
  git-aware active-sprint picker (438 LOC). Supersedes the simpler
  standalone loader that was previously at `tools/detect-sprints.js`
  (316 LOC); the new version adds `findSprintRoots` + `analyzeSprint`
  exports, batch git queries for dates/counts (~30× faster on
  ≥10 sprints), and ranks by non-archived first, then most-recent
  git activity, then initiated date. Wheat's local copy of this
  module is deleted in a follow-up consumer commit.
- `@grainulation/barn/sprints` — new `findSprintFiles(targetDir)`
  export. Two-level-deep scan for claims.json files, returning
  `{ file, dir, name, cat }` where `cat ∈ { root, archive, active }`.
  harvest and orchard each had a near-identical ~65 LOC
  implementation in their respective dashboard.js files; those are
  deleted in a follow-up consumer commit. Available in both the
  ESM (`lib/sprints.js`) and CJS (`lib/sprints.cjs`) entry points.

Still zero runtime dependencies.

## 1.2.0

Absorb shared utilities previously duplicated across wheat / mill / silo /
harvest / orchard / farmer. Barn now exports six utility modules with both
ESM and CJS entry points via conditional exports:

- `@grainulation/barn/mcp` — JSON-RPC 2.0 helpers (`jsonRpcResponse`,
  `jsonRpcError`, `JSON_RPC_ERRORS`, `parseJsonRpc`, `buildInitializeResult`)
  used by every MCP server in the ecosystem.
- `@grainulation/barn/paths` — path-traversal guards (`isInsideDir`,
  `resolveSafe`, `assertInsideDir`, `relativeInside`) with separator-aware
  prefix checking to avoid `/foo` matching `/foo-bar`.
- `@grainulation/barn/atomic` — `atomicWrite` / `atomicWriteJSON` with
  tmp-file cleanup on error.
- `@grainulation/barn/cli` — shared `setVerbose` / `vlog` / `parseFlags` /
  `flag` / `flagList` / `loadJSON` / `isFlag` for CLI tools.
- `@grainulation/barn/phases` — canonical phase-prefix map
  (`PHASE_PREFIXES`, `PHASE_NAMES`, `isValidPhase`, `phaseFromClaimId`,
  `prefixForPhase`).
- `@grainulation/barn/sprints` — per-sprint loaders
  (`loadSprintClaims`, `loadSprintCompilation`, `sprintSummary`, `summarize`)
  that complement the existing `detectSprints` active-sprint picker.

All modules ship both `lib/*.js` (ESM) and `lib/*.cjs` (CJS) variants;
package.json exports use `{ "import": ..., "require": ... }` conditional
resolution so CJS consumers (mill, silo, harvest, orchard) and ESM
consumers (wheat, farmer) both work without shimming.

Still zero runtime dependencies.

## 1.0.0

Initial release.

- 17 built-in HTML templates (brief, explainer, dashboard, slide-deck, RFC, ADR, and more)
- Web template browser with tag filtering, source/preview/info tabs
- `detect-sprints` tool for finding active wheat sprints across repos
- `generate-manifest` for building wheat-manifest.json
- `build-pdf` for Markdown-to-PDF conversion
- SSE live-reload when templates change
- Zero runtime dependencies
