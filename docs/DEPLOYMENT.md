# Distribution and website ownership

Grainulator ships a CLI, MCP server, native assets and evidence data exports. It includes no public web directory, browser playground, privacy page, HTTP preview server or website-asset vendoring route. Public website hosting is maintained separately from this product repository.

Grainulator exports evidence as JSON, Markdown and data interchange formats. Visual rendering, slide decks, static sites and PDF generation belong to external tools. Imported-source hashes in `source-imports.json` preserve historical provenance rather than describe the current package inventory.

## MCP container

The Docker build verifies the portable package inventory and integrity manifest, then copies only the extracted package into its runtime image. Rebuild source identity with `npm run build:identity` after changing shipped files.

The image starts the compact 15-tool MCP profile on standard input/output. The CLI and bundled plugins retain their legacy 29-tool default. Mount the intended workspace explicitly, preserving the compact selection when overriding Docker's command:

```sh
docker build -t grainulator .
docker run --rm -i -v "$PWD:/workspace" grainulator mcp --dir /workspace --toolset compact
```

Select `--toolset legacy` explicitly in that command when network retrieval, Confluence or memory-graph tools are required. The compact capability boundaries and registry-quality checks are documented in [tool-definition quality](TDQS.md). Container source configuration does not establish a tested published image, live host discovery or a vendor TDQS re-score.

## Source and installed checks

```sh
npm test
npm run test:runtime
npm run build:identity
npm run check:package
npm run test:install
```

Installed acceptance checks package integrity, canonical CLI/MCP operations, headless session preparation/continuation and offline report generation. It also rejects retired browser paths and launchers. No browser download or website build step is required.
