# sync-assets — the vendor-at-build pattern

Shared SEO and print primitives live in `@grainulation/barn/public/`. Every
grainulation site needs them but **cannot load them cross-origin** because
each site ships a strict Content-Security-Policy:

```
default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'
```

No cross-origin `<link href="https://barn.grainulation.com/...">` is allowed.
Instead, each site **vendors** the primitives into its own origin at build
time via the `sync-assets` CLI.

## Why not a CDN?

Three reasons:

1. **CSP gate.** All 8 sites ship `default-src 'self'`. Cross-origin loads
   are blocked. Loosening CSP to allow `barn.grainulation.com` would be a
   coordinated 8-repo change with its own review burden and would open new
   attack surface.
2. **Offline/mirror-friendly.** Same-origin assets work in corporate
   mirrors, behind HTTP proxies, and on air-gapped dev environments. A CDN
   dependency would break these.
3. **Cache simplicity.** Each site's CDN (GitHub Pages) handles its own
   caching with its own Cache-Control headers. No cross-origin cache
   poisoning risk.

## Consumer integration

In each consumer repo's `.github/workflows/pages.yml`, add a step between
`actions/checkout` and `upload-pages-artifact`:

```yaml
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install barn
        run: npm install @grainulation/barn@^1.3.0

      - name: Vendor shared assets
        run: node node_modules/@grainulation/barn/tools/sync-assets.js --target ./site --verbose

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site
```

Then in the site's `<head>`, reference the vendored print CSS:

```html
<link rel="stylesheet" media="print" href="/grainulation-print.css">
```

Tokens CSS is optional — only reference it if the site hasn't inlined its
own design tokens.

## How it works

`sync-assets` uses only Node built-ins (`node:fs`, `node:crypto`,
`node:path`). For each asset in the manifest:

1. Read the source from `barn/public/`.
2. If the target file doesn't exist: copy it.
3. If the target exists, compare sha256 hashes. Equal → skip. Different →
   overwrite (or in `--strict` mode, exit non-zero without writing).

The manifest is an explicit array inside `tools/sync-assets.js` — not a
glob of `public/`. This is deliberate: templates (`llms.txt.template`),
landing HTML (`index.html`), and non-runtime assets must NEVER be synced
blindly.

## Flags

| Flag              | Effect                                                    |
|-------------------|-----------------------------------------------------------|
| `--target <dir>`  | Destination directory. Required. Typically `./site`.      |
| `--strict`        | Fail (exit 1) on any drift instead of overwriting. CI-friendly. |
| `--dry-run`       | Print the plan without writing. Useful for PR review.     |
| `--verbose`       | Log per-asset status (copied/unchanged/overwritten).      |
| `-h, --help`      | Print usage.                                              |

## Current manifest

| Asset                     | Category    | Required? | Notes                               |
|---------------------------|-------------|-----------|-------------------------------------|
| `grainulation-print.css`  | stylesheet  | yes       | Referenced by `<link media="print">`. |
| `grainulation-tokens.css` | stylesheet  | yes       | Optional `<link>` in site head.     |
| `status-icons.svg`        | asset       | optional  | Only needed by dashboard-rendering sites. |

## Adding a new shared primitive

1. Drop the asset in `barn/public/`.
2. Add an entry to the `SYNC_MANIFEST` array at the top of
   `barn/tools/sync-assets.js`.
3. Ship a **minor** bump of `@grainulation/barn` (e.g., 1.3.x → 1.4.0).
4. Update the table above in this doc.
5. Consumers pick it up the next time their pages.yml runs. No per-site
   code change needed for the copy; sites that need to **reference** the
   new asset in their HTML still opt in by hand.

## Overriding a shared primitive per-site

If a specific site needs custom print rules (e.g., hide a site-specific
terminal block), add `site/print-local.css` to that repo and reference it
**after** the shared one:

```html
<link rel="stylesheet" media="print" href="/grainulation-print.css">
<link rel="stylesheet" media="print" href="/print-local.css">
```

Higher source-order wins on equal specificity. `print-local.css` is NOT
vendored — it's site-owned. Do not fork `grainulation-print.css` — if you
need an upstream fix, send a PR to barn instead.

### When to PR upstream vs. ship print-local.css

| Case                                                              | Where it lives                   |
|-------------------------------------------------------------------|----------------------------------|
| Rule benefits every site (e.g., hide a nav pattern all sites use) | upstream in `grainulation-print.css` (PR to barn) |
| Rule is specific to ONE site (niche widget, brand wordmark)       | site-local `print-local.css`     |
| Rule is specific to 2-3 sites with the same DOM class             | upstream; barn owns cross-site   |
| Emergency fix before a stakeholder print                          | site-local first, upstream PR as follow-up |

### Known per-site hardening (absorbed in 1.3.1)

The following blindspots were fixed upstream in `grainulation-print.css` and
therefore do NOT need `print-local.css` in the consumer repos:

| Site    | Hardening applied in 1.3.1                                           |
|---------|----------------------------------------------------------------------|
| harvest | `.bar`, `.accuracy-chart` get `print-color-adjust: exact`            |
| orchard | `.dep-graph` / `.dep-node` / `.node-box` contrast overrides          |
| mill    | `.term-*` blocks flattened; `.before-after` collapses to one column  |
| wheat   | `.copy-wrap::before` traffic-light pseudo-element hidden             |

If you see a regression in one of these areas, first check that your site
has pulled `@grainulation/barn@^1.3.1` via `sync-assets`. If it has and the
bug persists, PR a fix to barn rather than adding a `print-local.css`.

## Failure modes

| Symptom                                    | Cause                                              | Fix                                  |
|--------------------------------------------|----------------------------------------------------|--------------------------------------|
| Deployed site 404s on /grainulation-print.css | Forgot the `sync-assets` step in pages.yml    | Add the step (see above).            |
| `sync-assets: --target is not a directory` | Typo in path or the site/ dir doesn't exist yet    | Check `--target` value.              |
| `MISSING grainulation-print.css (required source not found)` | Consumer installed wrong barn version | Bump `@grainulation/barn` to ^1.3.0. |
| CI fails with exit 1 in `--strict` mode    | Target file diverged from source                   | Remove the divergent file; let sync-assets re-copy. |

## Related

- [Phase 1 SEO audit brief](../../../../seo-audit-baseline/output/seo-audit-baseline-brief.md)
- [llms.txt.template](../public/llms.txt.template)
- [grainulation-print.css](../public/grainulation-print.css)
