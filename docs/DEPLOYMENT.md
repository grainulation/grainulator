# Distribution and website ownership

Grainulator ships a CLI, MCP server, native assets and generated report templates. It includes no public web directory, browser playground, privacy page, HTTP preview server or website-asset vendoring route. Public website hosting is maintained separately from this product repository.

Generated reports and the static-site export format are user-owned outputs from evidence; they do not require a bundled website. Imported-source hashes in `source-imports.json` preserve historical provenance rather than describe the current package inventory.

## MCP container

The Docker build verifies the portable package inventory and integrity manifest, then copies only the extracted package into its runtime image. Rebuild source identity with `npm run build:identity` after changing shipped files.

The image starts the MCP server on standard input/output. Mount the intended workspace explicitly:

```sh
docker build -t grainulator .
docker run --rm -i -v "$PWD:/workspace" grainulator mcp --dir /workspace
```

Container source configuration does not establish a tested published container image or live host discovery.

## Source and installed checks

```sh
npm test
npm run test:runtime
npm run build:identity
npm run check:package
npm run test:install
```

Installed acceptance checks package integrity, canonical CLI/MCP operations, headless session preparation/continuation and offline report generation. It also rejects retired browser paths and launchers. No browser download or website build step is required.
