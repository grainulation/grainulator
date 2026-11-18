# Grainulator exports Export Formats

Grainulator exports converts sprint artifacts into distributable output formats. Every format is a module in `lib/formats/`.

## Usage

```bash
exports export --format <format> <file> [-o <output>]
exports convert --from <format> --to <format> <file> [-o <output>]
exports publish --target <target> <dir> [-o <output>]
```

## CLI Flags

### `exports export`

| Flag                   | Description                     |
| ---------------------- | ------------------------------- |
| `--format <fmt>`, `-f` | Target export format (required) |
| `-o <path>`            | Output file path                |
| `--json`               | Machine-readable JSON output    |

### `exports convert`

| Flag           | Description                  |
| -------------- | ---------------------------- |
| `--from <fmt>` | Source format (required)     |
| `--to <fmt>`   | Target format (required)     |
| `-o <path>`    | Output file path             |
| `--json`       | Machine-readable JSON output |

### `exports publish`

| Flag                    | Description                  |
| ----------------------- | ---------------------------- |
| `--target <dest>`, `-t` | Publish target (required)    |
| `-o <path>`             | Output path                  |
| `--json`                | Machine-readable JSON output |

### Other commands

| Command                                     | Description                                          |
| ------------------------------------------- | ---------------------------------------------------- |
| `exports formats`                              | List available formats (`--json` for machine output) |
| `exports serve-mcp`                            | Start the MCP server on stdio                        |
| `exports --version`, `-v`                      | Print version                                        |

## Available Formats (24)

These are the export format modules in `lib/formats/`:

| Format            | File                   | Description                   |
| ----------------- | ---------------------- | ----------------------------- |
| bibtex            | `bibtex.js`            | BibTeX bibliography entries   |
| changelog         | `changelog.js`         | Changelog generation          |
| csv               | `csv.js`               | Flat CSV table of claims      |
| dot               | `dot.js`               | Graphviz DOT graph            |
| evidence-matrix   | `evidence-matrix.js`   | Evidence matrix visualization |
| executive-summary | `executive-summary.js` | Executive summary document    |
| github-issues     | `github-issues.js`     | GitHub Issues JSON payloads   |
| graphml           | `graphml.js`           | GraphML graph format          |
| html-report       | `html-report.js`       | Self-contained HTML report    |
| jira-csv          | `jira-csv.js`          | Jira-compatible CSV import    |
| json-ld           | `json-ld.js`           | JSON-LD linked data           |
| markdown          | `markdown.js`          | Clean Markdown document       |
| ndjson            | `ndjson.js`            | Newline-delimited JSON        |
| obsidian          | `obsidian.js`          | Obsidian vault notes          |
| opml              | `opml.js`              | OPML outline                  |
| ris               | `ris.js`               | RIS citation format           |
| rss               | `rss.js`               | RSS feed                      |
| sankey            | `sankey.js`            | Sankey diagram data           |
| slide-deck        | `slide-deck.js`        | Scroll-snap HTML presentation |
| sql               | `sql.js`               | SQL INSERT statements         |
| static-site       | `static-site.js`       | Static site with index page   |
| treemap           | `treemap.js`           | Treemap visualization data    |
| typescript-defs   | `typescript-defs.js`   | TypeScript type definitions   |
| yaml              | `yaml.js`              | YAML export                   |

## Publish Targets

| Target      | Description                                 |
| ----------- | ------------------------------------------- |
| `static`    | Dark-themed static site from sprint outputs |
| `clipboard` | Copy formatted output to system clipboard   |
