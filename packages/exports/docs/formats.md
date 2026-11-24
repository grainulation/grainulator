# Grainulator exports Export Formats

Grainulator converts sprint artifacts into distributable output formats. Every format is a module in `lib/formats/`.

## Usage

```bash
grainulator export export --format <format> <file> [-o <output>]
grainulator export convert --from <format> --to <format> <file> [-o <output>]
grainulator export publish --target <target> <dir> [-o <output>]
```

## CLI Flags

### `grainulator export export`

| Flag                   | Description                     |
| ---------------------- | ------------------------------- |
| `--format <fmt>`, `-f` | Target export format (required) |
| `-o <path>`            | Output file path                |
| `--json`               | Machine-readable JSON output    |

### `grainulator export convert`

| Flag           | Description                  |
| -------------- | ---------------------------- |
| `--from <fmt>` | Source format: `json`, or `html` when converting to Markdown |
| `--to <fmt>`   | Target format (required)     |
| `-o <path>`    | Output file path             |
| `--json`       | Machine-readable JSON output |

### `grainulator export publish`

| Flag                    | Description                  |
| ----------------------- | ---------------------------- |
| `--target <dest>`, `-t` | Publish target (required)    |
| `-o <path>`             | Output path                  |
| `--json`                | Machine-readable JSON output |

### Other commands

| Command                                     | Description                                          |
| ------------------------------------------- | ---------------------------------------------------- |
| `grainulator export formats`                              | List available formats (`--json` for machine output) |
| `grainulator mcp`                              | Start the unified MCP server                        |
| `grainulator --version`                      | Print version                                        |

## Available Data Formats

These are the export format modules in `lib/formats/`:

| Format            | File                   | Description                   |
| ----------------- | ---------------------- | ----------------------------- |
| bibtex            | `bibtex.mjs`            | BibTeX bibliography entries   |
| changelog         | `changelog.mjs`         | Changelog generation          |
| csv               | `csv.mjs`               | Flat CSV table of claims      |
| dot               | `dot.mjs`               | Graphviz DOT graph            |
| evidence-matrix   | `evidence-matrix.mjs`   | Evidence matrix visualization |
| github-issues     | `github-issues.mjs`     | GitHub Issues JSON payloads   |
| graphml           | `graphml.mjs`           | GraphML graph format          |
| jira-csv          | `jira-csv.mjs`          | Jira-compatible CSV import    |
| json              | `json.mjs`             | Complete evidence and provenance |
| json-ld           | `json-ld.mjs`           | JSON-LD linked data           |
| markdown          | `markdown.mjs`          | Clean Markdown document       |
| ndjson            | `ndjson.mjs`            | Newline-delimited JSON        |
| obsidian          | `obsidian.mjs`          | Obsidian vault notes          |
| opml              | `opml.mjs`              | OPML outline                  |
| ris               | `ris.mjs`               | RIS citation format           |
| rss               | `rss.mjs`               | RSS feed                      |
| sankey            | `sankey.mjs`            | Sankey diagram data           |
| sql               | `sql.mjs`               | SQL INSERT statements         |
| treemap           | `treemap.mjs`           | Treemap visualization data    |
| typescript-defs   | `typescript-defs.mjs`   | TypeScript type definitions   |
| yaml              | `yaml.mjs`              | YAML export                   |

## Publish Targets

| Target      | Description                                 |
| ----------- | ------------------------------------------- |
| `clipboard` | Copy formatted output to system clipboard   |

HTML reports, slide decks, static-site publishing and PDF rendering are retired.
Use JSON or Markdown exports with a presentation tool of your choice.
