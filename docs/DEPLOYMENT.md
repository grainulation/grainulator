# Static sites and local research

Both sites build locally into `dist/site/` with no bundler, dependency installation, network fetch, or mutation of their authored `site/` assets:

```sh
node scripts/build-site.mjs
```

Run the command from each checkout. The paired preview server injects an explicit product-port marker into the organization homepage so its links reach the paired local product. Authored and generated static HTML carry no marker and retain public links, including when served locally on port 4518.

The Grainulation builder copies its new site directly; it does not run the retired shared-asset generator or package publisher. Historical CLI source remains in that checkout until an explicitly authorized cleanup.

The prepared Pages workflows upload `dist/site/`. They have not been run or deployed. The custom domains in each site's existing `CNAME` are retained. These artifacts target those domain roots; hosting under a repository URL subpath would require a separate base-path configuration.

## Routes

`/playground/` is a real directory with `index.html`. An ordinary static server redirects `/playground` to that directory. `/playground.html` and `/research.html` redirect in the browser and preserve query strings and shared-question hashes. Their HTML includes a usable destination link when JavaScript is unavailable. The homepage retains shared-question and example links. API requests and the playground are excluded from the homepage service worker cache.

## Public execution boundary

The static artifact marks the playground as configuration mode. It makes no `/api/research/*` requests and disables model execution and credential entry. Visitors can choose providers, models and features, inspect the labeled example, import a session, and export configuration or completed work. The page gives two supported continuations:

```sh
grainulator preview
# Open http://127.0.0.1:4517/playground/ and choose Open session.

grainulator research --session session.json --dir ./research-session
```

From a source checkout, replace `grainulator` with `node bin/grainulator.js`. The local preview serves the authored site in local mode and exposes the loopback research API. It accepts a provider key entered on the local page or explicitly configured server environment credentials. The public website never connects across origins to a visitor's local server. Completed passes survive export and import; edits create a fresh research basis. No research backend needs to be deployed with either website.

## Local acceptance

Run these acceptance commands from the full source checkout after installing its development dependencies. The browser test scripts are not included in the installed CLI archive; `scripts/build-site.mjs` is included.

```sh
node scripts/static-site-check.mjs
# With the paired preview stopped, verify the formerly ambiguous port:
node scripts/static-site-check.mjs --organization-port 4518
```

Requires Python 3 and Playwright Chromium (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`). The check builds the product artifact and, when available, the sibling organization artifact. It uses Python's unmodified `SimpleHTTPRequestHandler`, with no SPA fallbacks or API routes, and checks navigation, old links, imported questions, session exports, the static execution boundary, local continuation instructions, missing assets, browser errors, and four viewport widths. The report is `.dogfood/static-site-results.json`.

`npm run test:site` also tests the local preview and its browser workflows. Tests of paid provider execution and model quality are separate from static artifact acceptance. Publishing, custom-domain verification, and CDN propagation remain deployment-time actions and have not been performed by the local build.
