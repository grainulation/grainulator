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
| `grainulator mcp`                              | Start the unified MCP server                        |
| `exports --version`, `-v`                      | Print version                                        |

## Available Data Formats

These are the export format modules in `lib/formats/`:

| Format            | File                   | Description                   |
| ----------------- | ---------------------- | ----------------------------- |
| bibtex            | `bibtex.js`            | BibTeX bibliography entries   |
| changelog         | `changelog.js`         | Changelog generation          |
| csv               | `csv.js`               | Flat CSV table of claims      |
| dot               | `dot.js`               | Graphviz DOT graph            |
| evidence-matrix   | `evidence-matrix.js`   | Evidence matrix visualization |
| github-issues     | `github-issues.js`     | GitHub Issues JSON payloads   |
| graphml           | `graphml.js`           | GraphML graph format          |
| jira-csv          | `jira-csv.js`          | Jira-compatible CSV import    |
| json              | `json.mjs`             | Complete evidence and provenance |
| json-ld           | `json-ld.js`           | JSON-LD linked data           |
| markdown          | `markdown.js`          | Clean Markdown document       |
| ndjson            | `ndjson.js`            | Newline-delimited JSON        |
| obsidian          | `obsidian.js`          | Obsidian vault notes          |
| opml              | `opml.js`              | OPML outline                  |
| ris               | `ris.js`               | RIS citation format           |
| rss               | `rss.js`               | RSS feed                      |
| sankey            | `sankey.js`            | Sankey diagram data           |
| sql               | `sql.js`               | SQL INSERT statements         |
| treemap           | `treemap.js`           | Treemap visualization data    |
| typescript-defs   | `typescript-defs.js`   | TypeScript type definitions   |
| yaml              | `yaml.js`              | YAML export                   |

## Publish Targets

| Target      | Description                                 |
| ----------- | ------------------------------------------- |
| `clipboard` | Copy formatted output to system clipboard   |

HTML reports, slide decks, static-site publishing and PDF rendering are retired.
Use JSON or Markdown exports with a presentation tool of your choice.
