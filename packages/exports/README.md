# Export module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module converts evidence into reports and interchange formats. The unified MCP tools are `exports_formats`, `exports_convert`, and `exports_preview`; they support current claim and compilation data.

```sh
node bin/grainulator.js export --help
node bin/grainulator.js export formats
node bin/grainulator.js export export --format csv ./research/claims.json -o ./findings.csv
```

The repeated `export` in the CLI example selects the module and then its compatible artifact-export command. For the broader compilation format catalog and inline previews, use the unified MCP tools described in the [tool reference](../../docs/TOOLS.md).

Exports preserve source files, sprint ledgers, compilation, and host configuration. Write reports to an artifact path. Optional PDF conversion can require additional local tools or a dependency download; it is not required for evidence or MCP setup. Publishing and clipboard operations are explicit actions, not automatic steps in the research workflow.

Mill names remain compatibility aliases. No standalone component install is needed. See the [dogfood guide](../../docs/DOGFOOD.md) for local validation.
