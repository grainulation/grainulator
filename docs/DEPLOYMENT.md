# Website ownership and local research

Public websites are maintained and deployed from [grainulation/infra](https://github.com/grainulation/infra). The canonical product website is https://grainulator.dev. Its static playground exports sessions but never runs models or collects provider keys. The infrastructure repository owns the old-domain redirects and website build/browser checks.

This repository ships the local research application in `public/`. Its shared session and evidence modules are used by both the CLI and the local browser UI; they are runtime assets, not a marketing website. Future changes to the public playground must be coordinated with the corresponding static copy in infra to preserve the session format.

The imported component marketing sites and browser dashboards have been removed, along with their HTTP servers and `serve` commands. The local research playground, generated reports (including analytics retrospectives and offline portfolio dashboards), reusable report templates, and shared export assets remain supported. Historical hashes in `docs/source-imports.json` describe the original imports; they are retained as provenance rather than a current file inventory.

## MCP container

The Docker build checks the portable package inventory and integrity manifest, then copies only the extracted package into its runtime image. It needs no external runtime dependency installation. Both the package and the Docker context exclude local research state; rebuild the source identity with `npm run build:identity` after changing shipped files. An unexpected package member fails the build instead of entering the image.

The image starts the MCP server on standard input/output. Mount the intended workspace and set the server directory explicitly, for example:

```sh
docker build -t grainulator .
docker run --rm -i -v "$PWD:/workspace" grainulator mcp --dir /workspace
```

## Local playground

```sh
grainulator preview
```

From a checkout use `npm run dev` or `node bin/grainulator.js preview`. Open http://127.0.0.1:4517/playground/. The root URL redirects there. `GRAINULATOR_PORT` selects another loopback port. No sibling organization website is required or served.

The local server exposes the loopback research API and accepts provider keys from the local page or configured environment. Keys remain excluded from session exports. A session exported from the public website can be imported here or resumed with `grainulator research --session session.json --dir ./research-session`.

## Checks

```sh
npm test
npm run test:playground
npm run build:identity
npm run check:package
npm run test:install
```

The playground check requires Playwright Chromium (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`). It starts and stops its own loopback server, simulates providers without charges, and checks session import/export, cancellation, safe formatting, keyboard controls, and four responsive widths. The report is `.dogfood/playground-results.json`.

The installed-package test verifies that the marketing sources are absent while research commands and runtime assets remain available. No website build step is needed to package or run Grainulator.

## Migration merge gate

Keep the website extraction PR in draft until the infra deployment has been reviewed, the canonical product site and legacy paths work over HTTPS, and redirects from grainulator.app preserve paths and queries. Retain the old hosting configuration for rollback until the cutover passes. Removing the Pages workflow from this source tree does not itself move DNS or prove a deployment succeeded.

The website handoff source is Grainulator commit `7c4555ad7287eaf6e3d3510b9ddac76136ccc143`. Infra records its own resulting revision and deployment evidence. No release or production cutover is performed by this change.
